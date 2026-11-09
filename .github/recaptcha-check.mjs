/* One-off (run 2, debug-token route): loads the live app, sets up App Check with its reCAPTCHA key exactly as receipt reading does, asks for a
   one-use token, and prints what happened, plus any error reCAPTCHA shows inside its own frames. Prints no tokens. */
import { chromium } from 'playwright-core';

const [owner, repo] = String(process.env.GITHUB_REPOSITORY || '').split('/');
const site = 'https://' + owner.toLowerCase() + '.github.io/' + repo + '/';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push('console ' + m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => { if (/recaptcha|appcheck/.test(r.url())) logs.push('request failed: ' + r.url().split('?')[0] + ' ' + (r.failure() && r.failure().errorText)); });
page.on('response', async (r) => { if (/appcheck/.test(r.url())) { let b = ''; try { b = (await r.text()).replace(/\s+/g, ' ').slice(0, 200); } catch (e) {} logs.push('response ' + r.status() + ': ' + r.url().split('?')[0].replace(/.*\/apps\//, 'apps/') + ' ' + b); } });
await page.goto(site, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const out = await page.evaluate(async () => {
  const res = { host: location.hostname, key: window.HH_APPCHECK ? window.HH_APPCHECK.slice(0, 6) + '...' + window.HH_APPCHECK.slice(-4) : 'missing' };
  try {
    const A = await import('./firebase-app.js'), AC = await import('./firebase-app-check.js');
    const app = A.initializeApp(window.HH_FIREBASE, 'diag');
    // the household-token route: a made-up debug token, which Google should turn down at its debug-token exchange
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = '00000000-0000-4000-8000-000000000000';
    const ac = AC.initializeAppCheck(app, { provider: new AC.CustomProvider({ getToken: () => Promise.reject(new Error('unused')) }), isTokenAutoRefreshEnabled: false });
    try { const t = await AC.getLimitedUseToken(ac); res.appCheck = 'got a token (' + String(t.token).length + ' chars)'; }
    catch (e) { res.appCheck = 'error ' + (e.code || '') + ': ' + e.message; }
  } catch (e) { res.load = 'error: ' + e.message; }
  return res;
});
await page.waitForTimeout(1500);
for (const f of page.frames()) {
  if (!/recaptcha/.test(f.url())) continue;
  const u = new URL(f.url());
  let txt = '';
  try { txt = await f.evaluate(() => (document.body ? document.body.innerText : '')); } catch (e) { txt = '(could not read: ' + e.message + ')'; }
  logs.push('frame ' + u.pathname + ' k=' + (u.searchParams.get('k') || '').slice(0, 6) + ' co=' + (u.searchParams.get('co') || '') + ': ' + txt.replace(/\s+/g, ' ').trim().slice(0, 300));
}
console.log('::notice::' + JSON.stringify(out));
logs.slice(0, 20).forEach((l) => console.log('::notice::' + l.slice(0, 450)));
await browser.close();
