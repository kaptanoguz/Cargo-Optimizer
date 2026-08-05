const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', headless:true });
  const p = await b.newPage({ viewport:{width:1280,height:900}, deviceScaleFactor:2 });
  p.on('pageerror', e=>console.log('ERR', e.message));
  await p.goto('file://'+process.cwd()+'/index.html');
  await p.waitForTimeout(800);
  await p.screenshot({ path:'screenshot.png', fullPage:true });
  console.log('SIGNED shot done');
  await b.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
