// Run: node tests/engine-parity.js [--cases N] [--bench]
// Checks that the C++ engine (WebAssembly, and the native build when a compiler is present)
// returns exactly the plan and score of the JavaScript optimiser: same tanks, same volumes,
// same score bit for bit, same number of search nodes. Cases where the JavaScript search hits
// its time limit are not compared (the faster engine searches further there by design).
// --bench also times both engines on hard cases with the app's normal 1.5 s budget.
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const CASES = arg('--cases', 120);

const ctx = { console, Date, Math, Number, Object, Array, Map, Set, Float64Array, Uint8Array, JSON, WebAssembly, atob, Promise, String, Error };
ctx.globalThis = ctx;
vm.createContext(ctx);
['vessel', 'cargo-db', 'physics', 'compat', 'optimizer', 'engine-wasm', 'engine', 'planner'].forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' }));
const { Planner, Optimizer, Engine, CARGO_DB, CARGO_TANKS, BALLAST_TANKS } = ctx;

let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✘ ') + msg); if (!cond) failed++; };

// Deterministic PRNG (mulberry32) so a failing case can be reproduced
function rng(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function parcel(p, id, qty, extra) {
    return Object.assign({
        id, parcelNo: '', name: p.n, sg: p.sg, ref: p.ref, g: p.g, rg: p.rg, pc: p.pc, st: p.st,
        beta: p.beta, vcfTable: p.vcfTable, heat: p.heat || null, maxT: p.maxT, minT: p.minT, f: p.f, un: p.un,
        loadT: p.heat ? p.heat[0] : null, voyT: p.heat ? p.heat[1] : null, qty, color: '#888', strategy: 'BALANCED'
    }, extra);
}

function randomState(seed) {
    const r = rng(seed);
    const pick = a => a[Math.floor(r() * a.length)];
    const s = Planner.newState();
    s.settings.slackPct = pick([65, 65, 50, 0, 80]);
    s.settings.allowSlops = r() > 0.25;
    s.settings.listLimit = pick([150, 100, 50]);
    const products = CARGO_DB.filter(p => p.st !== 1);
    const np = 1 + Math.floor(r() * 5);
    for (let i = 0; i < np; i++) {
        s.cargoes.push(parcel(pick(products), i + 1, Math.round(150 + r() * (5000 / np)), { strategy: r() < 0.25 ? 'CONSOLIDATED' : 'BALANCED' }));
    }
    if (r() < 0.3) BALLAST_TANKS.forEach(b => { if (r() < 0.3) s.ballast[b.id] = Math.round(r() * 100); });
    if (r() < 0.3) {
        // a locked tank holding part of the first parcel
        const t = pick(CARGO_TANKS);
        s.plan[t.id] = { cargoId: 1, vol: Math.round(t.cap * (0.4 + r() * 0.5)), locked: true };
    }
    return s;
}

const strip = res => { const o = Object.assign({}, res); delete o.ms; delete o.engine; return o; };
const same = (a, b) => JSON.stringify(strip(a)) === JSON.stringify(strip(b));
function firstDiff(a, b) {
    const x = strip(a), y = strip(b);
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) return `${k}: js ${JSON.stringify(x[k])} vs cpp ${JSON.stringify(y[k])}`;
    return '';
}

