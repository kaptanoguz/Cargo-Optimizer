/**
 * app.js — UI controller for Cargo Optimizer Ada.
 * All plan maths lives in planner.js; this file renders state and turns user
 * actions into Planner operations wrapped in undoable commits.
 */
(function () {
    'use strict';

    const { Planner, Physics, Compat, Optimizer, VESSEL, CARGO_TANKS, BALLAST_TANKS, TANK_BY_ID,
        CARGO_DB, CARGO_BY_NAME, PORT_DB, REACTIVE_GROUPS, GROUP_LABEL } = window;

    const STORE_KEY = 'cargoOptimizerAda.v2';
    const UI_KEY = 'cargoOptimizerAda.ui';
    const PORTS_KEY = 'cargoOptimizerAda.recentPorts';
    // Distinct, colour-blind-aware palette readable on dark and light backgrounds
    const PALETTE = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#b07aa1', '#76b7b2', '#edc948', '#ff9da7', '#9c755f', '#2f9fd8', '#8cd17d', '#d37295'];
    const THEMES = [
        { id: 'auto', label: 'Auto (OS)', sw: 'linear-gradient(90deg,#f7f6f2 50%,#11191e 50%)' },
        { id: 'chart', label: 'Chart — paper', sw: 'linear-gradient(90deg,#f7f6f2 70%,#14202e 70% 85%,#c2410c 85%)' },
        { id: 'bridge', label: 'Bridge — dark', sw: 'linear-gradient(90deg,#11191e 70%,#d6dee3 70% 85%,#ff8a3d 85%)' },
        { id: 'night', label: 'Night — red', sw: 'linear-gradient(90deg,#050000 70%,#e05050 70% 85%,#ff4040 85%)' }
    ];
    const ICON = {
        lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
        warn: '<svg viewBox="0 0 24 24"><path d="M12 3 2 21h20zM12 10v5M12 18h.01"/></svg>',
        stop: '<svg viewBox="0 0 24 24"><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M12 8v5M12 16h.01"/></svg>',
        info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>',
        close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>'
    };

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const fmt = (v, d = 1) => Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
    const num = v => { const x = parseFloat(String(v).replace(',', '.')); return Number.isFinite(x) ? x : null; };
    const fold = s => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

    // ── Persistence ─────────────────────────────────────────────────────────
    function readJson(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
    function writeJson(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode */ } }

    // Plan files come from outside (shared between ships / offices). Several cargo fields are
    // written into HTML unescaped, so anything that is not of the expected type is dropped.
    const HEX_COLOR = /^#[0-9a-f]{6}$/i;
    const finiteOrNull = v => Number.isFinite(v) ? v : null;
    function sanitizeCargo(c, i) {
        const out = Object.assign({}, c, {
            color: HEX_COLOR.test(c.color) ? c.color : PALETTE[i % PALETTE.length],
            name: String(c.name ?? ''),
            qty: Number.isFinite(c.qty) ? c.qty : 0,
            ref: Number.isFinite(c.ref) ? c.ref : 15,
            g: ['C', 'P', 'V'].includes(c.g) ? c.g : 'C',
            pc: typeof c.pc === 'string' ? c.pc : '',
            f: typeof c.f === 'string' ? c.f : '',
            st: Number.isFinite(c.st) ? c.st : 0
        });
        ['rg', 'beta', 'maxT', 'minT', 'loadT', 'voyT'].forEach(k => { out[k] = finiteOrNull(c[k]); });
        out.heat = Array.isArray(c.heat) && c.heat.length === 2 && c.heat.every(Number.isFinite) ? c.heat.slice() : null;
        return out;
    }

    /** Copy `src` over `base`, keeping a key only when its type matches the default's. */
    function typedAssign(base, src) {
        Object.keys(base).forEach(k => {
            const v = src && src[k];
            if (v == null) return;
            if (typeof base[k] === 'number') { const x = num(v); if (x != null) base[k] = x; }
            else if (typeof v === typeof base[k]) base[k] = v;
        });
        return base;
    }

    function migrate(s) {
        const base = Planner.newState();
        if (!s || typeof s !== 'object' || !Array.isArray(s.cargoes)) return base;
        const cargoes = s.cargoes.filter(c => c && Number.isFinite(c.id) && Number.isFinite(c.sg)).map(sanitizeCargo);
        const ids = new Set(cargoes.map(c => c.id));
        return {
            version: 2,
            voyage: Object.assign(base.voyage, s.voyage),
            settings: typedAssign(base.settings, s.settings),
            cargoes,
            plan: Object.fromEntries(Object.entries(s.plan || {}).filter(([k, e]) => TANK_BY_ID[k] && e && Number.isFinite(e.vol) && ids.has(e.cargoId))),
            weights: typedAssign(base.weights, s.weights),
            ballast: Object.assign(base.ballast, s.ballast)
        };
    }

    let state = migrate(readJson(STORE_KEY));
    const ui = Object.assign({ unit: 'pct', selected: null, step: 10, stepUnit: 't', theme: 'auto' }, readJson(UI_KEY) || {});
    let undoStack = [], redoStack = [];
    let sum = null;
    let editingId = null;
    let formProduct = null;
    let dragBefore = null;
    let renderQueued = false;

    // ── Commit / undo ───────────────────────────────────────────────────────
    const snap = () => JSON.stringify(state);
    function pushUndo(before) {
        undoStack.push(before);
        if (undoStack.length > 100) undoStack.shift();
        redoStack = [];
    }
    function commit(fn) {
        const before = snap();
        const r = fn();
        if (snap() !== before) pushUndo(before);
        scheduleRender();
        return r;
    }
    function undo() {
        if (!undoStack.length) return;
        redoStack.push(snap());
        state = JSON.parse(undoStack.pop());
        scheduleRender();
        toast('Undone', 'info');
    }
    function redo() {
        if (!redoStack.length) return;
        undoStack.push(snap());
        state = JSON.parse(redoStack.pop());
        scheduleRender();
        toast('Redone', 'info');
    }

    let saveTimer = null;
    function persist() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { writeJson(STORE_KEY, state); writeJson(UI_KEY, ui); }, 250);
    }

    // ── Toasts ──────────────────────────────────────────────────────────────
    function toast(msg, kind) {
        if (!msg) return;
        const el = document.createElement('div');
        el.className = 'toast ' + (kind || '');
        el.textContent = msg;
        $('#toasts').appendChild(el);
        setTimeout(() => el.remove(), kind === 'danger' || kind === 'warn' ? 6000 : 3500);
    }

    // ── Render orchestration ────────────────────────────────────────────────
    // Deferred so that an input's `change` → render never steals focus from the
    // field the user tabbed into; focus is restored by data-key afterwards.
    function scheduleRender() {
        if (renderQueued) return;
        renderQueued = true;
        setTimeout(() => { renderQueued = false; render(); }, 0);
    }

    function withFocus(root, fn) {
        const a = document.activeElement;
        const key = a && root.contains(a) ? a.dataset.key : null;
        const sel = key && a.select && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
        fn();
        if (key) {
            const n = root.querySelector(`[data-key="${CSS.escape(key)}"]`);
            if (n) { n.focus(); if (sel && n.setSelectionRange) try { n.setSelectionRange(sel[0], sel[1]); } catch (e) { /* number inputs */ } }
        }
    }

    function render() {
        sum = Planner.summarize(state);
        applyTheme();
        renderToolbar();
        renderKpis();
        renderShip();
        renderParcels();
        withFocus($('#tankTable'), renderTable);
        withFocus($('#dwtPanel'), renderDwt);
        renderFindings();
        renderDrawer();
        renderPreview();
        persist();
    }

    function applyTheme() {
        const t = THEMES.some(x => x.id === ui.theme) ? ui.theme : 'auto';
        document.documentElement.dataset.theme = t;
    }

    function renderToolbar() {
        $$('#zoneSeg button').forEach(b => b.classList.toggle('on', b.dataset.zone === state.voyage.zone));
        $$('#unitSeg button').forEach(b => b.classList.toggle('on', b.dataset.unit === ui.unit));
        $('#tglRebalance').checked = !!state.settings.rebalance;
        if (document.activeElement !== $('#voyNo')) $('#voyNo').value = state.voyage.no || '';
        if (document.activeElement !== $('#dwtRestrict')) $('#dwtRestrict').value = state.voyage.dwtRestrict ?? '';
        $('#btnUndo').disabled = !undoStack.length;
        $('#btnRedo').disabled = !redoStack.length;
        $('#zoneChip').textContent = `${Planner.zoneName(state.voyage.zone).toUpperCase()} ${fmt(sum.totals.limit, 1)} t`;
    }

    // ── KPIs ────────────────────────────────────────────────────────────────
    function renderKpis() {
        const T = sum.totals;
        const dwtPct = T.dwt / T.limit * 100;
        const dwtCls = T.dwt > T.limit + 0.05 ? 'is-danger' : dwtPct > 98 ? 'is-warn' : '';
        const cargoDiff = T.cargoMass - T.nominal;
        const cargoCls = !state.cargoes.length ? '' : Math.abs(cargoDiff) <= 0.5 ? 'is-ok' : 'is-warn';
        const listAbs = Math.abs(T.list);
        const listCls = listAbs > state.settings.listLimit ? 'is-danger' : listAbs > state.settings.listLimit * .6 ? 'is-warn' : 'is-ok';
        const listW = Math.min(50, listAbs / (state.settings.listLimit * 2) * 50);
        const nD = sum.findings.filter(f => f.level === 'danger').length;
        const nW = sum.findings.filter(f => f.level === 'warn').length;
        const compCls = nD ? 'is-danger' : nW ? 'is-warn' : 'is-ok';
        const k = (cls, label, right, val, sub, bar) => `<div class="kpi ${cls}"><div class="kpi-label"><span>${label}</span><span>${right || ''}</span></div><div class="kpi-val">${val}</div><div class="kpi-sub">${sub}</div>${bar || ''}</div>`;
        $('#kpis').innerHTML = [
            k(cargoCls, 'Cargo', cargoCls === 'is-ok' ? 'as nominated' : cargoCls ? 'differs' : '', `${fmt(T.cargoMass, 1)} <small>t</small>`,
                state.cargoes.length ? `nominated ${fmt(T.nominal, 1)} t · ${cargoDiff >= 0 ? '+' : ''}${fmt(cargoDiff, 1)}` : 'no parcels yet',
                `<div class="bar"><i style="width:${Math.min(100, T.nominal ? T.cargoMass / T.nominal * 100 : 0)}%"></i></div>`),
            k(dwtCls, 'Deadweight', Planner.zoneName(state.voyage.zone), `${fmt(T.dwt, 1)} <small>/ ${fmt(T.limit, 0)} t</small>`,
                T.margin >= 0 ? `${fmt(T.margin, 1)} t remaining` : `${fmt(-T.margin, 1)} t OVER`,
                `<div class="bar"><i style="width:${Math.min(100, dwtPct)}%"></i></div>`),
            k('', 'Volume', '', `${fmt(T.util, 1)} <small>%</small>`, `${fmt(T.cargoVol, 0)} / ${fmt(T.usable, 0)} m³ @ ${state.settings.maxFillPct}%`,
                `<div class="bar"><i style="width:${Math.min(100, T.util)}%"></i></div>`),
            k(T.slack ? 'is-warn' : '', 'Tanks', T.slack ? `${T.slack} slack` : '', `${T.tanksUsed} <small>/ ${CARGO_TANKS.length}</small>`,
                `${CARGO_TANKS.length - T.tanksUsed} free · ${T.slack ? `${T.slack} below ${state.settings.slackPct} % (free surface)` : `none below ${state.settings.slackPct} %`}`,
                `<div class="bar"><i style="width:${T.tanksUsed / CARGO_TANKS.length * 100}%"></i></div>`),
            k(listCls, 'List (P−S)', listAbs < 0.5 ? 'upright' : (T.list > 0 ? 'port' : 'stbd'), `${fmt(listAbs, 1)} <small>t Δ</small>`,
                `P ${fmt(T.port, 0)} t · S ${fmt(T.stbd, 0)} t · limit ${state.settings.listLimit} t`,
                `<div class="bar center"><i style="width:${listW}%;${T.list > 0 ? 'left:auto;right:50%' : ''}"></i></div>`),
            k(compCls, 'Checks', nD ? 'fail' : nW ? 'warn' : 'pass', nD ? `${nD} <small>violation${nD > 1 ? 's' : ''}</small>` : nW ? `${nW} <small>warning${nW > 1 ? 's' : ''}</small>` : '0 <small>issues</small>',
                'segregation · fill · DWT · list', `<div class="bar"><i style="width:${nD || nW ? 100 : 0}%"></i></div>`)
        ].join('');
    }

    // ── Ship plan ───────────────────────────────────────────────────────────
    function tankFigures(r) {
        const pct = `${fmt(r.pct, 1)}%`, t = `${fmt(r.mass, 1)} t`, m3 = `${fmt(r.vol, 1)} m³`;
        if (ui.unit === 't') return [t, `${pct} · ${m3}`];
        if (ui.unit === 'm3') return [m3, `${pct} · ${t}`];
        return [pct, `${t} · ${m3}`];
    }

    function tankHtml(r, forPrint) {
        const t = r.t;
        const sel = !forPrint && ui.selected === t.id;
        const conflict = sum.conflictTanks.has(t.id);
        const cls = ['tank', t.slop ? 'slop' : '', sel ? 'sel' : '', conflict ? 'conflict' : '', r.c ? '' : 'empty'].join(' ');
        const icons = (r.locked ? `<span class="lock" title="Locked">${ICON.lock}</span>` : '') + (conflict ? `<span class="bad" title="Compliance issue">${ICON.warn}</span>` : '');
        let body;
        if (r.c) {
            const [main, sub] = tankFigures(r);
            body = `<div class="tank-cargo">${esc(r.c.name)}</div><div class="tank-fig">${main}</div><div class="tank-sub">${sub}</div>`;
        } else {
            body = `<div class="tank-empty-lbl">EMPTY</div><div class="tank-cap">${fmt(t.cap, 1)} m³</div>`;
        }
        const tip = r.c
            ? `${t.name} — ${r.c.name}\n${fmt(r.pct, 2)} % (limit ${fmt(r.limitPct, 1)} %)\n${fmt(r.vol, 3)} m³ · ${fmt(r.mass, 3)} t`
            : `${t.name} — empty · ${fmt(t.cap, 1)} m³ (100 %)`;
        const gauge = r.c ? `<div class="tank-gauge ${r.over ? 'over' : ''}"><i style="width:${Math.min(100, r.pct)}%"></i><b style="left:${r.limitPct}%"></b></div>` : '';
        return `<div class="${cls}" data-tank="${t.id}" ${forPrint ? '' : `tabindex="0" draggable="${!!(r.c && !r.locked)}"`} title="${esc(tip)}" style="--c:${r.c ? r.c.color : 'transparent'}">
            ${r.c ? '<div class="tank-tint"></div><div class="tank-band"></div>' : ''}
            <div class="tank-body"><div class="tank-top"><span>${t.short}</span><span class="ico">${icons}</span></div>${body}</div>${gauge}
        </div>`;
    }

    function shipHtml(forPrint) {
        // Plan-view hull: transom at x=0, parallel body, bow taper over the last 9 %.
        let h = `<svg class="hull-svg" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
            <path class="outline" d="M 8 0 L 900 0 C 950 0 985 30 1000 50 C 985 70 950 100 900 100 L 8 100 Q 0 100 0 92 L 0 8 Q 0 0 8 0 Z"/>
            <line class="cl" x1="0" y1="50" x2="1000" y2="50"/></svg>`;
        h += `<div class="hull-stern"><span>P</span><span class="acc">ACC · E/R</span><span>S</span></div>`;
        [6, 5, 4, 3, 2, 1].forEach(row => {
            const P = sum.tanks.find(r => r.t.row === row && r.t.side === 'P');
            const S = sum.tanks.find(r => r.t.row === row && r.t.side === 'S');
            h += `<div class="tcol">${tankHtml(P, forPrint)}<div class="tcol-label"><b>${row === 6 ? 'SLOP' : 'No.' + row}</b></div>${tankHtml(S, forPrint)}</div>`;
        });
        h += `<div class="hull-bow"><span>FPT ▸</span></div>`;
        const fr = [20, 35, 50, 65, 80, 95, 110];
        h += `<div class="frames"><span></span>${fr.slice(0, 6).map((f, i) => `<span><i>${f}</i>${i === 5 ? `<i style="left:100%">${fr[6]}</i>` : ''}</span>`).join('')}<span style="text-align:right;padding-right:4px">FR</span></div>`;
        return h;
    }

    function renderShip() {
        $('#ship').innerHTML = shipHtml(false);
    }

    // ── Parcels ─────────────────────────────────────────────────────────────
    /** One line of plain mono text: class · MARPOL cat · ship type · reactive group · temps. */
    function productChips(c) {
        const parts = [{ C: 'CHEM', P: 'OIL', V: 'VEG' }[c.g] || c.g];
        if (c.pc) parts.push(c.pc === 'I' ? 'ANNEX I' : 'CAT ' + esc(c.pc));
        if (c.st) parts.push('ST' + c.st);
        if (c.rg) parts.push(`<span title="${esc(REACTIVE_GROUPS[c.rg] || '')}">GRP ${c.rg}</span>`);
        const vt = Physics.vcfTable(c);
        parts.push(vt ? 'T' + vt : `β ${c.beta || '—'}`);
        if (c.heat) parts.push(`HEAT ${c.heat[0]}–${c.heat[1]}°C`);
        if (Number.isFinite(c.maxT)) parts.push(`≤${c.maxT}°C`);
        if ((c.f || '').includes('I')) parts.push('INHIB');
        return parts.join(' · ');
    }

    function renderParcels() {
        $('#parcelCount').textContent = `${state.cargoes.length} PARCEL${state.cargoes.length === 1 ? '' : 'S'} · ${fmt(state.cargoes.reduce((a, c) => a + c.qty, 0), 1)} t`;
        if (!state.cargoes.length) {
            $('#parcelList').innerHTML = '<div class="empty-note">No parcels yet. Add a product above — SG, filling limit and class are completed automatically.</div>';
            return;
        }
        $('#parcelList').innerHTML = sum.cargoes.map(k => {
            const c = k.c;
            const diffCls = Math.abs(k.diff) <= 0.5 ? 'zero' : k.diff > 0 ? 'pos' : 'neg';
            const anyUnlocked = k.rows.some(r => !r.locked);
            return `<div class="parcel ${editingId === c.id ? 'editing' : ''}" draggable="true" data-parcel="${c.id}" style="--c:${c.color}">
                <div class="p-head">
                    <label class="swatch" title="Change colour"><input type="color" value="${c.color}" data-act="color"></label>
                    <span class="p-name" title="${esc(c.name)}">${esc(c.name)}</span>
                    <span class="p-no">${esc(c.parcelNo || '')}</span>
                </div>
                <div class="p-meta">${productChips(c)}</div>
                ${(c.loadPort || c.dischPort) ? `<div class="p-route">${esc(c.loadPort || '—')} → ${esc(c.dischPort || '—')}</div>` : ''}
                <div class="p-figs">
                    <div><span>Nominated</span><b>${fmt(c.qty, 1)} t</b></div>
                    <div><span>Planned</span><b class="${diffCls}">${fmt(k.planned, 1)} t</b></div>
                    <div><span>${Math.abs(k.diff) <= 0.5 ? 'Volume' : 'Difference'}</span><b class="${diffCls}">${Math.abs(k.diff) <= 0.5 ? fmt(k.vol, 0) + ' m³' : (k.diff > 0 ? '+' : '') + fmt(k.diff, 1) + ' t'}</b></div>
                    <div><span>ρ @ ${fmt(Physics.loadTemp(c), 0)} °C</span><b>${fmt(k.p.lim.rhoL, 4)}</b></div>
                    <div><span>Fill limit</span><b>${fmt(k.p.lim.pct, 1)} %</b></div>
                    <div><span>Tanks</span><b>${k.rows.length || '—'}</b></div>
                </div>
                ${k.rows.length ? `<div class="p-tanks">${k.rows.map(r => `<span class="tchip" data-act="sel" data-tank="${r.t.id}">${r.t.short} ${fmt(r.pct, 0)}%${r.locked ? ' ⌂' : ''}</span>`).join('')}</div>` : ''}
                <div class="p-actions">
                    <button class="link" data-act="stow" title="Stow this parcel into free tanks (others untouched)">stow</button>
                    <button class="link" data-act="max" title="Increase to the most that fits (tank space and DWT)">max</button>
                    <button class="link" data-act="even" title="Spread the nominated quantity at equal % over its tanks" ${k.rows.length ? '' : 'disabled'}>even</button>
                    <button class="link" data-act="lock" title="Lock / unlock all tanks of this parcel" ${k.rows.length ? '' : 'disabled'}>${anyUnlocked ? 'lock' : 'unlock'}</button>
                    <button class="link" data-act="edit">edit</button>
                    <button class="link danger" data-act="del" title="Remove parcel" style="margin-left:auto">remove</button>
                </div>
            </div>`;
        }).join('');
    }

    // ── Tank table ──────────────────────────────────────────────────────────
    function renderTable() {
        const opts = (sel) => `<option value="">— empty —</option>` + state.cargoes.map(c =>
            `<option value="${c.id}" ${sel === c.id ? 'selected' : ''}>${esc(c.parcelNo ? c.parcelNo + ' · ' : '')}${esc(c.name)}</option>`).join('');
        const rows = sum.tanks.map(r => {
            const t = r.t;
            const has = !!r.c;
            const cell = (k, v, d) => has
                ? `<input class="inp cell num" data-key="${k}:${t.id}" data-f="${k}" data-tank="${t.id}" value="${v.toFixed(d)}" inputmode="decimal" ${r.locked ? 'disabled' : ''}>`
                : '<span class="muted">—</span>';
            return `<tr class="${ui.selected === t.id ? 'sel' : ''} ${sum.conflictTanks.has(t.id) ? 'bad' : ''}" data-row="${t.id}">
                <td class="l"><span class="tname"><span class="dot" style="--c:${has ? r.c.color : 'transparent'}"></span>${t.short}</span></td>
                <td class="l"><select class="inp cell" data-key="cargo:${t.id}" data-f="cargo" data-tank="${t.id}" ${r.locked ? 'disabled' : ''}>${opts(has ? r.c.id : null)}</select></td>
                <td class="num">${fmt(t.cap, 1)}</td>
                <td class="lim">${has ? fmt(r.limitPct, 1) : '—'}</td>
                <td class="${r.over ? 'over' : ''}">${cell('pct', r.pct, 2)}</td>
                <td>${cell('vol', r.vol, 3)}</td>
                <td>${has ? fmt(r.vref, 3) : '—'}</td>
                <td>${cell('mvac', r.mvac, 3)}</td>
                <td>${cell('mair', r.mair, 3)}</td>
                <td>${has ? fmt(Math.max(0, r.maxVol - r.vol), 1) : '—'}</td>
                <td><input type="checkbox" data-key="lock:${t.id}" data-f="lock" data-tank="${t.id}" ${r.locked ? 'checked' : ''} ${has ? '' : 'disabled'} title="Lock tank (kept by optimiser)"></td>
            </tr>`;
        }).join('');
        const T = sum.totals;
        $('#tankTable').innerHTML = `<thead><tr><th>Tank</th><th class="l">Parcel</th><th>Cap 100% m³</th><th>Limit %</th><th>Fill %</th><th>Vol m³ (obs)</th><th>Vol m³ @ref</th><th title="Metric tons in vacuum">MT vac</th><th title="Metric tons in air (ASTM Table 56)">MT air</th><th>Free m³</th><th>🔒</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr><td class="l" colspan="2">Total · ${T.tanksUsed} tanks</td><td>${fmt(CARGO_TANKS.reduce((s, t) => s + t.cap, 0), 1)}</td><td></td>
            <td>${fmt(T.cargoVol / CARGO_TANKS.reduce((s, t) => s + t.cap, 0) * 100, 2)}</td><td>${fmt(T.cargoVol, 3)}</td>
            <td>${fmt(sum.tanks.reduce((s, r) => s + (r.vref || 0), 0), 3)}</td><td>${fmt(T.cargoVac, 3)}</td><td>${fmt(T.cargoAir, 3)}</td><td>${fmt(sum.tanks.reduce((s, r) => s + (r.c ? Math.max(0, r.maxVol - r.vol) : 0), 0), 1)}</td><td></td></tr></tfoot>`;
    }

    // ── Deadweight & ballast ────────────────────────────────────────────────
    function renderDwt() {
        const T = sum.totals;
        const w = state.weights;
        const wf = (k, label) => `<div class="f"><label for="w_${k}">${label}</label><input id="w_${k}" class="inp num" type="number" step="0.1" min="0" data-key="w:${k}" data-w="${k}" value="${w[k] ?? 0}"></div>`;
        $('#dwtPanel').innerHTML = `
            <div class="dwt-grid">${wf('constant', 'Constant')}${wf('fo', 'Fuel oil')}${wf('mgo', 'MGO / DO')}${wf('fw', 'Fresh water')}${wf('lo', 'Lub oil')}</div>
            <div class="dwt-sum">
                <div>Cargo</div><div>${fmt(T.cargoMass, 3)} t</div>
                <div>Bunkers (FO · MGO/DO · FW · LO)</div><div>${fmt(T.bunkers, 3)} t</div>
                <div>Constant</div><div>${fmt(T.constant, 3)} t</div>
                <div>Ballast (ρ 1.025)</div><div>${fmt(T.ballastMass, 3)} t</div>
                <div class="tot">Deadweight</div><div class="tot">${fmt(T.dwt, 3)} t</div>
                <div>${Planner.zoneName(state.voyage.zone)} limit${state.voyage.dwtRestrict ? ' (restricted)' : ''}</div><div>${fmt(T.limit, 3)} t</div>
                <div>Margin</div><div class="${T.margin < 0 ? 'neg' : 'pos'}">${T.margin >= 0 ? '' : '−'}${fmt(Math.abs(T.margin), 3)} t</div>
                <div>Max cargo at this ballast / bunkers</div><div>${fmt(T.cargoCapacity, 1)} t</div>
            </div>
            <div class="ballast">
                <div class="ballast-head"><h2>Ballast tanks %</h2><span>
                    <button class="btn btn-xs" data-bal="0">All 0 %</button><button class="btn btn-xs" data-bal="2">2 %</button><button class="btn btn-xs" data-bal="100">100 %</button></span></div>
                <div class="ballast-grid">${T.ballastRows.map(r => `<div class="f"><label for="b_${r.b.id}" title="${fmt(r.b.cap, 1)} m³">${r.b.name} <span class="muted">${fmt(r.mass, 0)} t</span></label>
                    <input id="b_${r.b.id}" class="inp num" type="number" min="0" max="100" step="1" data-key="b:${r.b.id}" data-b="${r.b.id}" value="${+r.pct.toFixed(1)}"></div>`).join('')}</div>
            </div>`;
    }

    // ── Findings ────────────────────────────────────────────────────────────
    function renderFindings() {
        const f = sum.findings;
        const nD = f.filter(x => x.level === 'danger').length, nW = f.filter(x => x.level === 'warn').length;
        const chip = $('#compChip');
        chip.className = 'mk ' + (nD ? 'danger' : nW ? 'warn' : 'ok');
        chip.textContent = nD ? `${nD} violation${nD > 1 ? 's' : ''}` : nW ? `${nW} warning${nW > 1 ? 's' : ''}` : 'OK';
        if (!state.cargoes.length) { $('#findings').innerHTML = '<div class="empty-note">Add parcels to run segregation, filling-limit, temperature, DWT and list checks.</div>'; return; }
        const order = { danger: 0, warn: 1, info: 2 };
        const list = [...f].sort((a, b) => order[a.level] - order[b.level]);
        $('#findings').innerHTML = (nD || nW ? '' : '<div class="ok-box">No violations — segregation, filling, DWT and list within limits.</div>') +
            list.map((x, i) => `<div class="fd ${x.level} ${x.tanks ? 'clickable' : ''}" data-fi="${i}"><span class="lv">${x.level === 'danger' ? '■ fail' : x.level === 'warn' ? '▲ warn' : '· note'}</span><div><b>${esc(x.code)}</b> — ${esc(x.msg)}</div></div>`).join('');
        $('#findings')._list = list;
    }

    // ── Tank editor drawer ──────────────────────────────────────────────────
    function neighbourStatus(tankId, cargo) {
        return TANK_BY_ID[tankId].neighbors.map(nid => {
            const r = sum.byTank[nid];
            const cf = cargo && r.c && r.c.id !== cargo.id ? Compat.pairConflict(cargo, r.c) : null;
            return { r, cf };
        });
    }

    function renderDrawer() {
        const d = $('#drawer');
        const r = ui.selected ? sum.byTank[ui.selected] : null;
        d.classList.toggle('open', !!r);
        d.setAttribute('aria-hidden', r ? 'false' : 'true');
        if (!r) { d.innerHTML = ''; return; }
        if (dragBefore) { updateDrawerValues(r); return; }
        withFocus(d, () => { d.innerHTML = drawerHtml(r); });
    }

    function updateDrawerValues(r) {
        const set = (k, v) => { const n = $(`#drawer [data-key="${k}"]`); if (n && document.activeElement !== n) n.value = v; };
        set('d:pct', r.pct.toFixed(2)); set('d:vol', r.vol.toFixed(3)); set('d:mass', r.mass.toFixed(3));
        const k = r.c && sum.cargoes.find(x => x.c.id === r.c.id);
        const box = $('#drawer .dr-parcel');
        if (k && box) box.innerHTML = parcelBoxHtml(k);
    }

    function parcelBoxHtml(k) {
        const lim = k.p.lim;
        const ruleTxt = lim.rule === 'sg' ? 'SG > ' + state.settings.maxSgAtMaxFill : lim.rule === 'thermal' ? 'thermal expansion' : 'standard';
        return `<div class="row"><span>Nominated</span><b>${fmt(k.c.qty, 3)} t</b></div>
            <div class="row"><span>Planned in ${k.rows.length} tank${k.rows.length === 1 ? '' : 's'}</span><b>${fmt(k.planned, 3)} t</b></div>
            <div class="row"><span>Difference</span><b style="color:${Math.abs(k.diff) <= 0.5 ? 'var(--ok)' : 'var(--warn)'}">${k.diff >= 0 ? '+' : ''}${fmt(k.diff, 3)} t</b></div>
            <div class="row"><span>ρ @ load ${fmt(Physics.loadTemp(k.c), 1)} °C</span><b>${fmt(lim.rhoL, 4)} t/m³</b></div>
            <div class="row"><span>Fill limit (${ruleTxt})</span><b>${fmt(lim.pct, 2)} %</b></div>
            <div class="p-tanks">${k.rows.map(x => `<span class="tchip" style="--c:${k.c.color}" data-act="sel" data-tank="${x.t.id}">${x.t.short} ${fmt(x.pct, 1)}%</span>`).join('')}</div>`;
    }

    function drawerHtml(r) {
        const t = r.t, c = r.c;
        const nbs = neighbourStatus(t.id, c);
        const parcelOpts = `<option value="">— empty —</option>` + state.cargoes.map(p => {
            const bad = t.neighbors.some(nid => { const o = sum.byTank[nid]; return o.c && o.c.id !== p.id && Compat.pairConflict(p, o.c); });
            return `<option value="${p.id}" ${c && c.id === p.id ? 'selected' : ''}>${bad ? '⚠ ' : ''}${esc(p.parcelNo ? p.parcelNo + ' · ' : '')}${esc(p.name)}${bad ? ' (incompatible neighbour)' : ''}</option>`;
        }).join('');
        const k = c && sum.cargoes.find(x => x.c.id === c.id);
        const pair = sum.byTank[t.pairId];
        const dis = r.locked ? 'disabled' : '';
        return `<div class="dr-head" style="--c:${c ? c.color : 'var(--accent)'}">
                <div style="flex:1;min-width:0">
                    <div class="dr-title">${t.short} <span class="muted" style="font-size:.85rem;font-weight:600">${esc(t.name)}</span></div>
                    <div class="dr-meta">100% ${fmt(t.cap, 3)} m³ · FR ${t.frame} · COILS · MARINE-LINE</div>
                </div>
                <button class="btn btn-icon" data-act="close" aria-label="Close">${ICON.close}</button>
            </div>
            <div class="dr-body" style="--c:${c ? c.color : 'var(--accent)'}">
                <div class="f"><label for="dCargo">Parcel in this tank</label><select id="dCargo" class="inp" data-key="d:cargo" ${dis}>${parcelOpts}</select></div>
                ${c ? `
                <div class="dr-figs">
                    <div class="f"><label>Fill %</label><input class="inp num" data-key="d:pct" data-f="pct" value="${r.pct.toFixed(2)}" inputmode="decimal" ${dis}></div>
                    <div class="f"><label>Vol m³</label><input class="inp num" data-key="d:vol" data-f="vol" value="${r.vol.toFixed(3)}" inputmode="decimal" ${dis}></div>
                    <div class="f"><label>MT ${state.settings.basis === 'air' ? 'air' : 'vac'}</label><input class="inp num" data-key="d:mass" data-f="mass" value="${r.mass.toFixed(3)}" inputmode="decimal" ${dis}></div>
                </div>
                <div>
                    <input type="range" class="dr-range" id="dRange" min="0" max="${r.limitPct.toFixed(2)}" step="0.05" value="${Math.min(r.pct, r.limitPct).toFixed(2)}" ${dis} aria-label="Fill percentage">
                    <div class="dr-scale"><span>0 %</span><span>limit ${fmt(r.limitPct, 2)} %</span></div>
                </div>
                <div class="dr-step">
                    <button class="btn" data-act="step" data-dir="-1" ${dis} aria-label="Decrease">−</button>
                    <select class="inp" style="width:auto" id="dStepSize" data-key="d:step">${[0.5, 1, 5, 10, 25, 50, 100].map(v => `<option ${+ui.step === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
                    <div class="seg seg-sm" id="dStepUnit">${['t', 'm3', '%'].map(u => `<button data-su="${u}" class="${ui.stepUnit === u ? 'on' : ''}">${u === 'm3' ? 'm³' : u}</button>`).join('')}</div>
                    <button class="btn" data-act="step" data-dir="1" ${dis} aria-label="Increase">+</button>
                </div>
                <div class="dr-quick">
                    <button class="btn btn-xs" data-act="fillmax" ${dis}>Fill to limit</button>
                    <button class="btn btn-xs" data-act="matchpair" ${dis || (pair.c && pair.c.id === c.id ? '' : 'disabled')} title="Same % as ${pair.t.short}">Match ${pair.t.short}</button>
                    <button class="btn btn-xs" data-act="evenparcel" ${dis}>Even out parcel</button>
                    <button class="btn btn-xs btn-danger" data-act="empty" ${dis}>Empty tank</button>
                </div>
                <label class="toggle"><input type="checkbox" data-act="lock" ${r.locked ? 'checked' : ''}><span></span>Lock this tank (optimiser keeps it)</label>
                <label class="toggle"><input type="checkbox" data-act="rebal" ${state.settings.rebalance ? 'checked' : ''}><span></span>Keep parcel total — move difference to its other tanks</label>
                <div class="dr-msg" id="dMsg"></div>
                <div class="dr-box"><div class="ttl">Parcel</div><div class="dr-parcel">${parcelBoxHtml(k)}</div></div>` : `<div class="empty-note">Tank is empty. Choose a parcel above or drag one from the list onto the tank.</div>`}
                <div class="dr-box"><div class="ttl">Common bulkheads</div>
                    ${nbs.map(({ r: o, cf }) => `<div class="nb"><span class="dot" style="--c:${o.c ? o.c.color : 'transparent'}"></span><b>${o.t.short}</b><span class="muted">${o.c ? esc(o.c.name) : 'empty'}</span>
                        <span class="st mk ${cf ? 'danger' : o.c ? 'ok' : ''}" title="${cf ? esc(cf.msg) : ''}">${cf ? (cf.code === 'HEAT' ? 'heat' : 'incompatible') : o.c ? (c && o.c.id === c.id ? 'same' : 'ok') : '—'}</span></div>`).join('')}
                </div>
            </div>`;
    }

    function drawerMsg(m) { const n = $('#dMsg'); if (n) n.textContent = m || ''; }

    function selectTank(id, flash) {
        ui.selected = id;
        render();
        if (flash) {
            const el = $(`#ship [data-tank="${id}"]`);
            if (el) { el.classList.add('flash'); el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }
        }
    }

    // ── Tank edit helpers (shared by drawer + table) ────────────────────────
    function editTankField(tankId, field, value) {
        const v = num(value);
        if (v == null) { scheduleRender(); return; }
        const rb = state.settings.rebalance;
        const e = state.plan[tankId];
        const c = e && Planner.cargoById(state, e.cargoId);
        const res = commit(() => field === 'pct' ? Planner.setTankPct(state, tankId, v, rb)
            : field === 'vol' ? Planner.setTankVolume(state, tankId, v, rb)
                : field === 'mvac' ? Planner.setTankVolume(state, tankId, v / Physics.massPerM3(c, 'vac'), rb)
                    : field === 'mair' ? Planner.setTankVolume(state, tankId, v / Physics.massPerM3(c, 'air'), rb)
                        : Planner.setTankMass(state, tankId, v, rb));
        if (res && res.msg) { toast(`${TANK_BY_ID[tankId].short}: ${res.msg}`, 'warn'); drawerMsg(res.msg); }
    }

    function assign(tankId, cargoId) {
        const c = cargoId != null ? Planner.cargoById(state, cargoId) : null;
        if (c) {
            const bad = TANK_BY_ID[tankId].neighbors.map(nid => sum.byTank[nid]).find(o => o.c && o.c.id !== c.id && Compat.pairConflict(c, o.c));
            if (bad) toast(`⚠ ${c.name} in ${TANK_BY_ID[tankId].short}: ${Compat.pairConflict(c, bad.c).msg}`, 'danger');
        }
        commit(() => Planner.assignTank(state, tankId, cargoId, state.settings.rebalance));
    }

    // ── Parcel form ─────────────────────────────────────────────────────────
    function rgOptions() {
        $('#fRG').innerHTML = '<option value="">— none / unknown —</option>' +
            Object.entries(REACTIVE_GROUPS).map(([k, v]) => `<option value="${k}">${k} · ${esc(v)}</option>`).join('');
    }

    function nextParcelNo() {
        const nums = state.cargoes.map(c => parseInt(String(c.parcelNo || '').replace(/\D/g, ''), 10)).filter(Number.isFinite);
        return 'P-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, '0');
    }

    function applyProduct(p) {
        formProduct = p;
        $('#fName').value = p.n;
        $('#fSG').value = p.sg.toFixed(4);
        $('#fRef').value = String(p.ref);
        $('#fGroup').value = p.g;
        $('#fRG').value = p.rg || '';
        $('#fBeta').value = p.beta || '';
        $('#fVcf').value = Physics.vcfTable(p) || 'beta';
        syncVcf();
        $('#fMaxT').value = Number.isFinite(p.maxT) ? p.maxT : '';
        $('#fHeatMin').value = p.heat ? p.heat[0] : '';
        $('#fHeatMax').value = p.heat ? p.heat[1] : '';
        if (p.heat) {
            if (!$('#fLoadT').value) $('#fLoadT').value = p.heat[0];
            $('#fVoyT').value = p.heat[1];
        }
        renderFormInfo();
        renderPreview();
    }

    const LUBE_RE = /base\s*-?\s*oil|lube|lub(e|ricating)?\s*oil|luboil|yubase|bright\s*stock|\b(sn|hvi|n)\s*\d{2,4}\b|\b\d{2,4}\s*(n|sn|bs)\b|group\s*(i{1,3}|[123])\b/i;

    function syncVcf() {
        const isBeta = $('#fVcf').value === 'beta';
        $('#fBeta').disabled = !isBeta;
        if (isBeta && !$('#fBeta').value) $('#fBeta').value = $('#fGroup').value === 'V' ? 0.0007 : 0.001;
        if (!isBeta) $('#fBeta').value = '';
    }

    function renderFormInfo() {
        const p = formProduct;
        if (!p) {
            const n = $('#fName').value;
            $('#fInfo').innerHTML = !n ? '' : LUBE_RE.test(n)
                ? '<span class="mk info">Custom lube / base oil — OIL · ANNEX I · GRP 33 · T54D (SG @15 °C)</span>'
                : '<span class="mk warn">Custom product — set class &amp; reactive group under Product data</span>';
            return;
        }
        $('#fInfo').innerHTML = productChips(p) + (p.un ? ` · UN ${esc(p.un)}` : '') + ` · SG ${p.sg}@${p.ref}°C`;
    }

    /** Parcel object as currently described by the form (null when incomplete). */
    function formParcel() {
        const name = $('#fName').value.trim();
        const sg = num($('#fSG').value);
        if (!name || !sg) return null;
        const heatMin = num($('#fHeatMin').value), heatMax = num($('#fHeatMax').value);
        const p = formProduct && formProduct.n === name ? formProduct : null;
        const c = {
            name, sg, ref: +$('#fRef').value, g: $('#fGroup').value,
            rg: num($('#fRG').value), vcfTable: $('#fVcf').value,
            beta: $('#fVcf').value === 'beta' ? num($('#fBeta').value) : null,
            maxT: num($('#fMaxT').value), minT: p ? p.minT : null,
            heat: heatMin != null && heatMax != null ? [heatMin, heatMax] : null,
            pc: p ? p.pc : '', st: p ? p.st : 0, f: p ? p.f : '', un: p ? p.un : '',
            loadT: num($('#fLoadT').value), voyT: num($('#fVoyT').value),
            strategy: $('#fStrategy').value,
            parcelNo: $('#fNo').value.trim(),
            loadPort: $('#fLoadPort').value.trim(), dischPort: $('#fDischPort').value.trim()
        };
        if (c.vcfTable === 'beta' && c.beta == null) c.beta = c.g === 'V' ? 0.0007 : 0.001;
        const qty = num($('#fQty').value);
        c.qty = qty == null ? null : ($('#fQtyUnit').value === 'm3' ? qty * Physics.massPerM3(c, state.settings.basis) : qty);
        return c;
    }

    function renderPreview() {
        const c = formParcel();
        const box = $('#fPreview');
        if (!c) { box.innerHTML = ''; return; }
        const lim = Physics.fillLimit(c, state.settings);
        const mpm = Physics.massPerM3(c, state.settings.basis);
        const vt = Physics.vcfTable(c);
        let h = `${vt ? 'ASTM T' + vt : 'β ' + c.beta} · VCF <b>${fmt(Physics.vcf(c, Physics.loadTemp(c)), 5)}</b> · ρ @ ${fmt(Physics.loadTemp(c), 1)} °C <b>${fmt(lim.rhoL, 4)}</b> · fill limit <b>${fmt(lim.pct, 2)} %</b>${lim.rule !== 'std' ? ` <span class="warn">(${lim.rule === 'sg' ? 'SG > ' + state.settings.maxSgAtMaxFill : 'thermal'})</span>` : ''}`;
        if (c.qty) {
            const vol = c.qty / mpm;
            h += `<br>${fmt(c.qty, 3)} t ≙ <b>${fmt(vol, 1)} m³</b> observed`;
            // Fewest free tanks able to take it (ignores parcels not yet stowed)
            const pr = Planner.prep(state, c);
            let free = 0;
            CARGO_TANKS.forEach(t => {
                const e = state.plan[t.id];
                if (!e || (editingId && e.cargoId === editingId)) free |= t.bit;
            });
            const built = Optimizer.buildCandidates(Object.assign({}, pr, { need: c.qty, allowedMask: pr.allowedMask & free }), CARGO_TANKS, state.settings.slackPct);
            if (built.list.length) {
                const best = built.list[0];
                const d = Optimizer.distribute(Object.assign({ strategy: c.strategy }, pr), best.mask, c.qty, CARGO_TANKS);
                h += ` · fits in <b>${best.count} tank${best.count > 1 ? 's' : ''}</b> (${[...d.entries()].map(([i, v]) => `${CARGO_TANKS[i].short} ${fmt(v / CARGO_TANKS[i].cap * 100, 0)}%`).join(' + ')})`;
            } else {
                const capFree = Optimizer.bitsOf(pr.allowedMask & free).reduce((s, i) => s + pr.capMass[i], 0);
                h += ` · <span class="danger">only ${fmt(capFree, 0)} t fits in free tanks</span>`;
            }
            const room = sum ? sum.totals.limit - sum.totals.dwt + (editingId ? (sum.cargoes.find(k => k.c.id === editingId) || { planned: 0 }).planned : 0) : Infinity;
            if (c.qty > room + 0.05) h += `<br><span class="danger">Exceeds DWT margin (${fmt(room, 1)} t available)</span>`;
            if (Number.isFinite(c.minT) && Number.isFinite(c.loadT) && c.loadT < c.minT) h += `<br><span class="warn">Below minimum ${c.minT} °C</span>`;
        }
        box.innerHTML = h;
    }

    function resetForm() {
        editingId = null;
        formProduct = null;
        $('#parcelForm').reset();
        $('#fNo').value = nextParcelNo();
        $('#fRef').value = '20';
        $('#fVcf').value = 'beta';
        syncVcf();
        $('#formTitle').textContent = 'Add parcel';
        $('#btnSubmit').textContent = 'Add parcel';
        $('#btnCancelEdit').hidden = true;
        $('#parcelPanel').classList.remove('editing');
        $('#fInfo').innerHTML = '';
        $('#fPreview').innerHTML = '';
    }

    function startEdit(id) {
        const c = Planner.cargoById(state, id);
        if (!c) return;
        resetForm();
        editingId = id;
        formProduct = CARGO_BY_NAME[c.name.toLowerCase()] || null;
        $('#fNo').value = c.parcelNo || '';
        $('#fName').value = c.name;
        $('#fQty').value = +c.qty.toFixed(3);
        $('#fQtyUnit').value = 't';
        $('#fSG').value = c.sg;
        $('#fRef').value = String(c.ref);
        $('#fLoadT').value = c.loadT ?? '';
        $('#fVoyT').value = c.voyT ?? '';
        $('#fLoadPort').value = c.loadPort || '';
        $('#fDischPort').value = c.dischPort || '';
        $('#fGroup').value = c.g;
        $('#fRG').value = c.rg || '';
        $('#fBeta').value = c.beta || '';
        $('#fVcf').value = Physics.vcfTable(c) || 'beta';
        syncVcf();
        $('#fMaxT').value = c.maxT ?? '';
        $('#fHeatMin').value = c.heat ? c.heat[0] : '';
        $('#fHeatMax').value = c.heat ? c.heat[1] : '';
        $('#fStrategy').value = c.strategy || 'BALANCED';
        $('#formTitle').textContent = `Edit parcel ${c.parcelNo || ''}`;
        $('#btnSubmit').textContent = 'Update parcel';
        $('#btnCancelEdit').hidden = false;
        $('#parcelPanel').classList.add('editing');
        renderFormInfo();
        render();
        $('#parcelPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('#fQty').focus();
    }

    function rememberPort(name) {
        if (!name) return;
        const list = (readJson(PORTS_KEY) || []).filter(p => p !== name);
        list.unshift(name);
        writeJson(PORTS_KEY, list.slice(0, 15));
    }

    function submitParcel(e) {
        e.preventDefault();
        const f = formParcel();
        if (!f || !(f.qty > 0)) { toast('Enter product, density and quantity', 'warn'); ($('#fName').value ? $('#fQty') : $('#fName')).focus(); return; }
        if (f.sg < 0.5 || f.sg > 2.3) { toast('Density looks wrong (0.5 – 2.3 t/m³)', 'warn'); $('#fSG').focus(); return; }
        rememberPort(f.loadPort); rememberPort(f.dischPort);
        if (editingId != null) {
            const id = editingId;
            commit(() => {
                const c = Planner.cargoById(state, id);
                const oldMpm = Planner.prep(state, c).mpm;
                const qtyChanged = Math.abs(c.qty - f.qty) > 1e-6;
                Object.assign(c, f);
                // keep tonnage per tank, re-derive volume with the new density / limit
                const p = Planner.prep(state, c);
                Object.entries(state.plan).forEach(([tid, en]) => {
                    if (en.cargoId !== id) return;
                    en.vol = Math.min(TANK_BY_ID[tid].cap * p.lim.pct / 100, en.vol * oldMpm / p.mpm);
                });
                if (qtyChanged && state.settings.rebalance && Object.values(state.plan).some(en => en.cargoId === id)) Planner.evenOut(state, id);
            });
            toast(`Updated ${f.name}`, 'ok');
            resetForm();
        } else {
            const used = new Set(state.cargoes.map(c => c.color));
            const color = PALETTE.find(x => !used.has(x)) || PALETTE[state.cargoes.length % PALETTE.length];
            const id = Date.now();
            commit(() => {
                state.cargoes.push(Object.assign({ id, color }, f, { parcelNo: f.parcelNo || nextParcelNo() }));
                stowOnly(id);
            });
            const k = Planner.summarize(state).cargoes.find(x => x.c.id === id);
            if (k && k.planned >= f.qty - 0.5) toast(`${f.name} stowed in ${k.tanks.join(' + ')} — other parcels untouched`, 'ok');
            else toast(`${f.name} added — ${fmt(f.qty - (k ? k.planned : 0), 1)} t could not be stowed in free tanks. Try Optimise to re-plan all parcels.`, 'warn');
            resetForm();
            $('#fName').focus();
        }
    }

    /** Stow one parcel into free tanks, leaving all other tanks as they are. */
    function stowOnly(id) {
        return Planner.optimize(state, { only: [id], timeMs: 700 });
    }

    // ── Autocomplete ────────────────────────────────────────────────────────
    function attachAutocomplete(input, source, onPick) {
        let box = null, items = [], idx = -1;
        const close = () => { if (box) box.remove(); box = null; idx = -1; };
        const paint = () => {
            if (!box) return;
            $$('.ac-item', box).forEach((n, i) => n.classList.toggle('on', i === idx));
            const on = $('.ac-item.on', box);
            if (on) on.scrollIntoView({ block: 'nearest' });
        };
        const open = () => {
            items = source(input.value);
            if (!items.length) { close(); return; }
            if (!box) { box = document.createElement('div'); box.className = 'ac'; box.setAttribute('role', 'listbox'); input.parentElement.appendChild(box); }
            box.innerHTML = items.map((it, i) => `<div class="ac-item" role="option" data-i="${i}">${it.html}</div>`).join('');
            idx = input.value ? 0 : -1;
            paint();
        };
        input.addEventListener('input', open);
        input.addEventListener('focus', open);
        input.addEventListener('blur', () => setTimeout(close, 120));
        input.addEventListener('keydown', e => {
            if (!box) { if (e.key === 'ArrowDown') { open(); e.preventDefault(); } return; }
            if (e.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); paint(); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); paint(); e.preventDefault(); }
            else if ((e.key === 'Enter' || e.key === 'Tab') && idx >= 0) { onPick(items[idx].value); close(); if (e.key === 'Enter') e.preventDefault(); }
            else if (e.key === 'Escape') { close(); e.stopPropagation(); }
        });
        input.parentElement.addEventListener('mousedown', e => {
            const it = e.target.closest('.ac-item');
            if (!it) return;
            e.preventDefault();
            onPick(items[+it.dataset.i].value);
            close();
        });
    }

    function hl(text, q) {
        if (!q) return esc(text);
        const i = fold(text).indexOf(fold(q));
        if (i < 0) return esc(text);
        return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
    }

    function scoreMatch(q, name, aliases) {
        const fq = fold(q), fn = fold(name);
        if (!fq) return 1;
        if (fn.startsWith(fq)) return 10;
        if (aliases.some(a => fold(a) === fq)) return 9;
        if (fn.split(/[\s(\-/,]+/).some(w => w.startsWith(fq))) return 7;
        if (aliases.some(a => fold(a).startsWith(fq))) return 6;
        if (fn.includes(fq)) return 4;
        if (aliases.some(a => fold(a).includes(fq))) return 3;
        let j = 0; for (const ch of fn) if (ch === fq[j]) j++;
        return j === fq.length ? 1 : 0;
    }

    function productSource(q) {
        return CARGO_DB.map(p => ({ p, s: scoreMatch(q, p.n, p.a) }))
            .filter(x => x.s > 0).sort((a, b) => b.s - a.s || a.p.n.localeCompare(b.p.n)).slice(0, 12)
            .map(({ p }) => {
                const alias = p.a.find(a => q && fold(a).includes(fold(q)) && !fold(p.n).includes(fold(q)));
                return {
                    value: p,
                    html: `<span class="ac-sub" style="width:30px">${{ C: 'CHEM', P: 'OIL', V: 'VEG' }[p.g]}</span><span class="ac-main">${hl(p.n, q)}${alias ? ` <span class="ac-sub">(${esc(alias)})</span>` : ''}</span><span class="ac-sub">${p.sg} @${p.ref}° · ${p.pc === 'I' ? 'Annex I' : 'Cat ' + p.pc}</span>`
                };
            });
    }

    function portSource(q) {
        const recent = readJson(PORTS_KEY) || [];
        const rows = PORT_DB.map(p => ({ p, s: scoreMatch(q, p.name, [p.region]) + (recent.includes(p.name) ? 5 - recent.indexOf(p.name) * 0.2 : 0) }));
        recent.filter(n => !PORT_DB.some(p => p.name === n)).forEach(n => rows.push({ p: { name: n, region: 'recent' }, s: scoreMatch(q, n, []) + 5 }));
        return rows.filter(x => x.s > 0 && (q || recent.includes(x.p.name))).sort((a, b) => b.s - a.s).slice(0, 10)
            .map(({ p }) => ({ value: p.name, html: `<span class="ac-main">${hl(p.name, q)}</span><span class="ac-sub">${esc(recent.includes(p.name) ? '★ ' + p.region : p.region)}</span>` }));
    }

    // ── Print / export ──────────────────────────────────────────────────────
    function printPlan() {
        sum = Planner.summarize(state);
        const T = sum.totals;
        const now = new Date();
        const tankRows = sum.tanks.map(r => `<tr><td class="l">${r.t.name}</td><td class="l">${r.c ? esc(r.c.name) : '—'}</td><td>${fmt(r.t.cap, 3)}</td><td>${r.c ? fmt(r.pct, 2) : ''}</td><td>${r.c ? fmt(r.vol, 3) : ''}</td><td>${r.c ? fmt(Physics.loadTemp(r.c), 1) : ''}</td><td>${r.c ? fmt(Physics.vcf(r.c, Physics.loadTemp(r.c)), 5) : ''}</td><td>${r.c ? fmt(r.vref, 3) : ''}</td><td>${r.c ? fmt(r.mvac, 3) : ''}</td><td>${r.c ? fmt(r.mair, 3) : ''}</td></tr>`).join('');
        const parcelRows = sum.cargoes.map(k => `<tr><td class="l">${esc(k.c.parcelNo || '')}</td><td class="l"><span style="display:inline-block;width:8px;height:8px;background:${k.c.color};margin-right:4px"></span>${esc(k.c.name)}</td><td>${fmt(k.c.sg, 4)} @${k.c.ref}</td><td>${fmt(k.p.lim.rhoL, 4)}</td><td>${fmt(k.c.qty, 3)}</td><td>${fmt(k.plannedVac, 3)}</td><td>${fmt(k.plannedAir, 3)}</td><td>${fmt(k.vol, 3)}</td><td class="l">${k.tanks.join(', ')}</td><td class="l">${esc(k.c.loadPort || '')} → ${esc(k.c.dischPort || '')}</td><td>${k.c.pc === 'I' ? 'Annex I' : esc(k.c.pc || '')}${k.c.st ? ' / ST' + k.c.st : ''}</td></tr>`).join('');
        const findings = sum.findings.filter(f => f.level !== 'info').map(f => `<li><b>${esc(f.code)}</b>: ${esc(f.msg)}</li>`).join('') || '<li>No violations.</li>';
        $('#printArea').innerHTML = `<div class="rp">
            <div class="rp-head"><div><h1>Cargo Stowage Plan — ${VESSEL.name}</h1><div>IMO ${VESSEL.imo} · Voyage ${esc(state.voyage.no || '—')} · ${Planner.zoneName(state.voyage.zone)} load line</div></div>
            <div style="text-align:right">${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}<br>Weights ${state.settings.basis === 'air' ? 'in air' : 'in vacuum'}</div></div>
            <div class="ship">${shipHtml(true)}</div>
            <h3>Parcels</h3><table><tr><th>Parcel</th><th>Product</th><th>SG @ref</th><th>ρ load</th><th>Nominated t (${state.settings.basis === 'air' ? 'air' : 'vac'})</th><th>MT vac</th><th>MT air</th><th>Obs m³</th><th>Tanks</th><th>Route</th><th>MARPOL / IBC</th></tr>${parcelRows}</table>
            <h3>Ullage report</h3><table><tr><th>Tank</th><th>Parcel</th><th>100% m³</th><th>Fill %</th><th>Obs m³</th><th>Temp °C</th><th>VCF</th><th>GSV m³ @ref</th><th>MT vac</th><th>MT air</th></tr>${tankRows}
                <tr><td class="l"><b>Total</b></td><td></td><td></td><td></td><td><b>${fmt(T.cargoVol, 3)}</b></td><td></td><td></td><td><b>${fmt(sum.tanks.reduce((s, r) => s + (r.vref || 0), 0), 3)}</b></td><td><b>${fmt(T.cargoVac, 3)}</b></td><td><b>${fmt(T.cargoAir, 3)}</b></td></tr></table>
            <div class="cols"><div><h3>Deadweight</h3><table><tr><td class="l">Cargo (${state.settings.basis === 'air' ? 'MT air' : 'MT vac'})</td><td>${fmt(T.cargoMass, 3)}</td></tr><tr><td class="l">Bunkers (FO · MGO/DO · FW · LO)</td><td>${fmt(T.bunkers, 3)}</td></tr><tr><td class="l">Constant</td><td>${fmt(T.constant, 3)}</td></tr><tr><td class="l">Ballast</td><td>${fmt(T.ballastMass, 3)}</td></tr><tr><td class="l"><b>Deadweight</b></td><td><b>${fmt(T.dwt, 3)}</b></td></tr><tr><td class="l">Limit</td><td>${fmt(T.limit, 3)}</td></tr><tr><td class="l">Port / Stbd (t)</td><td>${fmt(T.port, 1)} / ${fmt(T.stbd, 1)}</td></tr></table>
            </div><div><h3>Checks</h3><ul>${findings}</ul></div></div>
            <div class="sig"><div>Prepared — Chief Officer</div><div>Approved — Master</div><div>Terminal / Surveyor</div></div>
        </div>`;
        window.print();
    }

    function download(name, text, type) {
        const url = URL.createObjectURL(new Blob([text], { type }));
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function fileStem() {
        return `ADA_${(state.voyage.no || 'plan').replace(/[^\w-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}`;
    }

    function exportCsv() {
        const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [['Tank', 'Parcel', 'Product', 'Cap 100% m3', 'Fill %', 'Limit %', 'Obs vol m3', 'Load temp C', 'VCF', 'GSV m3 @ref', 'MT vac', 'MT air', 'Locked'].map(q).join(',')];
        sum.tanks.forEach(r => lines.push([r.t.name, r.c ? r.c.parcelNo : '', r.c ? r.c.name : '', r.t.cap.toFixed(3), r.c ? r.pct.toFixed(2) : '', r.c ? r.limitPct.toFixed(2) : '', r.vol.toFixed(3), r.c ? Physics.loadTemp(r.c) : '', r.c ? Physics.vcf(r.c, Physics.loadTemp(r.c)).toFixed(5) : '', r.c ? r.vref.toFixed(3) : '', r.mvac.toFixed(3), r.mair.toFixed(3), r.locked ? 'yes' : ''].map(q).join(',')));
        lines.push('');
        lines.push(['Parcel', 'Product', 'SG', 'Ref C', 'Nominated t', 'MT vac', 'MT air', 'Tanks', 'Load port', 'Disch port'].map(q).join(','));
        sum.cargoes.forEach(k => lines.push([k.c.parcelNo, k.c.name, k.c.sg, k.c.ref, k.c.qty.toFixed(3), k.plannedVac.toFixed(3), k.plannedAir.toFixed(3), k.tanks.join(' '), k.c.loadPort, k.c.dischPort].map(q).join(',')));
        download(fileStem() + '.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    }

    // ── Settings dialog ─────────────────────────────────────────────────────
    function openSettings() {
        const s = state.settings;
        $('#sBasis').value = s.basis;
        $('#sList').value = s.listLimit;
        $('#sMaxFill').value = s.maxFillPct;
        $('#sSgLim').value = s.maxSgAtMaxFill;
        $('#sSlops').checked = !!s.allowSlops;
        $('#sSlack').value = s.slackPct;
        $('#themeGrid').innerHTML = THEMES.map(t => `<button type="button" class="theme-opt ${ui.theme === t.id ? 'on' : ''}" data-theme-id="${t.id}"><i style="background:${t.sw}"></i>${t.label}</button>`).join('');
        $('#settingsDlg').showModal();
    }

    // ── Event wiring ────────────────────────────────────────────────────────
    function wire() {
        rgOptions();
        resetForm();

        attachAutocomplete($('#fName'), productSource, p => { applyProduct(p); $('#fQty').focus(); });
        attachAutocomplete($('#fLoadPort'), portSource, v => { $('#fLoadPort').value = v; $('#fDischPort').focus(); });
        attachAutocomplete($('#fDischPort'), portSource, v => { $('#fDischPort').value = v; });

        $('#fName').addEventListener('input', () => {
            const exact = CARGO_BY_NAME[$('#fName').value.trim().toLowerCase()];
            if (exact) applyProduct(exact);
            else {
                formProduct = null;
                // Unlisted lubricating / base oil grades (Yubase 4, 60N, SN500, 150BS…) → Annex I oil, ASTM 54D
                if (LUBE_RE.test($('#fName').value)) {
                    $('#fGroup').value = 'P'; $('#fRG').value = '33'; $('#fVcf').value = '54D'; $('#fRef').value = '15'; syncVcf();
                }
                renderFormInfo(); renderPreview();
            }
        });
        // Changing the reference temperature converts the SG instead of silently reinterpreting it
        let lastRef = $('#fRef').value;
        $('#fRef').addEventListener('change', () => {
            const sg = num($('#fSG').value);
            const newRef = +$('#fRef').value;
            if (sg) {
                const tmp = { sg, ref: +lastRef, g: $('#fGroup').value, vcfTable: $('#fVcf').value, beta: num($('#fBeta').value) || (formProduct && formProduct.beta) || null };
                $('#fSG').value = Physics.densityAt(tmp, newRef).toFixed(4);
                toast(`SG converted to ${newRef} °C reference`, 'info');
            }
            lastRef = $('#fRef').value;
            renderPreview();
        });
        $('#fVcf').addEventListener('change', () => { syncVcf(); renderPreview(); });
        $('#fGroup').addEventListener('change', () => {
            if (!formProduct) { $('#fVcf').value = $('#fGroup').value === 'P' ? '54B' : 'beta'; syncVcf(); renderPreview(); }
        });
        $('#fHeatMax').addEventListener('change', () => { if (!$('#fVoyT').value) $('#fVoyT').value = $('#fHeatMax').value; });
        $('#parcelForm').addEventListener('input', e => { if (e.target.id !== 'fName') renderPreview(); });
        $('#parcelForm').addEventListener('submit', submitParcel);
        $('#btnCancelEdit').addEventListener('click', () => { resetForm(); render(); });

        // Top bar
        $('#zoneSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) commit(() => { state.voyage.zone = b.dataset.zone; }); });
        $('#voyNo').addEventListener('change', e => commit(() => { state.voyage.no = e.target.value.trim(); }));
        $('#dwtRestrict').addEventListener('change', e => commit(() => { state.voyage.dwtRestrict = num(e.target.value); }));
        $('#btnOptimize').addEventListener('click', () => {
            if (!state.cargoes.length) { toast('Add parcels first', 'warn'); return; }
            const res = commit(() => Planner.optimize(state));
            const s2 = Planner.summarize(state);
            const unpl = Object.entries(res.unplaced || {}).filter(([, v]) => v > 0.05);
            if (unpl.length) toast(`Could not stow: ${unpl.map(([id, v]) => `${Planner.cargoById(state, +id).name} ${fmt(v, 1)} t`).join(', ')} — reduce quantity, unlock tanks or allow slops`, 'danger');
            else toast(`Optimised: ${fmt(s2.totals.cargoMass, 1)} t in ${s2.totals.tanksUsed} tanks · list Δ ${fmt(Math.abs(s2.totals.list), 1)} t · ${res.ms} ms`, 'ok');
        });
        $('#btnUndo').addEventListener('click', undo);
        $('#btnRedo').addEventListener('click', redo);
        $('#btnSave').addEventListener('click', () => { download(fileStem() + '.json', JSON.stringify(state, null, 1), 'application/json'); toast('Plan saved', 'ok'); });
        $('#btnOpen').addEventListener('click', () => $('#fileOpen').click());
        $('#fileOpen').addEventListener('change', async e => {
            const file = e.target.files[0];
            e.target.value = '';
            if (!file) return;
            try {
                const data = JSON.parse(await file.text());
                if (!data || !Array.isArray(data.cargoes)) throw new Error('not a plan file');
                commit(() => { state = migrate(data); });
                ui.selected = null; resetForm();
                toast(`Opened ${file.name}`, 'ok');
            } catch (err) { toast('Could not open file: ' + err.message, 'danger'); }
        });
        $('#btnPrint').addEventListener('click', printPlan);
        $('#btnCsv').addEventListener('click', exportCsv);
        $('#btnSettings').addEventListener('click', openSettings);

        // Settings dialog
        $('#themeGrid').addEventListener('click', e => {
            const b = e.target.closest('[data-theme-id]');
            if (!b) return;
            ui.theme = b.dataset.themeId;
            $$('#themeGrid .theme-opt').forEach(x => x.classList.toggle('on', x === b));
            applyTheme(); persist();
        });
        const setS = (k, v) => commit(() => { state.settings[k] = v; });
        $('#sBasis').addEventListener('change', e => setS('basis', e.target.value));
        $('#sList').addEventListener('change', e => setS('listLimit', Math.max(0, num(e.target.value) ?? 150)));
        $('#sMaxFill').addEventListener('change', e => setS('maxFillPct', Math.min(98, Math.max(50, num(e.target.value) ?? 98))));
        $('#sSgLim').addEventListener('change', e => setS('maxSgAtMaxFill', Math.min(2.5, Math.max(0.8, num(e.target.value) ?? 1.54))));
        $('#sSlops').addEventListener('change', e => setS('allowSlops', e.target.checked));
        $('#sSlack').addEventListener('change', e => setS('slackPct', Math.min(95, Math.max(0, num(e.target.value) ?? 65))));
        $('#btnResetAll').addEventListener('click', () => {
            if (!confirm('Clear all parcels, the plan and weights? (You can undo.)')) return;
            commit(() => { const theme = state.settings; state = Planner.newState(); state.settings = theme; });
            ui.selected = null; resetForm(); $('#settingsDlg').close();
        });

        // Ship toolbar
        $('#unitSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { ui.unit = b.dataset.unit; render(); } });
        $('#tglRebalance').addEventListener('change', e => commit(() => { state.settings.rebalance = e.target.checked; }));
        $('#btnClearUnlocked').addEventListener('click', () => commit(() => {
            Object.keys(state.plan).forEach(k => { if (!state.plan[k].locked) delete state.plan[k]; });
        }));

        // Ship: click, keyboard, drag & drop
        const ship = $('#ship');
        ship.addEventListener('click', e => { const t = e.target.closest('[data-tank]'); if (t) selectTank(ui.selected === t.dataset.tank ? null : t.dataset.tank); });
        ship.addEventListener('keydown', e => { const t = e.target.closest('[data-tank]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectTank(t.dataset.tank); } });
        ship.addEventListener('dragstart', e => {
            const t = e.target.closest('[data-tank]');
            if (!t) return;
            e.dataTransfer.setData('text/x-tank', t.dataset.tank);
            e.dataTransfer.effectAllowed = 'move';
        });
        let dragParcel = null;
        ship.addEventListener('dragover', e => {
            const t = e.target.closest('[data-tank]');
            if (!t) return;
            e.preventDefault();
            $$('#ship .drop-ok, #ship .drop-bad').forEach(n => { if (n !== t) n.classList.remove('drop-ok', 'drop-bad'); });
            let bad = false;
            if (dragParcel) {
                const c = Planner.cargoById(state, dragParcel);
                bad = TANK_BY_ID[t.dataset.tank].neighbors.some(nid => { const o = sum.byTank[nid]; return o.c && o.c.id !== c.id && Compat.pairConflict(c, o.c); });
                bad = bad || (sum.byTank[t.dataset.tank].locked);
            }
            t.classList.toggle('drop-bad', bad);
            t.classList.toggle('drop-ok', !bad);
        });
        ship.addEventListener('dragleave', e => { const t = e.target.closest('[data-tank]'); if (t && !t.contains(e.relatedTarget)) t.classList.remove('drop-ok', 'drop-bad'); });
        ship.addEventListener('drop', e => {
            const t = e.target.closest('[data-tank]');
            if (!t) return;
            e.preventDefault();
            const target = t.dataset.tank;
            if (sum.byTank[target].locked) { toast('Tank is locked — unlock it first', 'warn'); scheduleRender(); return; }
            const pid = e.dataTransfer.getData('text/x-parcel');
            const from = e.dataTransfer.getData('text/x-tank');
            if (pid) { assign(target, +pid); ui.selected = target; }
            else if (from && from !== target) {
                const res = commit(() => Planner.swapTanks(state, from, target, state.settings.rebalance));
                if (res.msg) toast(res.msg, 'warn');
                ui.selected = target;
            }
            scheduleRender();
        });

        // Parcel list
        const plist = $('#parcelList');
        plist.addEventListener('dragstart', e => {
            const p = e.target.closest('[data-parcel]');
            if (!p) return;
            dragParcel = +p.dataset.parcel;
            e.dataTransfer.setData('text/x-parcel', p.dataset.parcel);
            e.dataTransfer.effectAllowed = 'copy';
            p.classList.add('dragging');
        });
        plist.addEventListener('dragend', e => { dragParcel = null; const p = e.target.closest('[data-parcel]'); if (p) p.classList.remove('dragging'); $$('#ship .drop-ok, #ship .drop-bad').forEach(n => n.classList.remove('drop-ok', 'drop-bad')); });
        plist.addEventListener('input', e => {
            if (e.target.dataset.act !== 'color') return;
            const id = +e.target.closest('[data-parcel]').dataset.parcel;
            const c = Planner.cargoById(state, id);
            c.color = e.target.value;
            e.target.closest('[data-parcel]').style.setProperty('--c', c.color);
        });
        plist.addEventListener('change', e => { if (e.target.dataset.act === 'color') commit(() => { }); scheduleRender(); });
        plist.addEventListener('click', e => {
            const b = e.target.closest('[data-act]');
            if (!b || b.dataset.act === 'color') return;
            const id = +b.closest('[data-parcel]').dataset.parcel;
            const c = Planner.cargoById(state, id);
            switch (b.dataset.act) {
                case 'sel': selectTank(b.dataset.tank, true); break;
                case 'edit': startEdit(id); break;
                case 'del':
                    commit(() => {
                        state.cargoes = state.cargoes.filter(x => x.id !== id);
                        Object.keys(state.plan).forEach(k => { if (state.plan[k].cargoId === id) delete state.plan[k]; });
                    });
                    if (editingId === id) resetForm();
                    toast(`Removed ${c.name} (Ctrl+Z to undo)`, 'info');
                    break;
                case 'stow': {
                    const res = commit(() => stowOnly(id));
                    const left = res.unplaced && res.unplaced[id];
                    toast(left > 0.05 ? `${fmt(left, 1)} t of ${c.name} does not fit in free compatible tanks` : `${c.name} stowed`, left > 0.05 ? 'warn' : 'ok');
                    break;
                }
                case 'max': {
                    const r = commit(() => Planner.maximize(state, id));
                    toast(`${c.name} → ${fmt(r.qty, 3)} t (limited by ${r.limitedBy})`, 'ok');
                    break;
                }
                case 'even': { const r = commit(() => Planner.evenOut(state, id)); if (r && r.msg) toast(r.msg, 'warn'); break; }
                case 'lock': {
                    const entries = Object.values(state.plan).filter(x => x.cargoId === id);
                    const lock = entries.some(x => !x.locked);
                    commit(() => entries.forEach(x => { x.locked = lock; }));
                    break;
                }
            }
        });

        // Tank table
        const table = $('#tankTable');
        table.addEventListener('change', e => {
            const n = e.target;
            const tid = n.dataset.tank;
            if (!tid) return;
            if (n.dataset.f === 'cargo') assign(tid, n.value ? +n.value : null);
            else if (n.dataset.f === 'lock') commit(() => { if (state.plan[tid]) state.plan[tid].locked = n.checked; });
            else editTankField(tid, n.dataset.f, n.value);
        });
        table.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('cell')) e.target.blur(); });
        table.addEventListener('focusin', e => { if (e.target.select && e.target.tagName === 'INPUT') e.target.select(); });
        table.addEventListener('click', e => {
            const tr = e.target.closest('tr[data-row]');
            if (tr && !e.target.closest('input,select')) selectTank(tr.dataset.row, true);
        });

        // DWT / ballast
        const dwt = $('#dwtPanel');
        dwt.addEventListener('change', e => {
            const n = e.target;
            if (n.dataset.w) commit(() => { state.weights[n.dataset.w] = Math.max(0, num(n.value) || 0); });
            if (n.dataset.b) commit(() => { state.ballast[n.dataset.b] = Math.min(100, Math.max(0, num(n.value) || 0)); });
        });
        dwt.addEventListener('click', e => {
            const b = e.target.closest('[data-bal]');
            if (b) commit(() => { BALLAST_TANKS.forEach(t => { state.ballast[t.id] = +b.dataset.bal; }); });
        });

        // Findings → highlight tanks
        $('#findings').addEventListener('click', e => {
            const n = e.target.closest('[data-fi]');
            const f = n && $('#findings')._list[+n.dataset.fi];
            if (f && f.tanks) selectTank(f.tanks[0], true);
        });

        // Drawer
        const dr = $('#drawer');
        dr.addEventListener('click', e => {
            const b = e.target.closest('[data-act]');
            const su = e.target.closest('[data-su]');
            if (su) { ui.stepUnit = su.dataset.su; $$('#dStepUnit button').forEach(x => x.classList.toggle('on', x === su)); persist(); return; }
            if (!b) return;
            const tid = ui.selected;
            const r = sum.byTank[tid];
            const rb = state.settings.rebalance;
            let res = null;
            switch (b.dataset.act) {
                case 'close': selectTank(null); return;
                case 'sel': selectTank(b.dataset.tank, true); return;
                case 'step': {
                    if (!r.c) return;
                    const dir = +b.dataset.dir, step = +ui.step;
                    const k = sum.cargoes.find(x => x.c.id === r.c.id);
                    res = commit(() => ui.stepUnit === '%' ? Planner.setTankPct(state, tid, r.pct + dir * step, rb)
                        : ui.stepUnit === 'm3' ? Planner.setTankVolume(state, tid, r.vol + dir * step, rb)
                            : Planner.setTankVolume(state, tid, r.vol + dir * step / k.p.mpm, rb));
                    break;
                }
                case 'fillmax': res = commit(() => Planner.setTankVolume(state, tid, r.maxVol, rb)); break;
                case 'matchpair': res = commit(() => Planner.setTankPct(state, tid, sum.byTank[r.t.pairId].pct, rb)); break;
                case 'evenparcel': res = commit(() => Planner.evenOut(state, r.c.id)); break;
                case 'empty': commit(() => Planner.assignTank(state, tid, null, rb)); break;
                case 'lock': commit(() => { if (state.plan[tid]) state.plan[tid].locked = b.checked; }); break;
                case 'rebal': commit(() => { state.settings.rebalance = b.checked; }); break;
            }
            if (res && res.msg) { toast(res.msg, 'warn'); setTimeout(() => drawerMsg(res.msg), 20); }
        });
        dr.addEventListener('change', e => {
            const n = e.target;
            const tid = ui.selected;
            if (n.id === 'dCargo') assign(tid, n.value ? +n.value : null);
            else if (n.id === 'dStepSize') { ui.step = +n.value; persist(); }
            else if (n.dataset.f) editTankField(tid, n.dataset.f, n.value);
            else if (n.id === 'dRange') finishDrag();
        });
        dr.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.f) e.target.blur(); });
        dr.addEventListener('focusin', e => { if (e.target.dataset.f && e.target.select) e.target.select(); });
        dr.addEventListener('pointerdown', e => { if (e.target.id === 'dRange') dragBefore = snap(); });
        dr.addEventListener('input', e => {
            if (e.target.id !== 'dRange') return;
            const tid = ui.selected;
            if (!dragBefore) dragBefore = snap(); // keyboard arrows
            Planner.setTankPct(state, tid, +e.target.value, state.settings.rebalance);
            render();
        });
        const finishDrag = () => {
            if (!dragBefore) return;
            if (snap() !== dragBefore) pushUndo(dragBefore);
            dragBefore = null;
            scheduleRender();
        };
        window.addEventListener('pointerup', () => { if (dragBefore) setTimeout(finishDrag, 0); });

        // Global keys
        document.addEventListener('keydown', e => {
            const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
            if ((e.ctrlKey || e.metaKey) && !typing) {
                if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
                else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
            }
            if (e.key === 'Escape' && ui.selected && !$('#settingsDlg').open) selectTank(null);
        });
        window.addEventListener('afterprint', () => { $('#printArea').innerHTML = ''; });
    }

    wire();
    render();
})();
