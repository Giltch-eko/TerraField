'use strict';
// Start the server separately; defaults to localhost:8000. npm install && npx playwright install chromium.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const base=process.env.TERRAFIELD_TEST_URL||'http://127.0.0.1:8000';
 const context=await browser.newContext({viewport:{width:1440,height:900}});const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let requests=[];page.on('request',r=>{if(r.url().includes('/api/recommendations'))requests.push(r);});
 try {
  fs.mkdirSync('screenshots',{recursive:true});
  await page.goto(base);await page.waitForSelector('#profile-form');
  await page.screenshot({path:'screenshots/01-analysis.png',fullPage:true});
  await page.click('#recommend-button');await page.waitForSelector('#error-ph:not(:empty)');
  assert.equal(requests.length,0,'missing fields must not be sent');
  await page.click('[data-action="toggle-examples"]');await page.locator('[data-example]').first().click();
  assert.ok(await page.locator('#f-ph').inputValue());
  const original=await page.locator('#f-ph').inputValue();
  await page.fill('#f-ph','15');await page.click('#recommend-button');assert.match(await page.locator('#error-ph').innerText(),/between/);assert.equal(requests.length,0);
  await page.fill('#f-ph',original);
  // Verify failure handling preserves the profile, then retry against the real API.
  await page.route('**/api/recommendations',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Test outage'})}));
  await page.click('#recommend-button');await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('Test outage'));
  assert.equal(await page.locator('#f-ph').inputValue(),original);await page.unroute('**/api/recommendations');
  await page.click('#recommend-button');await page.waitForSelector('.rank-item');assert.ok(requests.length>=2);
  assert.equal(await page.locator('.rank-item').count(),6);
  await page.locator('.rank-more summary').first().click();assert.ok(await page.locator('.rank-more').first().evaluate(e=>e.open));
  const opts=await page.locator('#compare-b option').count();assert.equal(opts,21);
  await page.selectOption('#compare-b',{index:2});assert.equal(await page.locator('.compare-table').count(),1);
  await page.click('[data-action="toggle-all"]');assert.equal(await page.locator('.rank-item').count(),21);
  await page.screenshot({path:'screenshots/02-results.png',fullPage:true});
  await page.click('[data-action="save-report"]');await page.waitForSelector('[data-action="save-report"]:disabled');
  await page.reload();await page.waitForSelector('#profile-form');await page.click('.nav-item[data-nav="reports"]');await page.waitForSelector('[data-report-open]');
  await page.screenshot({path:'screenshots/03-reports.png',fullPage:true});
  await page.locator('[data-report-open]').first().click();await page.waitForSelector('.rank-item');
  assert.equal((await page.locator('.input-chips').innerText()).includes(`pH ${original}`),true);
  await page.evaluate(()=>{window.print=()=>{window.printEvidence={count:document.querySelectorAll('.rank-item').length,open:[...document.querySelectorAll('.rank-more')].every(d=>d.open),date:document.querySelector('.report-date')?.textContent};};});
  await page.click('[data-action="print"]');const pe=await page.evaluate(()=>window.printEvidence);assert.equal(pe.count,21);assert.equal(pe.open,true);assert.match(pe.date,/Report date/);
  await page.click('[data-action="toggle-all"]');await page.locator('.rank-more summary').evaluateAll(xs=>xs.forEach(x=>x.parentElement.open=true));
  await page.emulateMedia({media:'print'});assert.equal(await page.locator('.sidebar').isVisible(),false);await page.pdf({path:'screenshots/print-check.pdf',format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});
  await page.click('.button-row [data-nav="analysis"]');assert.equal(await page.locator('#f-ph').inputValue(),original);await page.fill('#f-ph','7.2');await page.click('#recommend-button');await page.waitForSelector('.rank-item');assert.match(await page.locator('.input-chips').innerText(),/pH 7.2/);
  for(const [selector,heading] of [['crops','A world of useful plants'],['soil','Explore'],['method','A little clarity']]) {await page.click(`.nav-item[data-nav="${selector}"]`);await page.waitForTimeout(300);assert.ok((await page.locator('#app').innerText()).includes(heading),selector);}
  for(const width of [1440,1024,768,390]){
   await page.setViewportSize({width,height:900});await page.goto(base+'/#analysis');await page.waitForSelector('#profile-form');
   const size=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,view:innerWidth}));assert.ok(size.doc<=size.view,`overflow ${width}: ${JSON.stringify(size)}`);
   if(width===390)await page.screenshot({path:'screenshots/04-mobile.png',fullPage:true});
  }
  assert.deepEqual(errors,[]);console.log('PASS browser: validation, failure recovery, example, real calculation, explanation, comparison, save/reload/open/edit, navigation, print CSS, 4 widths, console errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
