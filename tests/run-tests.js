// Run: node tests/run-tests.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { console, Date, Math, Number, Object, Array, Map, Set, Float64Array, JSON };
ctx.globalThis = ctx;
vm.createContext(ctx);
['vessel', 'cargo-db', 'physics', 'compat', 'optimizer', 'planner'].forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' }));

const { Planner, Physics, Compat, CARGO_BY_NAME, CARGO_TANKS } = ctx;
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✘ ') + msg); if (!cond) failed++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

let nextId = 1;
function parcel(name, qty, extra) {
    const p = CARGO_BY_NAME[name.toLowerCase()];
    if (!p) throw new Error('no product ' + name);
    return Object.assign({
        id: nextId++, parcelNo: '', name: p.n, sg: p.sg, ref: p.ref, g: p.g, rg: p.rg, pc: p.pc, st: p.st,
        beta: p.beta, vcfTable: p.vcfTable, heat: p.heat || null, maxT: p.maxT, minT: p.minT, f: p.f, un: p.un,
        loadT: null, voyT: p.heat ? p.heat[1] : null, qty, color: '#888', strategy: 'BALANCED'
    }, extra);
}
function plan(state) {
    return CARGO_TANKS.map(t => { const e = state.plan[t.id]; return e ? `${t.short}:${Planner.cargoById(state, e.cargoId).name.split(' ')[0]}` : null; }).filter(Boolean).join(' ');
}

console.log('Physics');
const diesel = parcel('Diesel (EN590)', 1000, { loadT: 35 });
ok(near(Physics.densityAt(diesel, 15), 0.835, 1e-9), 'density at ref = sg');
ok(near(Physics.vcf(diesel, 35), 0.9832, 0.0006), `ASTM 54B VCF 0.835 @35 °C ≈ 0.9832 (got ${Physics.vcf(diesel, 35).toFixed(4)})`);
const base = parcel('Base Oil (SN150)', 1000, { loadT: 40 });
ok(Physics.vcfTable(base) === '54D' && Physics.vcfTable(diesel) === '54B', 'base oil → Table 54D, diesel → Table 54B');
ok(near(Physics.vcf(base, 40), 0.98187, 0.00005), `ASTM 54D VCF 0.870 @40 °C ≈ 0.98187 (got ${Physics.vcf(base, 40).toFixed(5)})`);
const lube = parcel('Lube Oil', 500);
ok(Physics.vcfTable(lube) === '54D', 'lube oil → Table 54D');
const h2so4 = parcel('Sulphuric Acid (98%)', 1000);
ok(near(Physics.fillLimit(h2so4, {}).pct, 98 * 1.54 / 1.84, 0.01), 'SG 1.84 → 82.0 % fill');
const palm = parcel('Palm Stearin (RBD)', 1000, { loadT: 40, voyT: 45 });
const lp = Physics.fillLimit(palm, {});
ok(lp.rule === 'thermal' && lp.pct < 98 && lp.pct > 97.5, `thermal limit for warming cargo (${lp.pct.toFixed(2)} %)`);

console.log('Compatibility');
ok(Compat.groupsIncompatible(2, 20), 'sulphuric ⨯ alcohols');
ok(!Compat.groupsIncompatible(32, 20), 'aromatics + alcohols ok');
const styrene = parcel('Styrene Monomer', 500);
const wax = parcel('Paraffin Wax', 500, { loadT: 65, voyT: 75 });
ok(Compat.pairConflict(styrene, wax) && Compat.pairConflict(styrene, wax).code === 'HEAT', 'styrene next to heated wax flagged');

console.log('Optimiser — single parcel uses minimum tanks');
let s = Planner.newState();
s.cargoes.push(parcel('Methanol', 1100));
let r = Planner.optimize(s);
let sum = Planner.summarize(s);
ok(sum.totals.tanksUsed === 2, `1100 t methanol in 2 tanks (${plan(s)})`);
ok(near(sum.totals.cargoMass, 1100, 0.01), 'all cargo placed');
ok(Math.abs(sum.totals.list) < 150, `upright (list ${sum.totals.list.toFixed(1)} t)`);

