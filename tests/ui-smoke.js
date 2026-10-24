// Run: npm run test:ui
// Drives index.html in a real browser: add parcels → optimise → save → reopen, plus the
// deadweight prompt and a hostile plan file. Uses the installed Chrome, or the Chromium at
// $CHROMIUM_PATH (e.g. /opt/pw-browsers/chromium).
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright-core');

const INDEX = 'file://' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✘ ') + msg); if (!cond) failed++; };

async function addParcel(page, name, qty) {
    await page.fill('#fName', name);
    await page.keyboard.press('Enter'); // pick the first autocomplete match
    await page.fill('#fQty', String(qty));
    await page.click('#btnSubmit');
    await page.waitForTimeout(300);
}

(async () => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chrome' });
    const page = await browser.newPage({ acceptDownloads: true });
    const errors = [];
    const dialogs = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('cargoOptimizerAda.v2') || 'null'));

    await page.goto(INDEX);
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    console.log('Add parcels and optimise');
    await addParcel(page, 'Methanol', 1500);
    await addParcel(page, 'Caustic Soda', 1200);
    ok(await page.locator('#parcelList .parcel').count() === 2, 'two parcels listed');
    await page.click('#btnOptimize');
    await page.waitForTimeout(2500);
    let st = await stored();
    ok(st && Object.keys(st.plan).length > 0, `plan stored with ${st ? Object.keys(st.plan).length : 0} tanks`);
    ok(dialogs.length === 0, 'no deadweight prompt when the cargo fits');
    ok(await page.evaluate(() => window.Engine && Engine.ready), 'C++ engine (WebAssembly) loaded from file://');
    ok(/C\+\+ deep search/.test(await page.locator('#toasts').innerText()), 'plan made by the C++ deep search');

    console.log('Save and reopen');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cargo-')), 'plan.json');
    await download.saveAs(file);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    ok(await page.locator('#parcelList .parcel').count() === 0, 'cleared');
    await page.setInputFiles('#fileOpen', file);
    await page.waitForTimeout(500);
    const reopened = await stored();
    ok(JSON.stringify(reopened.plan) === JSON.stringify(st.plan), 'reopened plan equals the saved one');

    console.log('Deadweight prompt');
    await addParcel(page, 'Glycerine', 4000);
    await page.click('#btnOptimize');
    await page.waitForTimeout(2500);
    ok(dialogs.some(m => /exceeds .* deadweight/.test(m)), 'asked before fitting to deadweight');
    st = await stored();
    const totals = await page.evaluate(() => Planner.summarize(JSON.parse(localStorage.getItem('cargoOptimizerAda.v2'))).totals);
    ok(totals.margin > -0.5, `accepted → within deadweight (margin ${totals.margin.toFixed(1)} t)`);

    console.log('Hostile plan file');
    const evil = path.join(path.dirname(file), 'evil.json');
    fs.writeFileSync(evil, JSON.stringify({ cargoes: [{ id: 1, sg: 0.8, name: '<img src=x onerror=alert(1)>', qty: 100, color: '#fff" onmouseover="alert(2)', rg: '<b>' }], plan: { COT1P: { cargoId: 1, vol: 50 } } }));
    dialogs.length = 0;
    await page.setInputFiles('#fileOpen', evil);
    await page.waitForTimeout(500);
    await page.hover('[data-tank="COT1P"]');
    await page.waitForTimeout(200);
    ok(dialogs.length === 0, 'no script ran from the opened file');

    ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await browser.close();
    console.log(failed ? `\n${failed} FAILED` : '\nAll UI checks passed');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
