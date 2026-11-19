/**
 * UI test-evidence capture (screenshots + a short recording) with Playwright.
 *   npm i -D playwright && npx playwright install chromium     (or set CHROME_PATH to an installed Chrome)
 *   BASE_URL=http://localhost:4000 ADMIN_EMAIL=admin@demo.local ADMIN_PASSWORD=Admin@12345 node docs/evidence/capture.mjs
 * It drives the REAL UI (simulator + operator console) and fails loudly if an expectation is not met.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL ?? 'http://localhost:4000';
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@demo.local';
const PASS = process.env.ADMIN_PASSWORD ?? 'Admin@12345';
const out = (n) => path.join(here, n);
let step = 0;
const log = (m) => console.log(`${String(++step).padStart(2, '0')}. ${m}`);
// Only ACTIVE (enabled) chat buttons: old bot messages keep their buttons disabled.
const live = (pg, text) => pg.locator('button.wa-btn:not([disabled])', { hasText: text });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined), args: ['--no-sandbox'] });

/* ───────────── Desktop simulator flow (recorded) ───────────── */
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, recordVideo: { dir: here, size: { width: 1280, height: 860 } } });
const page = await ctx.newPage();
page.on('pageerror', (e) => { throw new Error('page error: ' + e.message); });
await page.goto(BASE + '/');
await page.getByPlaceholder('Type a message or serial number…').fill('hi');
await page.getByLabel('Send').click();
await page.getByText('Seal-Kit Advisor (DEMO)').first().waitFor();
log('welcome message shown');
await page.screenshot({ path: out('01-simulator-welcome.png') });

await page.getByRole('tab', { name: 'Sample plates' }).click();
await page.getByRole('button', { name: /01_DEMO-BHL-0001_clear/ }).click();
await page.getByText('I read the serial number as').waitFor({ timeout: 60000 });
log('OCR read the plate and asked for confirmation');
await page.screenshot({ path: out('02-simulator-ocr-confirm.png') });

await live(page, 'Yes, correct').click();
await page.getByText('Which hydraulic assembly is leaking?').waitFor();
await live(page, 'Choose assembly').click();
await page.screenshot({ path: out('03-simulator-assembly-list.png') });
await page.getByRole('button', { name: /Boom cylinder/ }).click();
await page.getByText('DK-BHL-A-BOOM').first().waitFor();
await page.getByText('Demo match').waitFor();
log('exact kit recommended: DK-BHL-A-BOOM');
await page.waitForTimeout(500);
await page.screenshot({ path: out('04-simulator-recommendation.png') });

await page.getByRole('button', { name: 'Request quote' }).click();
await page.getByPlaceholder('Type a message or serial number…').fill('Ravi Kumar');
await page.getByLabel('Send').click();
await page.getByText('phone number').waitFor();
await page.getByPlaceholder('Type a message or serial number…').fill('+91 98765 43210');
await page.getByLabel('Send').click();
await page.getByText('city').first().waitFor();
await page.getByPlaceholder('Type a message or serial number…').fill('Vadodara');
await page.getByLabel('Send').click();
await page.getByRole('button', { name: 'I agree' }).click();
await page.getByText('quote request').waitFor();
log('quote request completed with consent');
await page.screenshot({ path: out('05-simulator-quote-done.png') });

// Out-of-stock + unknown + no-fitment + Hindi
await page.getByPlaceholder('Type a message or serial number…').fill('reset');
await page.getByLabel('Send').click();
await page.getByText('Type *reset* anytime'.replace(/\*/g, '')).last().waitFor();
await page.getByRole('tab', { name: 'Quick messages' }).click();
await page.getByRole('button', { name: /Out-of-stock machine/ }).click();
await live(page, 'Yes, correct').click();
await live(page, 'Choose assembly').click();
await page.getByRole('button', { name: /Dipper cylinder/ }).click();
await page.getByText('Currently out of stock').waitFor();
log('out-of-stock case: availability not promised');
await page.screenshot({ path: out('06-simulator-out-of-stock.png') });

await page.getByRole('tab', { name: 'Quick messages' }).click();
await page.getByRole('button', { name: /Unknown serial/ }).click();
await live(page, 'Yes, correct').click();
await page.getByText('review ticket').last().waitFor();
log('unknown serial -> staff review ticket');
await page.screenshot({ path: out('07-simulator-unknown-serial-ticket.png') });