console.log('Optimiser — full ship, segregation');
s = Planner.newState();
s.cargoes.push(parcel('Sulphuric Acid (98%)', 1500));
s.cargoes.push(parcel('Methanol', 1000));
s.cargoes.push(parcel('Caustic Soda (50%)', 1200, { loadT: 25 }));
s.cargoes.push(parcel('Toluene', 900));
r = Planner.optimize(s);
sum = Planner.summarize(s);
const segr = sum.findings.filter(f => f.code === 'Segregation' || f.code === 'Heat transfer');
ok(segr.length === 0, `no segregation conflicts (${plan(s)}) ${segr.map(f => f.msg).join('; ')}`);
ok(near(sum.totals.cargoMass, 4600, 0.5), `all 4600 t placed (${sum.totals.cargoMass.toFixed(1)}) in ${sum.totals.tanksUsed} tanks, ${r.ms} ms, ${r.nodes} nodes`);
ok(sum.findings.every(f => f.code !== 'List' || /ballast in/.test(f.msg)), `list ${sum.totals.list.toFixed(1)} t correctable (${(sum.findings.find(f => f.code === 'List') || { msg: 'within limit' }).msg})`);

console.log('Optimiser — styrene vs heated wax kept apart');
s = Planner.newState();
s.cargoes.push(styrene, wax, parcel('Ethanol', 900));
r = Planner.optimize(s);
sum = Planner.summarize(s);
ok(sum.findings.filter(f => f.level === 'danger').length === 0, `no danger findings (${plan(s)})`);

console.log('Manual edit — rebalance keeps parcel total');
s = Planner.newState();
s.cargoes.push(parcel('Methanol', 900));
Planner.assignTank(s, 'COT3P', s.cargoes[0].id, true);
Planner.assignTank(s, 'COT3S', s.cargoes[0].id, true);
Planner.evenOut(s, s.cargoes[0].id);
const tid = 'COT3P';
const before = Planner.plannedMass(s, s.cargoes[0]);
Planner.setTankPct(s, tid, 60, true);
ok(near(Planner.plannedMass(s, s.cargoes[0]), before, 0.01), 'total unchanged after editing one tank to 60 %');
ok(near(s.plan[tid].vol / CARGO_TANKS.find(t => t.id === tid).cap * 100, 60, 0.01), 'edited tank at 60 %');
Planner.assignTank(s, 'COT5P', s.cargoes[0].id, true);
ok(near(Planner.plannedMass(s, s.cargoes[0]), before, 0.01) && s.plan.COT5P.vol > 0, 'assigning an extra tank spreads the parcel, total unchanged');
const fr = Planner.setTankPct(s, tid, 120, true);
ok(s.plan[tid].vol <= CARGO_TANKS.find(t => t.id === tid).cap * 0.98 + 1e-6 && /Capped/.test(fr.msg), 'cannot exceed fill limit');

console.log('Locked tanks respected');
s = Planner.newState();
s.cargoes.push(parcel('Methanol', 1100), parcel('Toluene', 600));
s.plan.COT1P = { cargoId: s.cargoes[1].id, vol: 300, locked: true };
Planner.optimize(s);
ok(s.plan.COT1P.locked && s.plan.COT1P.vol === 300 && s.plan.COT1P.cargoId === s.cargoes[1].id, `locked tank untouched (${plan(s)})`);
ok(near(Planner.plannedMass(s, s.cargoes[1]), 600, 0.5), 'rest of locked parcel placed elsewhere');

console.log('Maximise');
s = Planner.newState();
s.cargoes.push(parcel('Diesel (EN590)', 1000));
Planner.optimize(s);
const m = Planner.maximize(s, s.cargoes[0].id);
sum = Planner.summarize(s);
ok(sum.totals.dwt <= sum.totals.limit + 0.01, `DWT within limit (${sum.totals.dwt.toFixed(1)} / ${sum.totals.limit})`);
ok(m.qty > 5000, `diesel maximised to ${m.qty} t (${m.limitedBy}) in ${sum.totals.tanksUsed} tanks`);

console.log('Stress — 7 parcels');
s = Planner.newState();
['Benzene', 'Methanol', 'MEK (Methyl Ethyl Ketone)', 'Phosphoric Acid (75%)', 'Monoethylene Glycol (MEG)', 'Palm Olein (RBD)', 'Ethyl Acetate']
    .forEach((n, i) => s.cargoes.push(parcel(n, 550 + i * 40)));
