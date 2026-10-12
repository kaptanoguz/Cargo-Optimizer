/**
 * planner.js — plan model: derived figures, compliance findings and every edit
 * operation (optimise, set tank amount with rebalance, assign, swap, even-out, maximise).
 * Pure functions over a plain `state` object so the UI can snapshot it for undo/redo.
 *
 * state.plan[tankId] = { cargoId, vol, locked }   vol = observed m³ at load temperature
 */
(function (global) {
    'use strict';

    const { Physics, Compat, Optimizer, VESSEL, CARGO_TANKS, BALLAST_TANKS, TANK_BY_ID } = global;
    const SW_DENSITY = 1.025;
    const EPS = 1e-6;

    function defaultSettings() {
        return {
            basis: 'vac', allowSlops: true, listLimit: 150, rebalance: true, slackPct: 65,
            maxFillPct: VESSEL.maxFillPct, maxSgAtMaxFill: VESSEL.maxSgAtMaxFill, theme: 'auto'
        };
    }

    function newState() {
        return {
            version: 2,
            voyage: { no: '', zone: 'S', dwtRestrict: null },
            settings: defaultSettings(),
            cargoes: [],
            plan: {},
            weights: { constant: 100, fo: 0, mgo: 0, fw: 0, lo: 0 },
            ballast: Object.fromEntries(BALLAST_TANKS.map(b => [b.id, 0]))
        };
    }

    // ── Per-parcel derived data ─────────────────────────────────────────────
    function prep(state, c) {
        const s = state.settings;
        const lim = Physics.fillLimit(c, s);
        const mpm = Physics.massPerM3(c, s.basis);
        const capVol = CARGO_TANKS.map(t => t.cap * lim.pct / 100);
        const capMass = capVol.map(v => v * mpm);
        let allowedMask = 0;
        CARGO_TANKS.forEach(t => {
            if (t.slop && !s.allowSlops) return;
            if (c.heat && !t.heating) return;
            allowedMask |= t.bit;
        });
        if (c.st === 1 && VESSEL.ibcShipType > 1) allowedMask = 0;
        return { lim, mpm, capVol, capMass, allowedMask };
    }

    function cargoById(state, id) { return state.cargoes.find(c => c.id === id); }

    function conflictFn(state) {
        const cache = new Map();
        return (a, b) => {
            const k = a < b ? a + '|' + b : b + '|' + a;
            if (!cache.has(k)) cache.set(k, Compat.pairConflict(cargoById(state, a), cargoById(state, b)));
            return cache.get(k);
        };
    }

    function dwtLimit(state) {
        const base = VESSEL.dwt[state.voyage.zone] || VESSEL.dwt.S;
        const r = parseFloat(state.voyage.dwtRestrict);
        return Number.isFinite(r) && r > 0 ? Math.min(base, r) : base;
    }

    // ── Summary (everything the UI shows) ───────────────────────────────────
    function summarize(state) {
        const preps = {};
        state.cargoes.forEach(c => { preps[c.id] = prep(state, c); });

        const tanks = CARGO_TANKS.map(t => {
            const e = state.plan[t.id];
            const c = e ? cargoById(state, e.cargoId) : null;
            if (!e || !c) return { t, e: null, c: null, vol: 0, pct: 0, mass: 0, mvac: 0, mair: 0, limitPct: state.settings.maxFillPct, maxVol: t.cap * state.settings.maxFillPct / 100 };
            const p = preps[c.id];
            const vol = e.vol;
            return {
                t, e, c, vol,
                pct: vol / t.cap * 100,
                mass: vol * p.mpm,
                mvac: vol * Physics.massPerM3(c, 'vac'),
                mair: vol * Physics.massPerM3(c, 'air'),
                vref: vol * Physics.vcf(c, Physics.loadTemp(c)),
                limitPct: p.lim.pct,
                maxVol: p.capVol[t.idx],
                over: vol > p.capVol[t.idx] + 1e-3,
                locked: !!e.locked
            };
        });
        const byTank = Object.fromEntries(tanks.map(r => [r.t.id, r]));

        const cargoes = state.cargoes.map(c => {
            const rows = tanks.filter(r => r.c && r.c.id === c.id);
            const planned = rows.reduce((s, r) => s + r.mass, 0);
            const vol = rows.reduce((s, r) => s + r.vol, 0);
            const plannedVac = rows.reduce((s, r) => s + r.mvac, 0);
            const plannedAir = rows.reduce((s, r) => s + r.mair, 0);
            return { c, p: preps[c.id], rows, planned, plannedVac, plannedAir, vol, diff: planned - c.qty, tanks: rows.map(r => r.t.short) };
        });

        const cargoMass = tanks.reduce((s, r) => s + r.mass, 0);
        const cargoVol = tanks.reduce((s, r) => s + r.vol, 0);
        const nominal = state.cargoes.reduce((s, c) => s + (c.qty || 0), 0);
        const usable = CARGO_TANKS.reduce((s, t) => s + t.cap * state.settings.maxFillPct / 100, 0);
        const tanksUsed = tanks.filter(r => r.c && r.vol > EPS).length;

        const w = state.weights;
        const constant = parseFloat(w.constant) || 0;
        const bunkers = ['fo', 'mgo', 'fw', 'lo'].reduce((s, k) => s + (parseFloat(w[k]) || 0), 0);
        const consumables = constant + bunkers;
        const ballastRows = BALLAST_TANKS.map(b => {
            const pct = parseFloat(state.ballast[b.id]) || 0;
            return { b, pct, mass: b.cap * pct / 100 * SW_DENSITY };
        });
        const ballastMass = ballastRows.reduce((s, r) => s + r.mass, 0);
        const limit = dwtLimit(state);
        const dwt = cargoMass + consumables + ballastMass;

        // Transverse balance (cargo + ballast) and indicative fore/aft split about No.3/4 bulkhead
        let port = 0, stbd = 0, fwd = 0, aft = 0;
        tanks.forEach(r => {
            if (r.t.side === 'P') port += r.mass; else stbd += r.mass;
            if (r.t.row <= 3) fwd += r.mass; else aft += r.mass;
        });
        ballastRows.forEach(r => {
            if (r.b.side === 'P') port += r.mass; else if (r.b.side === 'S') stbd += r.mass;
        });

        const findings = complianceFindings(state, tanks, byTank, cargoes, { dwt, limit, port, stbd });
        const conflictTanks = new Set();
        findings.forEach(f => (f.tanks || []).forEach(id => conflictTanks.add(id)));

        return {
            preps, tanks, byTank, cargoes, findings, conflictTanks,
            totals: {
                cargoMass, cargoVol, nominal,
                cargoVac: tanks.reduce((s, r) => s + r.mvac, 0), cargoAir: tanks.reduce((s, r) => s + r.mair, 0), usable, tanksUsed, util: cargoVol / usable * 100,
                consumables, constant, bunkers, ballastMass, ballastRows, dwt, limit, margin: limit - dwt,
                cargoCapacity: limit - consumables - ballastMass,
                port, stbd, list: port - stbd, fwd, aft,
                slack: tanks.filter(r => r.c && r.pct > 2 && r.pct < state.settings.slackPct).length
            }
        };
    }

    function complianceFindings(state, tanks, byTank, cargoes, t) {
        const out = [];
        const conflict = conflictFn(state);
        const seen = new Set();
        tanks.forEach(r => {
            if (!r.c || r.vol <= EPS) return;
            if (r.pct > 2 && r.pct < state.settings.slackPct) out.push({ level: 'info', code: 'Slack tank', msg: `${r.t.short} ${r.c.name} at ${r.pct.toFixed(1)} % — free-surface effect / sloshing; consider fewer tanks`, tanks: [r.t.id] });
            r.t.neighbors.forEach(nid => {
                const o = byTank[nid];
                if (!o.c || o.vol <= EPS || o.c.id === r.c.id) return;
                const key = [r.t.id, nid].sort().join('-');
                if (seen.has(key)) return;
                seen.add(key);
                const cf = conflict(r.c.id, o.c.id);
                if (cf) out.push({ level: 'danger', code: cf.code === 'HEAT' ? 'Heat transfer' : 'Segregation', msg: `${r.t.short} ↔ ${o.t.short}: ${cf.msg}`, tanks: [r.t.id, nid] });
            });
            if (r.over) out.push({ level: 'danger', code: 'Overfill', msg: `${r.t.name} ${r.pct.toFixed(1)} % exceeds the ${r.limitPct.toFixed(1)} % limit for ${r.c.name}`, tanks: [r.t.id] });
        });

        if (t.dwt > t.limit + 0.05) out.push({ level: 'danger', code: 'Deadweight', msg: `DWT ${t.dwt.toFixed(1)} t exceeds ${zoneName(state.voyage.zone)} limit ${t.limit.toFixed(1)} t by ${(t.dwt - t.limit).toFixed(1)} t` });
        const list = Math.abs(t.port - t.stbd);
        if (list > state.settings.listLimit) {
            const heavyP = t.port > t.stbd;
            const room = BALLAST_TANKS.filter(b => b.side === (heavyP ? 'S' : 'P'))
                .reduce((s, b) => s + b.cap * (100 - (parseFloat(state.ballast[b.id]) || 0)) / 100 * SW_DENSITY, 0);
            const fix = list - state.settings.listLimit * 0.5;
            out.push({ level: 'warn', code: 'List', msg: `${heavyP ? 'Port' : 'Starboard'} side heavier by ${list.toFixed(1)} t (limit ${state.settings.listLimit} t) — ` +
                (room >= fix ? `take ≈ ${fix.toFixed(0)} t ballast in ${heavyP ? 'STBD' : 'PORT'} WBTs, or re-stow` : `insufficient ${heavyP ? 'STBD' : 'PORT'} ballast — re-stow cargo`) });
        }

        // Intermediate stages: each parcel discharged first (all else on board, ballast unchanged)
        if (cargoes.filter(k => k.rows.length).length > 1) {
            cargoes.forEach(k => {
                if (!k.rows.length) return;
                const own = k.rows.reduce((s, r) => s + (r.t.side === 'P' ? 1 : -1) * r.mass, 0);
                const after = (t.port - t.stbd) - own;
                if (Math.abs(after) > state.settings.listLimit) {
                    out.push({ level: 'info', code: 'Discharge stage', msg: `If ${k.c.name} is discharged first: ${after > 0 ? 'port' : 'stbd'} heavier by ${Math.abs(after).toFixed(0)} t — plan ballast or discharge it together with another grade`, tanks: k.rows.map(r => r.t.id) });
                }
            });
        }

        cargoes.forEach(k => {
            const c = k.c;
            if (k.rows.length && Math.abs(k.diff) > 0.5) {
                out.push({ level: 'warn', code: 'Quantity', msg: `${c.name}: planned ${k.planned.toFixed(1)} t vs nominated ${c.qty.toFixed(1)} t (${k.diff > 0 ? '+' : ''}${k.diff.toFixed(1)} t)` });
            } else if (!k.rows.length && c.qty > 0) {
                out.push({ level: 'warn', code: 'Not stowed', msg: `${c.name} (${c.qty.toFixed(1)} t) has no tanks yet` });
            }
            const lim = k.p.lim;
            if (lim.rule === 'sg') out.push({ level: 'info', code: 'SG limit', msg: `${c.name}: ρ ${lim.rhoL.toFixed(4)} > ${state.settings.maxSgAtMaxFill} → max fill ${lim.pct.toFixed(1)} % (stability booklet)` });
            if (lim.rule === 'thermal') out.push({ level: 'info', code: 'Thermal', msg: `${c.name}: loaded ${Physics.loadTemp(c)} °C, up to ${Physics.voyageMaxTemp(c)} °C on passage → max fill ${lim.pct.toFixed(1)} %` });
            if (c.heat) out.push({ level: 'info', code: 'Heating', msg: `${c.name}: keep ${c.heat[0]}–${c.heat[1]} °C on passage (heating coils on)` });
            if (Number.isFinite(c.minT) && Number.isFinite(c.loadT) && c.loadT < c.minT) out.push({ level: 'warn', code: 'Temperature', msg: `${c.name}: load temp ${c.loadT} °C below minimum ${c.minT} °C (solidification / crystallisation)` });
            if ((c.f || '').includes('I')) out.push({ level: 'info', code: 'Inhibitor', msg: `${c.name}: inhibitor certificate required before departure (IBC 15.13)` });
            if (c.pc === 'X') out.push({ level: 'info', code: 'Annex II', msg: `${c.name}: Category X — prewash before departure from unloading port mandatory` });
            const maxT = Math.max(Physics.loadTemp(c), Physics.voyageMaxTemp(c));
            if (maxT > VESSEL.coatingMaxTemp) out.push({ level: 'danger', code: 'Coating', msg: `${c.name}: ${maxT} °C above Marine-line service limit ${VESSEL.coatingMaxTemp} °C` });
            if (c.st === 1) out.push({ level: 'danger', code: 'Ship type', msg: `${c.name}: requires IBC ship type 1 — not permitted on this vessel` });
        });
        return out;
    }

    function zoneName(z) { return { T: 'Tropical', S: 'Summer', W: 'Winter' }[z] || 'Summer'; }

    /** Ballast (t) that can still be taken on the lighter-to-be side — smaller of the two sides. */
    function ballastRoom(state) {
        const free = side => BALLAST_TANKS.filter(b => b.side === side)
            .reduce((s, b) => s + b.cap * (100 - (parseFloat(state.ballast[b.id]) || 0)) / 100 * SW_DENSITY, 0);
        return Math.min(free('P'), free('S'));
    }

    /** Port minus starboard ballast mass (t); FPT is on the centreline. */
    function ballastImbalance(state) {
        return BALLAST_TANKS.reduce((s, b) => {
            const m = b.cap * (parseFloat(state.ballast[b.id]) || 0) / 100 * SW_DENSITY;
            return s + (b.side === 'P' ? m : b.side === 'S' ? -m : 0);
        }, 0);
    }

    /** Tonnes by which stowing `cargoes` (on top of `fixed` tanks) would exceed the deadweight limit. */
    function dwtExcess(state, cargoes, fixed) {
        const T = summarize(state).totals;
        const fixedMass = fixed.reduce((s, f) => s + f.mass, 0);
        const room = Math.max(0, T.limit - T.consumables - T.ballastMass - fixedMass);
        const total = cargoes.reduce((s, c) => s + c.need, 0);
        return { room, total, excess: Math.max(0, total - room) };
    }

    /** Excess over deadweight if every parcel were optimised as nominated (locked tanks kept). */
    function optimizeDwtExcess(state, opts) {
        const only = opts && opts.only;
        const isFixed = e => e.locked || (only && !only.includes(e.cargoId));
        const fixed = [], lockedMass = {};
        Object.values(state.plan).forEach(e => {
            const c = isFixed(e) && cargoById(state, e.cargoId);
            if (!c) return;
            const mass = e.vol * prep(state, c).mpm;
            fixed.push({ mass });
            lockedMass[c.id] = (lockedMass[c.id] || 0) + mass;
        });
        const cargoes = state.cargoes.filter(c => !only || only.includes(c.id))
            .map(c => ({ need: Math.max(0, c.qty - (lockedMass[c.id] || 0)) }));
        return dwtExcess(state, cargoes, fixed).excess;
    }

    // ── Optimise ────────────────────────────────────────────────────────────
    function optimize(state, opts) {
        const only = opts && opts.only;
        // Locked tanks — and, when re-stowing selected parcels only, every other parcel's tanks — are fixed.
        const isFixed = e => e.locked || (only && !only.includes(e.cargoId));
        const fixed = [];
        const lockedMass = {};
        Object.entries(state.plan).forEach(([tid, e]) => {
            if (!isFixed(e)) return;
            const c = cargoById(state, e.cargoId);
            if (!c) return;
            const p = prep(state, c);
            const t = TANK_BY_ID[tid];
            const mass = e.vol * p.mpm;
            fixed.push({ idx: t.idx, cargoId: c.id, mass });
            lockedMass[c.id] = (lockedMass[c.id] || 0) + mass;
        });
        const conflict = conflictFn(state);
        const cargoes = state.cargoes.filter(c => !only || only.includes(c.id)).map(c => {
            const p = prep(state, c);
            return Object.assign({ id: c.id, need: Math.max(0, c.qty - (lockedMass[c.id] || 0)), strategy: c.strategy, mpm: p.mpm }, p);
        });
        // opts.fitDwt: scale every parcel down by the same factor so the plan stays within deadweight
        const over = dwtExcess(state, cargoes, fixed);
        if (opts && opts.fitDwt && over.excess > 0) {
            const f = over.room / over.total;
            cargoes.forEach(c => { c.need *= f; });
        }
        const input = {
            tanks: CARGO_TANKS,
            cargoes,
            conflict: (a, b) => !!conflict(a, b),
            fixed,
            baseImb: ballastImbalance(state),
            listLimit: state.settings.listLimit,
            listAllowance: state.settings.listLimit + ballastRoom(state),
            slackPct: state.settings.slackPct,
            timeMs: (opts && opts.timeMs) || 1500
        };
        const res = Optimizer.run(input);
        res.dwtCut = opts && opts.fitDwt ? over.excess : 0;
        const plan = {};
        Object.entries(state.plan).forEach(([tid, e]) => { if (isFixed(e)) plan[tid] = e; });
        Object.entries(res.assignments).forEach(([cid, list]) => {
            list.forEach(a => { plan[CARGO_TANKS[a.idx].id] = { cargoId: +cid, vol: a.vol, locked: false }; });
        });
        state.plan = plan;
        return res;
    }

    // ── Manual edit operations ──────────────────────────────────────────────
    function tankLimitVol(state, tankId, c) {
        return TANK_BY_ID[tankId].cap * prep(state, c).lim.pct / 100;
    }

    /** Spread `deltaVol` (signed, m³ of this parcel's density) over other unlocked tanks of the parcel. */
    function absorb(state, c, exceptId, deltaVol) {
        const others = Object.entries(state.plan).filter(([tid, e]) => tid !== exceptId && e.cargoId === c.id && !e.locked);
        if (!others.length || Math.abs(deltaVol) < EPS) return deltaVol;
        let rest = deltaVol;
        for (let pass = 0; pass < 4 && Math.abs(rest) > EPS; pass++) {
            const weights = others.map(([tid, e]) => rest > 0 ? Math.max(0, tankLimitVol(state, tid, c) - e.vol) : e.vol);
            const sum = weights.reduce((s, x) => s + x, 0);
            if (sum < EPS) break;
            const portion = rest;
            others.forEach(([tid, e], i) => {
                const share = portion * weights[i] / sum;
                const max = tankLimitVol(state, tid, c);
                const nv = Math.min(max, Math.max(0, e.vol + share));
                rest -= nv - e.vol;
                e.vol = nv;
            });
        }
        return rest; // what could not be absorbed
    }

    /** Set a tank to `vol` m³. With rebalance the parcel total is kept by moving the difference. */
    function setTankVolume(state, tankId, vol, rebalance) {
        const e = state.plan[tankId];
        if (!e) return { ok: false, msg: 'Tank is empty — choose a parcel first' };
        const c = cargoById(state, e.cargoId);
        const max = tankLimitVol(state, tankId, c);
        const nv = Math.max(0, Math.min(max, vol));
        const clipped = vol > max + 1e-6;
        const delta = nv - e.vol;
        e.vol = nv;
        let msg = clipped ? `Capped at fill limit ${prep(state, c).lim.pct.toFixed(1)} %` : '';
        if (rebalance) {
            const rest = absorb(state, c, tankId, -delta);
            if (Math.abs(rest) > 0.05) {
                const mt = Math.abs(rest) * prep(state, c).mpm;
                const hasOthers = Object.entries(state.plan).some(([tid, o]) => tid !== tankId && o.cargoId === c.id && !o.locked);
                const why = !hasOthers ? `${c.name} has no other unlocked tank —`
                    : rest < 0 ? `Other tanks of ${c.name} empty —` : 'Other tanks full —';
                msg += (msg ? ' · ' : '') + `${why} parcel total ${rest < 0 ? '+' : '−'}${mt.toFixed(1)} t`;
            }
        }
        return { ok: true, msg };
    }

    function setTankMass(state, tankId, mass, rebalance) {
        const e = state.plan[tankId];
        if (!e) return { ok: false, msg: 'Tank is empty' };
        const c = cargoById(state, e.cargoId);
        return setTankVolume(state, tankId, mass / prep(state, c).mpm, rebalance);
    }

    function setTankPct(state, tankId, pct, rebalance) {
        return setTankVolume(state, tankId, TANK_BY_ID[tankId].cap * pct / 100, rebalance);
    }

    function plannedMass(state, c) {
        const mpm = prep(state, c).mpm;
        return Object.values(state.plan).filter(e => e.cargoId === c.id).reduce((s, e) => s + e.vol * mpm, 0);
    }

    /** Put parcel `cargoId` into a tank (null = empty the tank). */
    function assignTank(state, tankId, cargoId, rebalance) {
        const prev = state.plan[tankId];
        if (cargoId == null) {
            if (prev && rebalance) {
                const c = cargoById(state, prev.cargoId);
                const vol = prev.vol;
                delete state.plan[tankId];
                if (c) absorb(state, c, tankId, vol);
            } else delete state.plan[tankId];
            return { ok: true, msg: '' };
        }
        if (prev && prev.cargoId === cargoId) return { ok: true, msg: '' };
        const c = cargoById(state, cargoId);
        if (!c) return { ok: false, msg: 'Unknown parcel' };
        if (prev) assignTank(state, tankId, null, rebalance);
        const max = tankLimitVol(state, tankId, c);
        const mpm = prep(state, c).mpm;
        const short = c.qty - plannedMass(state, c);
        state.plan[tankId] = { cargoId, vol: 0, locked: false };
        if (short > 0.05) {
            state.plan[tankId].vol = Math.min(max, short / mpm);
        } else if (rebalance) {
            evenOut(state, cargoId);
        }
        return { ok: true, msg: '' };
    }

    /** Re-spread the nominated quantity evenly (same %) over the parcel's unlocked tanks. */
    function evenOut(state, cargoId) {
        const c = cargoById(state, cargoId);
        if (!c) return { ok: false };
        const p = prep(state, c);
        const entries = Object.entries(state.plan).filter(([, e]) => e.cargoId === cargoId);
        const locked = entries.filter(([, e]) => e.locked).reduce((s, [, e]) => s + e.vol * p.mpm, 0);
        const free = entries.filter(([, e]) => !e.locked);
        if (!free.length) return { ok: false, msg: 'No unlocked tanks for this parcel' };
        const capM = free.reduce((s, [tid]) => s + p.capMass[TANK_BY_ID[tid].idx], 0);
        const need = Math.max(0, c.qty - locked);
        const f = Math.min(1, need / capM);
        free.forEach(([tid, e]) => { e.vol = p.capVol[TANK_BY_ID[tid].idx] * f; });
        return { ok: true, msg: need > capM + 0.05 ? `${(need - capM).toFixed(1)} t does not fit in the selected tanks` : '' };
    }

    /**
     * Raise the parcel to the most cargo that fits — limited by DWT and by the tanks it
     * holds plus free compatible tanks — using the fewest tanks.
     */
    function maximize(state, cargoId) {
        const c = cargoById(state, cargoId);
        if (!c) return { ok: false };
        const p = prep(state, c);
        const sum = summarize(state);
        const own = sum.cargoes.find(k => k.c.id === cargoId);
        const dwtRoom = sum.totals.limit - (sum.totals.dwt - own.planned);
        const conflict = conflictFn(state);
        let cand = 0, lockedMass = 0, forbid = 0;
        CARGO_TANKS.forEach(t => {
            const e = state.plan[t.id];
            if (e && e.cargoId === cargoId) {
                if (e.locked) lockedMass += e.vol * p.mpm; else cand |= t.bit;
            } else if (e) {
                if (conflict(cargoId, e.cargoId)) forbid |= t.neighborMask;
            } else cand |= t.bit;
        });
        cand &= p.allowedMask;
        cand &= ~forbid | (cand & CARGO_TANKS.filter(t => state.plan[t.id] && state.plan[t.id].cargoId === cargoId).reduce((m, t) => m | t.bit, 0));
        const capAll = Optimizer.bitsOf(cand).reduce((s, i) => s + p.capMass[i], 0);
        const target = Math.max(0, Math.min(capAll, dwtRoom - lockedMass));
        // fewest tanks that hold `target`
        const built = Optimizer.buildCandidates(Object.assign({ need: target, allowedMask: cand }, p), CARGO_TANKS, state.settings.slackPct);
        const mask = built.list.length ? built.list[0].mask : cand;
        Object.keys(state.plan).forEach(tid => { const e = state.plan[tid]; if (e.cargoId === cargoId && !e.locked) delete state.plan[tid]; });
        const dist = Optimizer.distribute(Object.assign({ strategy: c.strategy }, p), mask, target, CARGO_TANKS);
        dist.forEach((vol, i) => { state.plan[CARGO_TANKS[i].id] = { cargoId, vol, locked: false }; });
        c.qty = +(target + lockedMass).toFixed(3);
        const limitedBy = capAll <= dwtRoom - lockedMass ? 'tank space' : 'deadweight';
        return { ok: true, qty: c.qty, limitedBy };
    }

    /** Swap contents of two tanks (drag tank → tank). Volumes are capped to the new limits. */
    function swapTanks(state, a, b, rebalance) {
        const ea = state.plan[a], eb = state.plan[b];
        if ((ea && ea.locked) || (eb && eb.locked)) return { ok: false, msg: 'Tank is locked — unlock it first' };
        delete state.plan[a]; delete state.plan[b];
        const notes = [];
        const place = (tid, e) => {
            if (!e) return;
            const c = cargoById(state, e.cargoId);
            const max = tankLimitVol(state, tid, c);
            state.plan[tid] = { cargoId: e.cargoId, vol: Math.min(e.vol, max), locked: false };
            const lost = e.vol - state.plan[tid].vol;
            if (lost > 0.01) {
                const rest = rebalance ? absorb(state, c, tid, lost) : lost;
                if (rest > 0.01) notes.push(`${(rest * prep(state, c).mpm).toFixed(1)} t of ${c.name} no longer fits`);
            }
        };
        place(b, ea);
        place(a, eb);
        return { ok: true, msg: notes.join(' · ') };
    }

    global.Planner = {
        newState, defaultSettings, prep, summarize, optimize, optimizeDwtExcess, dwtLimit, zoneName,
        setTankVolume, setTankMass, setTankPct, assignTank, evenOut, maximize, swapTanks, plannedMass, cargoById
    };
})(typeof window !== 'undefined' ? window : globalThis);
