// Disposable fixture account only; this test makes two live CDVRS AI calls.
const {chromium}=require('/Users/grindandghost/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.PLANNER_BASE_URL;
const saved=p=>p.locator('.cloud-panel [role=status]').filter({hasText:/^Saved to cloud$/}).waitFor({timeout:30000});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});global.browser=browser;
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Europe/London'}),page=await context.newPage();global.page=page;page.setDefaultTimeout(30000);
 const origin=new URL(base).origin;if(process.env.PLANNER_PREVIEW_OIDC)await page.route(origin+'/**',r=>r.continue({headers:{...r.request().headers(),'x-vercel-trusted-oidc-idp-token':process.env.PLANNER_PREVIEW_OIDC}}));
 await page.goto(base);await page.getByLabel('Email',{exact:true}).fill(process.env.PLANNER_TEST_EMAIL);await page.getByLabel('Password',{exact:true}).fill(process.env.PLANNER_TEST_PASSWORD);await page.getByRole('button',{name:'Sign in to cloud',exact:true}).click();await page.getByRole('checkbox',{name:/I have checked my backup/}).check();await page.getByRole('button',{name:'Load cloud Planner',exact:true}).click();await saved(page);
 await page.locator('.flow-rail button').filter({hasText:'Work'}).click();
 await page.getByLabel('Relevant work today',{exact:true}).fill('Keep the next step short.');
 const checklist=page.locator('.guided-step .step-checklist');await checklist.locator('.mini-input-row input').fill('Prepare amber demo export');await checklist.getByRole('button',{name:'Add',exact:true}).click();await saved(page);
 const draft='Name my unfinished Work action containing amber, then suggest one small next step. One sentence.';
 await page.getByLabel('Ask the Work Agent',{exact:true}).fill(draft);await saved(page);await page.reload();await saved(page);await page.locator('.flow-rail button').filter({hasText:'Work'}).click();
 assert.equal(await page.getByLabel('Ask the Work Agent',{exact:true}).inputValue(),draft);
 const response=page.waitForResponse(r=>r.url().includes('/api/agent')&&r.request().postData()?.includes('"operation":"send"'),{timeout:115000});await page.getByRole('button',{name:'Send to CDVRS AI',exact:true}).click();assert.equal((await response).status(),200);
 await page.locator('.agent-chat [role=status]').filter({hasText:'Conversation saved to cloud'}).waitFor({timeout:115000});await saved(page);assert.match(await page.locator('.agent-message.assistant').last().innerText(),/amber/i);
 const answer=await page.locator('.agent-message.assistant').last().innerText();await page.reload();await saved(page);await page.locator('.flow-rail button').filter({hasText:'Work'}).click();await page.locator('.agent-message.assistant').last().waitFor();assert.equal(await page.locator('.agent-message.assistant').last().innerText(),answer);
 await page.locator('.flow-rail button').filter({hasText:'Social'}).click();await page.getByText('Saved chat loaded',{exact:true}).waitFor();assert.equal(await page.locator('.agent-message').count(),0);
 await page.locator('.flow-rail button').filter({hasText:'Handoff'}).click();await page.getByText('Saved chat loaded',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Suggest what to do here today',exact:true}).isEnabled(),false);
 await page.getByRole('button',{name:'Review context for this chat',exact:true}).click();await page.getByLabel('Context shared with Handoff chat',{exact:true}).fill('My next action is finalise the violet sampler tomorrow. Keep the next step small.');
 await page.getByRole('checkbox',{name:'I approve sharing this context with my Handoff chat.',exact:true}).check();await page.getByLabel('Ask the Handoff Agent',{exact:true}).fill('Using only my approved context, name my next action and one tiny first step. One sentence.');await saved(page);
 const handoff=page.waitForResponse(r=>r.url().includes('/api/agent')&&r.request().postData()?.includes('"operation":"send"'),{timeout:115000});await page.getByRole('button',{name:'Send to CDVRS AI',exact:true}).click();assert.equal((await handoff).status(),200);
 await page.locator('.agent-chat [role=status]').filter({hasText:'Conversation saved to cloud'}).waitFor({timeout:115000});await saved(page);assert.match(await page.locator('.agent-message.assistant').last().innerText(),/violet/i);
 await page.screenshot({path:'/Users/grindandghost/Documents/ChatGPT/Code/cdvrs-planner-phase2-results/section-chat-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'/Users/grindandghost/Documents/ChatGPT/Code/cdvrs-planner-phase2-results/section-chat-mobile.png',fullPage:true});
 console.log(JSON.stringify({liveWorkContext:true,draftSavedToCloud:true,replySurvivesReload:true,sectionIsolation:true,handoffConsentGate:true,liveReviewedHandoffContext:true,mobileNoOverflow:true}));await browser.close();
})().catch(async e=>{console.error(e);if(global.page)console.log((await global.page.locator('body').innerText()).slice(-6000));await global.browser?.close();process.exitCode=1;});