r = Planner.optimize(s);
sum = Planner.summarize(s);
ok(r.ms < 3000, `finished in ${r.ms} ms (${r.nodes} nodes${r.timedOut ? ', time budget hit' : ''})`);
ok(sum.findings.filter(f => f.level === 'danger').length === 0, `no danger findings, ${sum.totals.tanksUsed} tanks (${plan(s)})`);
ok(near(sum.totals.cargoMass, sum.totals.nominal, 0.5), `all ${sum.totals.nominal} t placed`);

console.log('Hard case — acid + caustic + alcohol + styrene + heated wax');
s = Planner.newState();
s.cargoes.push(parcel('Caustic Soda (50%)', 1200, { loadT: 25 }), parcel('Sulphuric Acid (98%)', 1400), parcel('Methanol', 900),
    parcel('Styrene Monomer', 650, { loadT: 18 }), parcel('Paraffin Wax', 500, { loadT: 68, voyT: 75 }));
r = Planner.optimize(s);
sum = Planner.summarize(s);
ok(near(sum.totals.cargoMass, sum.totals.nominal, 0.5), `all ${sum.totals.nominal} t placed (${sum.totals.cargoMass.toFixed(1)}) in ${sum.totals.tanksUsed} tanks, ${r.ms} ms (${plan(s)})`);
ok(sum.findings.filter(f => f.level === 'danger').length === 0, 'no danger findings ' + sum.findings.filter(f => f.level === 'danger').map(f => f.msg).join('; '));

console.log('Slack avoidance — one tank at ~70 % beats two at ~35 %');
s = Planner.newState();
s.cargoes.push(parcel('Methanol', 400));
Planner.optimize(s);
sum = Planner.summarize(s);
ok(sum.totals.tanksUsed === 1 && sum.totals.slack === 0 && sum.findings.every(f => f.level !== 'danger'), `400 t methanol → ${plan(s)} at ${sum.tanks.filter(r => r.c).map(r => r.pct.toFixed(1) + '%').join(', ')}`);
s = Planner.newState();
s.cargoes.push(parcel('Toluene', 450), parcel('Ethanol', 450));
Planner.optimize(s);
sum = Planner.summarize(s);
ok(sum.totals.tanksUsed === 2 && sum.totals.slack === 0, `two small parcels balance each other: ${plan(s)} (${sum.tanks.filter(r => r.c).map(r => r.pct.toFixed(1) + '%').join(', ')}, list ${sum.totals.list.toFixed(1)} t)`);
s = Planner.newState();
s.cargoes.push(parcel('Monoethylene Glycol (MEG)', 1500));
Planner.optimize(s);
sum = Planner.summarize(s);
const freeVol = sum.tanks.filter(r => r.c).reduce((a, r) => a + r.maxVol - r.vol, 0);
ok(freeVol < 120, `1500 t MEG: tight fit, ${freeVol.toFixed(1)} m³ empty in used tanks (${plan(s)}, ${sum.tanks.filter(r => r.c).map(r => r.pct.toFixed(1) + '%').join(', ')})`);

console.log('Cross stowage when it leaves less empty space (base oils @40 °C, 54D)');
s = Planner.newState();
const bo = (n, sg, q) => Object.assign(parcel('Base Oil (SN150)', q, { loadT: 40 }), { name: n, sg });
s.cargoes.push(bo('Yubase 4', 0.84, 900), bo('Yubase 6', 0.84, 1850), bo('60N', 0.83, 1000));
r = Planner.optimize(s);
sum = Planner.summarize(s);
const emptyM3 = sum.tanks.filter(x => x.c).reduce((a2, x) => a2 + x.maxVol - x.vol, 0);
ok(sum.totals.tanksUsed === 8 && emptyM3 < 660, `8 tanks, ${emptyM3.toFixed(0)} m³ empty (pairs-only would leave 1054) — ${plan(s)} [pass: ${r.pass}]`);
ok(r.stage < 1300, `worst load/discharge-stage list ${r.stage.toFixed(0)} t (no grade all on one side)`);

console.log(failed ? `\n${failed} FAILED` : '\nAll tests passed');
process.exit(failed ? 1 : 0);
