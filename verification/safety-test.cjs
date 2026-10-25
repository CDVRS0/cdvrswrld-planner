const { chromium }=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});global.browser=browser;
 const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();
 await page.goto('http://127.0.0.1:5187/');
 await page.getByLabel('Email',{exact:true}).fill(process.env.PLANNER_TEST_EMAIL);await page.getByLabel('Password',{exact:true}).fill(process.env.PLANNER_TEST_PASSWORD);await page.getByRole('button',{name:'Sign in to cloud',exact:true}).click();
 await page.getByRole('checkbox',{name:/I have checked my backup/}).check();await page.getByRole('button',{name:'Load cloud Planner',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved to cloud'}).waitFor();
 // No cloud write is allowed through the migration screen until backup + consent.
 await page.getByRole('button',{name:'Reconnect',exact:true}).click();
 await page.getByRole('checkbox',{name:/I have checked my backup/}).check();
 assert.equal(await page.getByRole('button',{name:'Import missing browser records & connect'}).isDisabled(),true);
 const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Download browser backup'}).click();await dl;
 assert.equal(await page.getByRole('button',{name:'Import missing browser records & connect'}).isEnabled(),true);
 const before=JSON.parse(await page.evaluate(()=>localStorage.getItem('cdvrs_planner_v5')));
 const sourceWeek=structuredClone(Object.values(before.weeks)[0]);
 sourceWeek.notes='Migration fixture: every field preserved';
 const entries=Object.entries(sourceWeek.days);sourceWeek.days=Object.fromEntries(entries.map(([key,value],i)=>[`2026-11-${String(i+2).padStart(2,'0')}`,value]));
 await page.locator('input[type=file]').setInputFiles({name:'planner-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({weeks:{'2026-11-02':sourceWeek}}))});
 assert.equal(await page.getByRole('button',{name:'Import missing browser records & connect'}).isDisabled(),true);
 await page.getByRole('checkbox',{name:/I have checked my backup/}).check();await page.getByRole('button',{name:'Import missing browser records & connect'}).click();
 await page.getByRole('status').filter({hasText:'Saved to cloud'}).waitFor();
 const imported=JSON.parse(await page.evaluate(()=>localStorage.getItem('cdvrs_planner_v5')));
 assert.deepEqual(imported.weeks['2026-11-02'],sourceWeek);
 // Fail a save deliberately, retain the edit, then retry.
 await page.route('**/rest/v1/planner_reflections*',route=>route.request().method()==='PATCH'?route.abort('failed'):route.continue());
 await page.getByRole('button',{name:'Open daily flow'}).click();const marker='Offline retained '+Date.now();await page.getByLabel('Energy',{exact:true}).fill(marker);
 await page.getByRole('status').filter({hasText:'Not fully saved'}).waitFor();
 assert.ok((await page.evaluate(()=>localStorage.getItem('cdvrs_planner_v5'))).includes(marker));
 await page.unroute('**/rest/v1/planner_reflections*');await page.getByRole('button',{name:'Retry save',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved to cloud'}).waitFor();
 // A second device edits the same week. The stale first device must not overwrite it.
 const second=await context.newPage();await second.goto('http://127.0.0.1:5187/');await second.getByRole('status').filter({hasText:'Saved to cloud'}).waitFor();await second.getByRole('button',{name:'Open daily flow'}).click();
 await second.getByLabel('Energy',{exact:true}).fill('Second device wins '+Date.now());await second.getByRole('status').filter({hasText:'Saved to cloud'}).waitFor();
 await page.getByLabel('Energy',{exact:true}).fill('Stale first device '+Date.now());await page.getByRole('status').filter({hasText:'changed in another tab or device'}).waitFor();
 console.log(JSON.stringify({backupAndConsentGate:true,fileImportPreservesWholeWeek:true,failedSaveRetained:true,retrySucceeded:true,concurrentOverwriteBlocked:true}));
 await browser.close();
})().catch(async e=>{console.error(e);await global.browser?.close();process.exitCode=1});