await page.getByRole('tab', { name: 'Quick messages' }).click();
await page.getByRole('button', { name: /हिन्दी में बात करें/ }).click();
await page.getByText('भाषा हिन्दी पर सेट हो गई').waitFor();
await page.getByRole('tab', { name: 'Quick messages' }).click();
await page.getByPlaceholder('Type a message or serial number…').fill('reset'); // leave human review
await page.getByLabel('Send').click();
await page.getByText('नमस्ते').last().waitFor();
await page.getByRole('tab', { name: 'Sample plates' }).click();
await page.getByRole('button', { name: /09_DEMO-BHL-0001_blurred/ }).click();
await page.getByText(/मैंने सीरियल नंबर ऐसा पढ़ा|सीरियल नंबर नहीं पढ़|धुँधली/).waitFor({ timeout: 60000 });
log('Hindi reply + blurred plate handled');
await page.screenshot({ path: out('08-simulator-hindi-blurred.png') });
await ctx.close(); // flushes the video

/* ───────────── Mobile simulator ───────────── */
const mctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, isMobile: true });
const m = await mctx.newPage();
await m.goto(BASE + '/');
await m.getByPlaceholder('Type a message or serial number…').fill('DEMO-EXC-0008');
await m.getByLabel('Send').click();
await live(m, 'Yes, correct').click();
await live(m, 'Choose assembly').click();
await m.getByRole('button', { name: /Stabilizer cylinder/ }).click();
await m.getByText('verified kit for that exact serial').waitFor();
log('mobile: no-fitment -> ticket');
await m.screenshot({ path: out('09-mobile-no-fitment.png') });
await mctx.close();

/* ───────────── Operator console ───────────── */
const actx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const a = await actx.newPage();
a.on('pageerror', (e) => { throw new Error('admin page error: ' + e.message); });
await a.goto(BASE + '/admin');
await a.waitForURL('**/admin/login');
await a.getByLabel('Email').fill('admin@demo.local'.replace('admin@demo.local', EMAIL));
await a.getByLabel('Password').fill(PASS);
await a.screenshot({ path: out('10-admin-login.png') });
await a.getByRole('button', { name: 'Sign in' }).click();
await a.getByRole('heading', { name: 'Overview' }).waitFor();
await a.screenshot({ path: out('11-admin-overview.png') });
log('admin signed in');

await a.getByRole('link', { name: 'Kits', exact: true }).click();
await a.getByText('DK-BHL-B-DIP').waitFor();
await a.screenshot({ path: out('12-admin-kits.png') });
// edit stock of a kit -> audit trail
await a.getByRole('button', { name: 'Increase stock of DK-BHL-B-DIP' }).click();
await a.waitForTimeout(600);
log('stock edited via UI');

await a.getByRole('link', { name: 'Fitments', exact: true }).click();
await a.getByText('DEMO-EXC-0008').first().waitFor();
await a.screenshot({ path: out('13-admin-fitments.png') });
await a.getByRole('button', { name: '+ Add fitment' }).click();
await a.screenshot({ path: out('14-admin-fitment-form.png') });
await a.keyboard.press('Escape');

await a.getByRole('link', { name: 'Review tickets', exact: true }).click();
await a.locator('tbody tr').first().waitFor();
await a.screenshot({ path: out('15-admin-tickets.png') });

await a.getByRole('link', { name: 'Leads', exact: true }).click();
await a.getByText('Ravi Kumar').waitFor();
await a.screenshot({ path: out('16-admin-leads.png') });
const [dl] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: /Export CSV/ }).click()]);
await dl.saveAs(out('leads-export.csv'));
log('leads CSV exported: ' + dl.suggestedFilename());

await a.getByRole('link', { name: 'Conversations', exact: true }).click();
await a.getByRole('button', { name: /sim-/ }).last().click();
await a.locator('.ocr').first().waitFor({ timeout: 15000 });
await a.waitForTimeout(800);
await a.screenshot({ path: out('17-admin-conversation-ocr.png'), fullPage: false });

await a.getByRole('link', { name: 'Audit trail', exact: true }).click();
await a.getByText('kit').first().waitFor();
await a.screenshot({ path: out('18-admin-audit.png') });
await actx.close();
await browser.close();

// give the video a stable name
const vid = fs.readdirSync(here).find((f) => f.endsWith('.webm'));
if (vid) fs.renameSync(out(vid), out('simulator-flow.webm'));
console.log('\nEvidence written to docs/evidence/');