// Native build (optional): reuse build/stowage, or compile it if a C++ compiler is installed
let native = path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'stowage.exe' : 'stowage');
if (!fs.existsSync(native)) {
    try {
        fs.mkdirSync(path.dirname(native), { recursive: true });
        execFileSync(process.env.CXX || 'g++', ['-std=c++17', '-O2', '-ffp-contract=off',
            path.join(__dirname, '..', 'engine', 'stowage.cpp'), path.join(__dirname, '..', 'engine', 'native_cli.cpp'), '-o', native], { stdio: 'ignore' });
    } catch (e) { native = null; }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stowage-'));
function runNative(input) {
    const { data, ids } = Engine.encode(input);
    const file = path.join(tmp, 'in.txt');
    fs.writeFileSync(file, data.map(v => String(v)).join('\n'));
    const out = execFileSync(native, { input: fs.readFileSync(file) }).toString().trim().split('\n').map(Number);
    return Engine.decode(out, ids);
}

ok(Engine.ready, `C++ engine loaded (WebAssembly)${Engine.error ? ' — ' + Engine.error : ''}`);
console.log(native ? `Native build: ${path.relative(process.cwd(), native)}` : 'Native build: no C++ compiler, skipped');

console.log(`\nParity on ${CASES} random plans (1–5 parcels, locks, ballast, slack / slop / list settings)`);
let compared = 0, skipped = 0, nativeCompared = 0, mismatches = 0;
for (let seed = 1; seed <= CASES; seed++) {
    const s = randomState(seed);
    const js = Optimizer.run(Planner.optimizerInput(s, { timeMs: 8000 }).input);
    if (js.timedOut) { skipped++; continue; }
    const cpp = Engine.run(Planner.optimizerInput(s, { timeMs: 8000 }).input);
    compared++;
    if (!same(js, cpp)) { mismatches++; ok(false, `seed ${seed}: wasm differs — ${firstDiff(js, cpp)}`); continue; }
    if (native && seed % 4 === 0) {
        const nat = runNative(Planner.optimizerInput(s, { timeMs: 8000 }).input);
        nativeCompared++;
        if (!same(js, nat)) { mismatches++; ok(false, `seed ${seed}: native differs — ${firstDiff(js, nat)}`); }
    }
}
console.log('Deep search (wider tree) — the JavaScript optimiser given the same width must agree too');
let deepCompared = 0;
for (let seed = 1; seed <= CASES; seed += 6) {
    const s = randomState(seed);
    const inJs = Planner.optimizerInput(s, { timeMs: 20000 }).input, inCpp = Planner.optimizerInput(s, { timeMs: 20000 }).input;
    inJs.search = inCpp.search = Engine.DEEP;
    const js = Optimizer.run(inJs);
    if (js.timedOut) continue;
    const cpp = Engine.run(inCpp);
    deepCompared++;
    if (!same(js, cpp)) { mismatches++; ok(false, `seed ${seed} deep: wasm differs — ${firstDiff(js, cpp)}`); }
}
ok(mismatches === 0 && compared > 0, `${compared} plans identical in JS and WebAssembly${native ? `, ${nativeCompared} also in the native build` : ''} (score, tanks, volumes, node count), ${deepCompared} with deep search${skipped ? ` — ${skipped} skipped, JS hit its time limit` : ''}`);

console.log('\nPlanner uses the C++ deep search by default, the others on request');
let s = randomState(7);
ok(s.settings.engine === 'cpp' && Planner.optimize(s).engine === 'cpp', 'default settings → C++ deep search');
const viaPlanner = engine => {
    const st = randomState(11);
    st.settings.engine = engine;
    const res = Planner.optimize(st);
    return { res, plan: JSON.stringify(st.plan) };
};
const pStd = viaPlanner('cpp-std'), pJs = viaPlanner('js');
ok(pStd.res.engine === 'cpp-std' && pJs.res.engine === 'js' && pStd.plan === pJs.plan, '"cpp-std" and "js" stow the same plan through the planner');

if (process.argv.includes('--bench')) {
    console.log('\nSpeed on hard plans (app budget 1.5 s, same search width)');
    const hard = [];
    for (let seed = 1000; hard.length < 6 && seed < 3000; seed++) {
        const st = randomState(seed);
        if (st.cargoes.length < 4) continue;
        const r = Optimizer.run(Planner.optimizerInput(st, { timeMs: 400 }).input);
        if (r.timedOut) hard.push(st);
    }
    hard.forEach((st, i) => {
        const js = Optimizer.run(Planner.optimizerInput(st).input);
        const cpp = Engine.run(Planner.optimizerInput(st).input);
        const rate = r => (r.nodes / Math.max(1, r.ms)).toFixed(0);
        console.log(`  case ${i + 1}: JS ${js.nodes} nodes / ${js.ms} ms (${rate(js)}/ms)${js.timedOut ? ' time limit' : ''} · score ${js.score.toFixed(2)}  |  C++ ${cpp.nodes} nodes / ${cpp.ms} ms (${rate(cpp)}/ms)${cpp.timedOut ? ' time limit' : ''} · score ${cpp.score.toFixed(2)}`);
        ok(cpp.score <= js.score + 1e-9, `case ${i + 1}: C++ plan at least as good as JS (${cpp.score.toFixed(2)} ≤ ${js.score.toFixed(2)})`);
    });

    console.log('\nApp as before (JavaScript) vs C++ deep search, 40 plans with 3–7 parcels, 1.5 s each');
    const tally = { better: 0, same: 0, worse: 0, jsLimit: 0, cppLimit: 0, jsMs: 0, cppMs: 0 };
    for (let seed = 5000; seed < 5040; seed++) {
        const st = randomState(seed);
        while (st.cargoes.length < 3) st.cargoes.push(parcel(CARGO_DB[(seed * 13 + st.cargoes.length * 7) % CARGO_DB.length], st.cargoes.length + 1, 800));
        const js = Optimizer.run(Planner.optimizerInput(st).input);
        const inp = Planner.optimizerInput(st).input;
        inp.search = Engine.DEEP;
        const cpp = Engine.run(inp);
        tally[cpp.score < js.score - 1e-6 ? 'better' : cpp.score > js.score + 1e-6 ? 'worse' : 'same']++;
        if (js.timedOut) tally.jsLimit++;
        if (cpp.timedOut) tally.cppLimit++;
        tally.jsMs += js.ms; tally.cppMs += cpp.ms;
    }
    console.log(`  C++ deep better in ${tally.better}, same in ${tally.same}, worse in ${tally.worse} · time limit hit: JS ${tally.jsLimit}, C++ ${tally.cppLimit} · mean ${(tally.jsMs / 40).toFixed(0)} ms vs ${(tally.cppMs / 40).toFixed(0)} ms`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nAll engine checks passed');
process.exit(failed ? 1 : 0);
