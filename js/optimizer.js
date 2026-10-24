/**
 * optimizer.js — stowage optimiser (branch & bound over tank subsets).
 *
 * Goal (lexicographic, via weights):
 *   1. place the maximum cargo mass              (unplaced MT × 1000)
 *   2. use the minimum number of tanks           (tank × 100) — "min space, max cargo"
 *      … with the least empty volume left in them  (m³ × 0.4) and no slack tanks
 *   3. keep the ship upright                      (P/S moment; cheap while ballast can correct it)
 *   4. stow parcels in P/S pairs, keep slops free (small penalties)
 *   5. list at intermediate load / discharge stages (each parcel alone / each parcel removed)
 * The search runs twice — candidates ordered "pairs first" and "least empty volume first"
 * (cross / diagonal stowage) — and keeps whichever plan scores better.
 * Hard constraints: one parcel per tank, filling limit per parcel (thermal + SG),
 * no common bulkhead between incompatible parcels, locked tanks untouched.
 *
 * For every parcel the candidate tank sets are the *minimal sufficient* subsets
 * (removing any tank leaves the parcel short) plus their P/S-symmetric closures, so
 * the search never wastes a tank. 12 tanks → 4096 subsets, enumerated once per parcel
 * with a capacity DP; the DFS then combines candidates using bitmasks.
 */
