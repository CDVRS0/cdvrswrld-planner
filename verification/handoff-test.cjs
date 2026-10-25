// Run only with a disposable fixture account; never the owner's Planner account.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/grindandghost/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const base = process.env.PLANNER_BASE_URL || 'http://127.0.0.1:5187/';
const saved = page => page.locator('.cloud-panel [role=status]').filter({ hasText: /^Saved to cloud$/ }).waitFor({ timeout: 30000 });
(async () => {
 const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }); global.browser = browser;
 const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/London' }); const page = await context.newPage(); global.page = page; page.setDefaultTimeout(20000);
 const origin = new URL(base).origin;
 if (process.env.PLANNER_PREVIEW_OIDC) await page.route(origin + '/**', route => route.continue({ headers: { ...route.request().headers(), 'x-vercel-trusted-oidc-idp-token': process.env.PLANNER_PREVIEW_OIDC } }));
 await page.goto(base); await page.getByLabel('Email', { exact: true }).fill(process.env.PLANNER_TEST_EMAIL); await page.getByLabel('Password', { exact: true }).fill(process.env.PLANNER_TEST_PASSWORD);
 await page.getByRole('button', { name: 'Sign in to cloud', exact: true }).click(); await page.getByRole('checkbox', { name: /I have checked my backup/ }).check(); await page.getByRole('button', { name: 'Load cloud Planner', exact: true }).click(); await saved(page);
 await page.locator('.flow-rail button').filter({ hasText: 'Handoff' }).click();
 await page.getByLabel('Context for the next agent', { exact: true }).fill('Acceptance context for CDVRS AI'); await page.getByLabel('Remember tomorrow', { exact: true }).fill('Acceptance reminder for Monday'); await saved(page);
 const checklist = page.locator('.guided-step .step-checklist'); await checklist.locator('.mini-input-row input').fill('Acceptance carry action'); await checklist.getByRole('button', { name: 'Add', exact: true }).click(); await saved(page);
 let writes = 0; page.on('request', r => { if (r.url().includes('/rpc/save_planner_week_v2')) writes++; });
 await page.getByRole('button', { name: 'Review tomorrow’s carry-forward', exact: true }).click();
 await page.locator('.handoff-review .dashboard-task').filter({ hasText: 'Acceptance carry action' }).getByRole('checkbox').check();
 assert.equal(await page.getByRole('button', { name: 'Approve & save to tomorrow', exact: true }).isEnabled(), false); assert.equal(writes, 0);
 await page.getByRole('checkbox', { name: /I approve saving these selected items/ }).check(); await page.getByRole('button', { name: 'Approve & save to tomorrow', exact: true }).click(); await saved(page);
 await page.getByRole('button', { name: 'Next week', exact: true }).click(); await page.getByRole('button', { name: /^Mon System Control/ }).click();
 const incoming = page.locator('.dashboard-card').filter({ has: page.getByRole('heading', { name: 'Your approved handoff' }) });
 await incoming.locator('label').filter({ hasText: 'Acceptance reminder for Monday' }).waitFor(); await incoming.locator('label').filter({ hasText: 'Acceptance carry action' }).waitFor();
 await incoming.locator('label').filter({ hasText: 'Acceptance carry action' }).getByRole('checkbox').check(); await saved(page); await page.reload(); await saved(page);
 await page.getByRole('button', { name: 'Next week', exact: true }).click(); await page.getByRole('button', { name: /^Mon System Control/ }).click();
 assert.equal(await page.locator('.dashboard-card').filter({ has: page.getByRole('heading', { name: 'Your approved handoff' }) }).locator('label').filter({ hasText: 'Acceptance carry action' }).getByRole('checkbox').isChecked(), true);
 await page.getByRole('button', { name: 'Previous week', exact: true }).click(); await page.getByRole('button', { name: /^Sun/ }).click();
 await page.getByRole('button', { name: 'Review tomorrow’s carry-forward', exact: true }).click(); assert.equal(await page.locator('.handoff-candidates label').filter({ hasText: 'Acceptance carry action' }).count(), 0); await page.getByRole('button', { name: 'Close preview', exact: true }).click();
 await page.getByRole('button', { name: 'Review handoff to CDVRS AI', exact: true }).click(); await page.getByLabel('Exact handoff message', { exact: true }).fill('Acceptance handoff: help me continue my music work tomorrow.');
 assert.equal(await page.getByRole('button', { name: 'Approve & send to CDVRS AI', exact: true }).isEnabled(), false);
 if (process.env.TEST_HANDOFF_SEND === '1') {
  await page.getByRole('checkbox', { name: 'I approve sending this message to my CDVRS AI conversation.', exact: true }).check();
  const responsePromise = page.waitForResponse(r => r.url().includes('/api/organise'));
  await page.getByRole('button', { name: 'Approve & send to CDVRS AI', exact: true }).click(); const response = await responsePromise; const data = await response.json(); assert.equal(response.status(), 200, JSON.stringify(data));
  const link = await page.getByRole('link', { name: 'Open handoff in CDVRS AI →', exact: true }).getAttribute('href'); assert.ok(link.includes('conversation=')); console.log('HANDOFF_CONVERSATION ' + data.conversationId);
 }
 await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
 await page.screenshot({ path: '/Users/grindandghost/Documents/ChatGPT/Code/cdvrs-planner-phase2-results/handoff-mobile.png', fullPage: true });
 console.log(JSON.stringify({ reviewBeforeSave: true, sundayToMonday: true, preservedSource: true, noDuplicateCarry: true, cloudReload: true, completionPersists: true, mobileNoOverflow: true, handoffSent: process.env.TEST_HANDOFF_SEND === '1' })); await browser.close();
})().catch(async e => { console.error(e); if(global.page)console.log((await global.page.locator('body').innerText()).slice(-7000)); await global.browser?.close(); process.exitCode=1; });
