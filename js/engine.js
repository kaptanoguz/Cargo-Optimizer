/**
 * engine.js — C++ stowage engine (engine/stowage.cpp) compiled to WebAssembly.
 *
 * Engine.run(input) takes the same input as Optimizer.run and returns the same result, plus
 * `engine: 'cpp'`. The module is embedded as base64 in engine-wasm.js (regenerate with
 * `npm run build:engine`) so the app still opens from file:// without a server.
 * Until the module is ready — or if WebAssembly is unavailable — Engine.ready is false and
 * the planner uses the JavaScript optimiser instead.
 */
(function (global) {
    'use strict';

    // Deep search: twice the JavaScript search width. Typical plans still finish in a few hundred ms,
    // well inside the time budget, and on plans with many parcels it finds better stowages.
    const DEEP = { branch: [48, 24, 16], cands: 800 };
    const Engine = { ready: false, error: null, DEEP, encode, decode, run };
    let wasm = null;

    function bytesOf(b64) {
        const bin = typeof atob === 'function' ? atob(b64) : global.Buffer.from(b64, 'base64').toString('binary');
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    const imports = { env: { now_ms: () => Date.now() } };
    function use(instance) { wasm = instance.exports; Engine.ready = true; }

    function load() {
        if (typeof WebAssembly !== 'object' || !global.STOWAGE_WASM_B64) { Engine.error = 'WebAssembly not available'; return; }
        const bytes = bytesOf(global.STOWAGE_WASM_B64);
        try {
            use(new WebAssembly.Instance(new WebAssembly.Module(bytes), imports));
        } catch (e) {
            // Some browsers refuse synchronous compilation on the main thread
            Engine.pending = WebAssembly.instantiate(bytes, imports)
                .then(r => use(r.instance))
                .catch(err => { Engine.error = String(err && err.message || err); });
        }
    }

    /** Flatten an Optimizer.run input into the number array stowage.cpp reads. */
    function encode(input) {
        const tanks = input.tanks;
        const n = tanks.length;
        const cargoes = input.cargoes;
        const fixed = input.fixed || [];
        const keys = new Map();
        const keyOf = id => { if (!keys.has(id)) keys.set(id, keys.size); return keys.get(id); };
        const idx = id => tanks.findIndex(t => t.id === id);
        const a = [2, n, cargoes.length, fixed.length, input.timeMs || 1200,
            input.listAllowance ?? input.listLimit ?? 150, input.slackPct ?? global.Optimizer.DEFAULT_SLACK_PCT, input.baseImb || 0];
        const search = Object.assign({}, global.Optimizer.SEARCH, input.search);
        a.push(...search.branch, search.cands);
        tanks.forEach(t => a.push(t.cap, t.side === 'P' ? 1 : 0, t.row, t.slop ? 1 : 0, idx(t.pairId), t.neighborMask));
        fixed.forEach(f => a.push(f.idx, keyOf(f.cargoId), f.mass));
        cargoes.forEach(c => {
            a.push(keyOf(c.id), c.need, c.mpm, c.allowedMask, c.strategy === 'CONSOLIDATED' ? 1 : 0);
            for (let i = 0; i < n; i++) a.push(c.capVol[i]);
            for (let i = 0; i < n; i++) a.push(c.capMass[i]);
        });
        // Only live parcels are searched; skip the compatibility lookups for the rest
        const live = cargoes.map(c => c.need > 0.01);
        cargoes.forEach((c, i) => cargoes.forEach((o, j) => a.push(i !== j && live[i] && live[j] && input.conflict(c.id, o.id) ? 1 : 0)));
        cargoes.forEach((c, i) => fixed.forEach(f => a.push(live[i] && input.conflict(c.id, f.cargoId) ? 1 : 0)));
        return { data: a, ids: [...keys.keys()] };
    }

    /** Turn the engine's output numbers back into an Optimizer.run result. */
    function decode(out, ids) {
        let p = 0;
        const nodes = out[p++], ms = out[p++], timedOut = !!out[p++], score = out[p++], hasBest = !!out[p++];
        const tanksUsed = out[p++], imb = out[p++], stage = out[p++], waste = out[p++], slack = out[p++], pass = out[p++];
        const nLive = out[p++];
        const result = { assignments: {}, unplaced: {}, nodes, ms, timedOut, score, engine: 'cpp' };
        if (!hasBest) return result;
        for (let k = 0; k < nLive; k++) {
            const id = ids[out[p++]];
            const unplaced = out[p++];
            const cnt = out[p++];
            const list = [];
            for (let e = 0; e < cnt; e++) { list.push({ idx: out[p], vol: out[p + 1] }); p += 2; }
            result.assignments[id] = list;
            result.unplaced[id] = unplaced;
        }
        Object.assign(result, { tanksUsed, imb, stage, waste, slack, pass: pass === 1 ? 'waste' : pass === 2 ? 'pairs' : undefined });
        return result;
    }

    function run(input) {
        if (!Engine.ready) throw new Error('C++ engine not loaded' + (Engine.error ? ': ' + Engine.error : ''));
        const { data, ids } = encode(input);
        const ptr = wasm.stow_input(data.length);
        new Float64Array(wasm.memory.buffer, ptr, data.length).set(data);
        const out = wasm.stow_run() >> 3;
        const mem = new Float64Array(wasm.memory.buffer);   // fresh view: memory may have grown during the run
        let len = 12;
        for (let k = 0; k < mem[out + 11]; k++) len += 3 + 2 * mem[out + len + 2];
        return decode(mem.slice(out, out + len), ids);
    }

    load();
    global.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