(function (global) {
    'use strict';

    // SLACK: per tank, per %-point below the slack threshold (free surface / sloshing).
    // Two tanks at 35 % cost far more than one tank at 70 %.
    const W = { UNPLACED: 1000, TANK: 100, SLOP: 40, UNPAIRED: 15, SLACK: 12, WASTE: 0.4, LIST_LIN: 0.1, STAGE_LIN: 0.05, LIST_OVER: 30 };
    // STAGE: worst list while loading / discharging one parcel at a time (that parcel alone on
    // board, or everything except it). Cross-stowage that puts a whole grade on one side is
    // penalised even when the full ship is upright.
    // List up to `listAllowance` (limit + ballast on the light side) is cheap; beyond that it is near-hard.
    // WASTE: per m³ left empty (up to the fill limit) in tanks that hold cargo — tight fit.
    const DEFAULT_SLACK_PCT = 65;
    // Search width: children tried per parcel at depth 0–1, 2–3, 4+, and candidates kept per ordering.
    // input.search overrides it (the C++ engine's deep search uses a wider tree).
    const SEARCH = { branch: [24, 12, 8], cands: 400 };
    const EPS = 1e-6;

    function bitCount(m) { let c = 0; while (m) { m &= m - 1; c++; } return c; }
    function bitIndex(low) { return 31 - Math.clz32(low); }
    function bitsOf(m) { const out = []; while (m) { const low = m & -m; out.push(bitIndex(low)); m ^= low; } return out; }

    /** Distribute `need` tonnes of a parcel over the tanks in `mask`. Returns Map idx → m³. */
    function distribute(cargo, mask, need, tanks) {
        const idxs = bitsOf(mask);
        const out = new Map();
        const capM = idxs.reduce((s, i) => s + cargo.capMass[i], 0);
        if (capM <= EPS || need <= EPS) return out;
        if (cargo.strategy === 'CONSOLIDATED') {
            // Fill whole P/S pairs to the limit, leave a single slack pair (less free surface).
            const rows = {};
            idxs.forEach(i => { const r = tanks[i].row; (rows[r] = rows[r] || []).push(i); });
            const rowList = Object.values(rows).sort((a, b) =>
                b.reduce((s, i) => s + cargo.capMass[i], 0) - a.reduce((s, i) => s + cargo.capMass[i], 0));
            let rem = need;
            for (const r of rowList) {
                if (rem <= EPS) break;
                const rc = r.reduce((s, i) => s + cargo.capMass[i], 0);
                const f = Math.min(1, rem / rc);
                r.forEach(i => out.set(i, cargo.capVol[i] * f));
                rem -= rc * f;
            }
        } else {
            const f = Math.min(1, need / capM);
            idxs.forEach(i => out.set(i, cargo.capVol[i] * f));
        }
        return out;
    }

    /** %-points below the slack threshold summed over tanks (tanks under 2 % ignored). */
    function slackDepth(pcts, thr) {
        let d = 0;
        pcts.forEach(p => { if (p > 2 && p < thr) d += thr - p; });
        return d;
    }

    function buildCandidates(cargo, tanks, slackPct, keep) {
        const thr = slackPct ?? DEFAULT_SLACK_PCT;
        const n = tanks.length;
        const full = (1 << n) - 1;
        const need = cargo.need;
        const allowed = cargo.allowedMask;
        const cap = new Float64Array(1 << n);
        const pairMaskOf = i => tanks[i].bit | global.TANK_BY_ID[tanks[i].pairId].bit;
        const cands = new Map();
        let minCount = Infinity;

        const evaluate = (m) => {
            if (cands.has(m)) return;
            const idxs = bitsOf(m);
            const f = Math.min(1, need / cap[m]);
            let imb = 0, unpaired = 0, slops = 0;
            idxs.forEach(i => {
                imb += (tanks[i].side === 'P' ? 1 : -1) * cargo.capMass[i] * f;
                if (!(m & pairMaskOf(i) & ~tanks[i].bit)) unpaired++;
                if (tanks[i].slop) slops++;
            });
            const pcts = [...distribute(cargo, m, need, tanks).entries()].map(([i, v]) => v / tanks[i].cap * 100);
            cands.set(m, { mask: m, count: idxs.length, imb, unpaired, slops, slack: slackDepth(pcts, thr), waste: cap[m] - need });
        };

        for (let m = 1; m <= full; m++) {
            if (m & ~allowed) continue;
            const low = m & -m;
            cap[m] = cap[m ^ low] + cargo.capMass[bitIndex(low)];
        }
        if (need <= EPS) return { list: [], minCount: 0, cap };

        for (let m = 1; m <= full; m++) {
            if ((m & ~allowed) || cap[m] < need - EPS) continue;
            let minimal = true;
            for (let r = m; r; r &= r - 1) {
                const b = r & -r;
                if (cap[m ^ b] >= need - EPS) { minimal = false; break; }
            }
            if (!minimal) continue;
            evaluate(m);
            minCount = Math.min(minCount, bitCount(m));
            // P/S-symmetric closure of the minimal set
            let sym = m;
            bitsOf(m).forEach(i => { sym |= pairMaskOf(i); });
            sym &= allowed;
            if (sym !== m) evaluate(sym);
        }

        const all = [...cands.values()];
        const head = (a, b) => (a.count - b.count) || (a.slops - b.slops) || (a.slack - b.slack);
        const byWaste = all.slice().sort((a, b) => head(a, b) || (a.waste - b.waste) || (a.unpaired - b.unpaired) || (Math.abs(a.imb) - Math.abs(b.imb))).slice(0, keep || SEARCH.cands);
        const byPairs = all.slice().sort((a, b) => head(a, b) || (a.unpaired - b.unpaired) || (Math.abs(a.imb) - Math.abs(b.imb)) || (a.waste - b.waste)).slice(0, keep || SEARCH.cands);
        return { list: byWaste, lists: { waste: byWaste, pairs: byPairs }, minCount: Number.isFinite(minCount) ? minCount : bitCount(allowed), cap };
    }

    /**
     * input = {
     *   tanks: CARGO_TANKS,
     *   cargoes: [{ id, need, capVol[], capMass[], allowedMask, strategy }],
     *   conflict(idA, idB) → bool,
     *   fixed: [{ idx, cargoId, mass }],  // locked tanks
     *   baseImb,                         // P−S tonnes not from cargo (ballast)
     *   listLimit, timeMs
     * }
     */
    function run(input) {
        const t0 = Date.now();
        const tanks = input.tanks;
        const timeMs = input.timeMs || 1200;
        const listLimit = input.listAllowance ?? input.listLimit ?? 150;
        const slackPct = input.slackPct ?? DEFAULT_SLACK_PCT;
        const search = Object.assign({}, SEARCH, input.search);
        // Most-constrained parcel first: number of incompatible partners, then volume.
        const live = input.cargoes.filter(c => c.need > 0.01);
        const degree = c => live.filter(o => o !== c && input.conflict(c.id, o.id)).length +
            (input.fixed || []).filter(f => input.conflict(c.id, f.cargoId)).length;
        live.forEach(c => { c.degree = degree(c); });
        const cargoes = live.sort((a, b) => (b.degree - a.degree) || ((b.need / b.mpm) - (a.need / a.mpm)));
        const cf = cargoes.map(a => cargoes.map(b => a !== b && !!input.conflict(a.id, b.id)));

        // P−S moment (t) already on board that the plan must live with, e.g. uneven ballast
        let fixedMask = 0, fixedImb = input.baseImb || 0;
        const fixedOcc = new Array(tanks.length).fill(null);
        const fixedImbBy = new Map();
        (input.fixed || []).forEach(f => {
            fixedMask |= tanks[f.idx].bit;
            fixedOcc[f.idx] = f.cargoId;
            const m = (tanks[f.idx].side === 'P' ? 1 : -1) * f.mass;
            fixedImb += m;
            fixedImbBy.set(f.cargoId, (fixedImbBy.get(f.cargoId) || 0) + m);
        });

        // Static forbidden masks from locked tanks
        const neighborsOf = (mask) => bitsOf(mask).reduce((acc, i) => acc | tanks[i].neighborMask, 0);
        cargoes.forEach(c => {
            c.cand = buildCandidates(c, tanks, slackPct, search.cands);
            c.forbidFixed = 0;
            (input.fixed || []).forEach(f => {
                if (input.conflict(c.id, f.cargoId)) c.forbidFixed |= tanks[f.idx].neighborMask;
            });
        });
        const remMin = new Array(cargoes.length + 1).fill(0);
        for (let k = cargoes.length - 1; k >= 0; k--) remMin[k] = remMin[k + 1] + cargoes[k].cand.minCount;

        let best = null;
        let nodes = 0;
        let timedOut = false;
        let deadline = t0 + timeMs;
        const choice = new Array(cargoes.length);

        function leafScore() {
            const occ = fixedOcc.slice();
            let imb = fixedImb, unplaced = 0, tanksUsed = bitCount(fixedMask), slops = 0, slack = 0, waste = 0;
            const dist = [];
            const imbBy = new Map(fixedImbBy);
            cargoes.forEach((c, k) => {
                const ch = choice[k];
                unplaced += ch.unplaced;
                if (!ch.mask) { dist.push(null); return; }
                const d = distribute(c, ch.mask, c.need - ch.unplaced, tanks);
                dist.push(d);
                d.forEach((vol, i) => {
                    occ[i] = c.id;
                    const m = (tanks[i].side === 'P' ? 1 : -1) * vol * (c.capMass[i] / c.capVol[i]);
                    imb += m;
                    imbBy.set(c.id, (imbBy.get(c.id) || 0) + m);
                    tanksUsed++;
                    if (tanks[i].slop) slops++;
                    waste += Math.max(0, c.capVol[i] - vol);
                    const pct = vol / tanks[i].cap * 100;
                    if (pct > 2 && pct < slackPct) slack += slackPct - pct;
                });
            });
            let unpaired = 0;
            tanks.forEach((t, i) => {
                if (occ[i] == null) return;
                if (occ[global.TANK_BY_ID[t.pairId].idx] !== occ[i]) unpaired++;
            });
            const a = Math.abs(imb);
            let stage = 0;
            if (imbBy.size > 1) imbBy.forEach(m => { stage = Math.max(stage, Math.abs(m), Math.abs(imb - m)); });
            const score = unplaced * W.UNPLACED + tanksUsed * W.TANK + slops * W.SLOP + unpaired * W.UNPAIRED + slack * W.SLACK + waste * W.WASTE +
                a * W.LIST_LIN + Math.max(0, a - listLimit) * W.LIST_OVER +
                stage * W.STAGE_LIN + Math.max(0, stage - listLimit) * W.LIST_OVER;
            return { score, unplaced, tanksUsed, imb, stage, unpaired, slops, slack, waste, dist };
        }

        // Tanks a parcel may not use given what is placed so far (occupied or next to an incompatible parcel)
        function blockedFor(j, k, used, placedMasks) {
            let forbid = cargoes[j].forbidFixed;
            for (let i = 0; i < k; i++) if (placedMasks[i] && cf[j][i]) forbid |= neighborsOf(placedMasks[i]);
            return used | forbid;
        }

        function dfs(k, used, placedMasks, partial) {
            if (timedOut) return;
            if ((++nodes & 1023) === 0 && Date.now() > deadline) { timedOut = true; return; }
            if (k === cargoes.length) {
                const s = leafScore();
                if (!best || s.score < best.score) best = Object.assign(s, { choice: choice.map(x => Object.assign({}, x)) });
                return;
            }
            // Lower bound: tanks still needed + cargo that can no longer fit in what is left for it
            let bound = partial + remMin[k] * W.TANK;
            for (let j = k; j < cargoes.length; j++) {
                const c = cargoes[j];
                const room = c.cand.cap[c.allowedMask & ~blockedFor(j, k, used, placedMasks)];
                if (room < c.need) bound += (c.need - room) * W.UNPLACED;
            }
            if (best && bound >= best.score) return;
            const c = cargoes[k];
            const blocked = blockedFor(k, k, used, placedMasks);
            const branchLimit = search.branch[k < 2 ? 0 : (k < 4 ? 1 : 2)];
            let tried = 0;
            for (const cand of c.cand.list) {
                if (cand.mask & blocked) continue;
                choice[k] = { mask: cand.mask, unplaced: 0 };
                placedMasks[k] = cand.mask;
                dfs(k + 1, used | cand.mask, placedMasks, partial + cand.count * W.TANK);
                if (++tried >= branchLimit || timedOut) break;
            }
            if (tried === 0) {
                // Parcel cannot be fully stowed: best partial (largest free compatible tanks first)
                const avail = c.allowedMask & ~blocked;
                if (avail) {
                    const idxs = bitsOf(avail).sort((a, b) => c.capMass[b] - c.capMass[a]);
                    let m = 0, capSum = 0;
                    for (const i of idxs) { if (capSum >= c.need - EPS) break; m |= tanks[i].bit; capSum += c.capMass[i]; }
                    const unplaced = Math.max(0, c.need - capSum);
                    choice[k] = { mask: m, unplaced };
                    placedMasks[k] = m;
                    dfs(k + 1, used | m, placedMasks, partial + unplaced * W.UNPLACED + bitCount(m) * W.TANK);
                }
                // …or leave it out entirely so others can use the space
                choice[k] = { mask: 0, unplaced: c.need };
                placedMasks[k] = 0;
                dfs(k + 1, used, placedMasks, partial + c.need * W.UNPLACED);
            }
            placedMasks[k] = 0;
        }

        // Pass 1: least empty volume first (allows cross / diagonal stowage); pass 2: P/S pairs first.
        const passes = ['waste', 'pairs'];
        let passStart = t0;
        const passOf = {};
        let anyTimedOut = false;
        passes.forEach((pass, pi) => {
            cargoes.forEach(c => { c.cand.list = c.cand.lists[pass]; });
            timedOut = false;
            passStart = Date.now();
            const budget = (timeMs - (passStart - t0)) / (passes.length - pi);
            deadline = passStart + budget;
            const before = best;
            dfs(0, fixedMask, new Array(cargoes.length).fill(0), 0);
            if (best !== before) passOf.win = pass;
            anyTimedOut = anyTimedOut || timedOut;
        });

        const result = { assignments: {}, unplaced: {}, nodes, ms: Date.now() - t0, timedOut: anyTimedOut, score: best ? best.score : 0 };
        if (best) {
            cargoes.forEach((c, k) => {
                const d = best.dist[k];
                result.assignments[c.id] = d ? [...d.entries()].map(([idx, vol]) => ({ idx, vol })) : [];
                result.unplaced[c.id] = best.choice[k].unplaced;
            });
            Object.assign(result, { tanksUsed: best.tanksUsed, imb: best.imb, stage: best.stage, waste: best.waste, slack: best.slack, pass: passOf.win });
        }
        return result;
    }

    global.Optimizer = { run, distribute, buildCandidates, bitsOf, bitCount, W, DEFAULT_SLACK_PCT, SEARCH };
})(typeof window !== 'undefined' ? window : globalThis);
