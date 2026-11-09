/* Sends the household app's phone notifications. GitHub runs it each morning and evening for free.
   It signs in to Firebase as its own bot user, whose email and password are in two GitHub secrets, BOT_EMAIL and
   BOT_PASSWORD. The Firestore rules only let that user read the sale days, watch list and phones in hh/deals and
   hh/push, and note what it sent. Without the secrets, it stops quietly. Each pop-up is encrypted for the phone it goes to.
   Run from the top of the repo: node .github/notify/notify.mjs deals.json */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
/* The app's own date rules, so a "2nd Saturday" lands on the same day here as on your phone. */
const L = require(existsSync(new URL('./logic.js', import.meta.url)) ? './logic.js' : '../logic.js');

export function sydneyNow(d) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return { day: p.year + '-' + p.month + '-' + p.day, hour: Number(p.hour) };
}
const keenOn = (s, d) => (s.keen !== false ? (s.skip || []).indexOf(d) < 0 : (s.on || []).indexOf(d) >= 0);
const shop = (s) => (s === 'Woolworths' ? 'Woolies' : s);
const short = (n) => String(n).split(' ').slice(0, 4).join(' ');

/* The week's specials key, from whichever list is still running. */
export function weekKey(feed, day) {
  const s = (feed && feed.sources) || {}, r = s.report || {}, h = s.harris || {};
  const from = (r.ok !== false && r.to >= day && r.from) || (h.ok !== false && h.to >= day && h.from) || '';
  return from ? 'sp:' + from : '';
}
/* This week's specials and OzBargain deals that match the watch list. A deal matches on its shop too. */
export function weekHits(feed, watch, day) {
  if (!feed || !Array.isArray(watch) || !watch.length) return [];
  const s = feed.sources || {}, live = (k) => !!(s[k] && s[k].to && s[k].to >= day);
  const specials = L.sortSpecials((feed.specials || []).filter((x) => x && x.n && live(x.src === 'hf' ? 'harris' : 'report') && L.watchHits(x.n, watch).length), watch)
    .map((x) => ({ n: x.n, s: L.storeName(x.s), now: x.now }));
  const deals = (feed.deals || []).filter((d) => d && d.t && !d.hp && (!d.to || d.to >= day) && L.watchHits(d.t + ' ' + d.s, watch).length)
    .map((d) => ({ n: d.t, s: L.storeName(d.s) }));
  return specials.concat(deals);
}
/* One special per line, which fits four lines on an iPhone lock screen: up to four, or three and how many more. */
const itemLine = (h) => short(h.n) + (h.now > 0 ? ' · ' + L.fmt(h.now) : '') + (h.s ? ' at ' + shop(h.s) : '');
const summary = (list) => (list.length > 4 ? list.slice(0, 3) : list).map(itemLine)
  .concat(list.length > 4 ? ['+ ' + (list.length - 3) + ' more in the app'] : []).join('\n');

/* Everything to send on this run, and which phones it goes to. */
export function plan({ push, deals, feed, now }) {
  const P = push || {}, D = deals || {}, sent = P.sent || {}, pub = P.vapid && P.vapid.pub, out = [];
  const { day, hour } = sydneyNow(now);
  const subs = Object.keys(P.subs || {}).map((id) => Object.assign({ id }, P.subs[id]))
    .filter((s) => s && s.endpoint && s.keys && s.keys.p256dh && s.keys.auth && s.vapid === pub && !s.stale);
  const wants = (who, k) => !(P.prefs && P.prefs[who] && P.prefs[who][k] === false);

  subs.filter((s) => !s.welcomed).forEach((s) => out.push({
    key: 'welcome:' + s.id, to: [s.id], welcome: true, title: '🔔 Notifications are on',
    body: "📅 The evening before a sale day we're keen on\n🛒 Again that morning\n🏷️ Wednesdays, when our watch list is on special", url: './'
  }));

  /* Sale days: the evening before, and the morning of. */
  const evening = hour >= 12, date = evening ? L.addDays(day, 1) : day;
  (Array.isArray(D.sales) ? D.sales : []).forEach((s) => {
    if (!s || !s.id || !s.store || !s.rule) return;
    L.saleDates(s.rule, date, date).forEach((d) => {
      const key = 'sale:' + s.id + '|' + d + (evening ? ':eve' : ':am');
      if (!keenOn(s, d) || sent[key]) return;
      const to = subs.filter((x) => wants(x.who, 'sale')).map((x) => x.id);
      if (to.length) out.push({ key, to, title: (evening ? '📅 ' + s.store + ' sale tomorrow' : '🛒 ' + s.store + ' sale is on today'), body: [s.offer, s.where ? '📍 ' + s.where : ''].filter(Boolean).join('\n') || 'One of your sale days.', url: './#deals', tag: 'sale-' + s.id });
    });
  });

  /* Watch-list specials: once a week, and again only for new matches. */
  const wk = weekKey(feed, day), hits = wk ? weekHits(feed, D.watch, day) : [];
  if (hits.length) {
    const before = Array.isArray(sent[wk]) ? sent[wk] : [], fresh = hits.filter((h) => before.indexOf(h.n) < 0);
    const to = subs.filter((x) => wants(x.who, 'specials')).map((x) => x.id);
    if (fresh.length && to.length) out.push({ key: wk, names: hits.map((h) => h.n).slice(0, 60), to, title: before.length ? '🏷️ More on special this week' : '🏷️ On special this week', body: summary(fresh), url: './#deals', tag: 'specials' });
  }
  return { day, hour, subs, out };
}

/* Markers older than 60 days are cleared, so the record stays small. */
export function oldKeys(sent, day) {
  const cut = L.addDays(day, -60);
  return Object.keys(sent || {}).filter((k) => { const m = /(\d{4}-\d{2}-\d{2})/.exec(k); return m && m[1] < cut; });
}

/* Sends the plan and works out what to write back: what was sent, phones that welcomed, ones that are gone. */
export async function run({ push, deals, feed, now = new Date(), send, log = () => {} }) {
  const p = plan({ push, deals, feed, now }), subs = {}, sent = {};
  let ok = 0, failed = 0;
  for (const n of p.out) {
    let any = false;
    for (const id of n.to) {
      if (subs[id] === null) continue;
      const s = p.subs.find((x) => x.id === id);
      const r = await send(s, { title: n.title, body: n.body, url: n.url, tag: n.tag }, push.vapid);
      if (r && r.ok) { any = true; ok++; continue; }
      failed++;
      const st = r ? r.status : 0;
      if (st === 404 || st === 410) subs[id] = null;
      else if (st === 401 || st === 403) subs[id] = Object.assign(subs[id] || {}, { stale: true });
      log('Not sent to ' + (s.device || 'a phone') + ' (' + st + (st === 404 || st === 410 ? ', it has unsubscribed' : st === 401 || st === 403 ? ', it needs to turn notifications on again' : '') + ')');
    }
    if (!any) continue;
    if (n.welcome) { if (subs[n.to[0]] !== null) subs[n.to[0]] = Object.assign(subs[n.to[0]] || {}, { welcomed: true }); }
    else sent[n.key] = n.names || Date.now();
  }
  return { plan: p, ok, failed, write: { subs, sent, drop: oldKeys(push.sent, p.day), last: { at: now.toISOString(), sent: ok, failed } } };
}

/* ---------- Firebase, through its REST APIs ---------- */
/* The app's public Firebase settings, from firebase-config.js at the top of the repo. */
export function webConfig(text) {
  const pick = (k) => { const m = new RegExp(k + '\\s*:\\s*["\']([^"\']+)["\']').exec(String(text || '')); return m ? m[1] : ''; };
  return { apiKey: pick('apiKey'), projectId: pick('projectId') };
}

/* Firestore's REST format wraps every value with its type. */
export function fromFs(v) {
  if (!v || typeof v !== 'object') return null;
  if ('mapValue' in v) return fromFields(v.mapValue.fields);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  return null;
}
export const fromFields = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, fromFs(v)]));
export function toFs(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isSafeInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === 'string') return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(toFs) } };
  return { mapValue: { fields: toFields(x) } };
}
export const toFields = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toFs(v)]));

/* A field path, with keys like sale:s1|2026-11-14:eve in backticks. */
export const fieldPath = (...keys) => keys.map((k) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : '`' + String(k).replace(/[\\`]/g, '\\$&') + '`')).join('.');

/* run()'s write as one Firestore update that touches only those fields: a field named in the mask but left out
   of the data is deleted, which is how gone phones and old markers are cleared. */
export function toUpdate(write) {
  const data = { last: write.last }, mask = ['last'], subs = {}, sent = {};
  Object.keys(write.subs || {}).forEach((id) => {
    const v = write.subs[id];
    if (v === null) { mask.push(fieldPath('subs', id)); return; }
    Object.keys(v).forEach((k) => { (subs[id] = subs[id] || {})[k] = v[k]; mask.push(fieldPath('subs', id, k)); });
  });
  Object.keys(write.sent || {}).forEach((k) => { sent[k] = write.sent[k]; mask.push(fieldPath('sent', k)); });
  (write.drop || []).forEach((k) => { if (!(k in sent)) mask.push(fieldPath('sent', k)); });
  if (Object.keys(subs).length) data.subs = subs;
  if (Object.keys(sent).length) data.sent = sent;
  return { fields: toFields(data), mask };
}

/* What went wrong, in words that say what to fix. */
function explain(step, status, message) {
  const m = String(message || '');
  if (step === 'sign in') {
    if (/INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND|INVALID_PASSWORD|INVALID_EMAIL|MISSING_PASSWORD/.test(m)) return "The bot couldn't sign in. Check the BOT_EMAIL and BOT_PASSWORD secrets match the user you added in Firebase Authentication.";
    if (/USER_DISABLED/.test(m)) return "The bot's user is turned off in Firebase Authentication.";
    if (/OPERATION_NOT_ALLOWED/.test(m)) return 'Email and password sign-in is turned off in Firebase Authentication.';
    if (/TOO_MANY_ATTEMPTS/.test(m)) return 'Firebase paused sign-ins after too many tries. The next run should work.';
  } else if (status === 403) return "Firestore didn't let the bot in. Publish the new Firestore rules, the ones with isBot() in them.";
  return 'Firebase ' + step + ' failed (' + (status || 'no answer') + (m ? ': ' + m : '') + ').';
}

/* Signs the bot in, then reads and updates documents with its login, so the Firestore rules apply. */
export function firebase({ apiKey, projectId, referer, fetch: f = globalThis.fetch }) {
  const docs = 'projects/' + projectId + '/databases/(default)/documents', base = 'https://firestore.googleapis.com/v1/';
  let token = '';
  async function call(step, url, init) {
    let r;
    try { r = await f(url, init); } catch (e) { throw new Error(explain(step, 0, e && e.message)); }
    const j = await r.json().catch(() => ({}));
    if (r.ok || (step === 'read' && r.status === 404)) return { status: r.status, body: j };
    const e = new Error(explain(step, r.status, j && j.error && j.error.message));
    e.status = r.status;
    throw e;
  }
  const auth = () => ({ authorization: 'Bearer ' + token, 'content-type': 'application/json' });
  return {
    async signIn(email, password) {
      const headers = { 'content-type': 'application/json' };
      if (referer) headers.referer = referer;
      const r = await call('sign in', 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(apiKey),
        { method: 'POST', headers, body: JSON.stringify({ email, password, returnSecureToken: true }) });
      token = r.body.idToken;
      if (!token) throw new Error(explain('sign in', r.status, 'no token came back'));
    },
    async get(path) {
      const r = await call('read', base + docs + '/' + path, { headers: auth() });
      return r.status === 404 ? null : fromFields(r.body.fields);
    },
    async update(path, write) {
      const u = toUpdate(write);
      await call('update', base + docs + ':commit', {
        method: 'POST', headers: auth(),
        body: JSON.stringify({ writes: [{ update: { name: docs + '/' + path, fields: u.fields }, updateMask: { fieldPaths: u.mask }, currentDocument: { exists: true } }] })
      });
    }
  };
}

/* One run: sign in, read the sale days, watch list and phones, send, and note what was sent. */
export async function job({ email, password, config, feed, now = new Date(), fetch: f, send, referer, log = () => {} }) {
  const fb = firebase({ apiKey: config.apiKey, projectId: config.projectId, referer, fetch: f });
  await fb.signIn(email, password);
  const [push, deals] = await Promise.all([fb.get('hh/push'), fb.get('hh/deals')]);
  if (!push || !push.vapid || !push.vapid.pub || !push.vapid.d) {
    if (push) await fb.update('hh/push', { last: { at: now.toISOString(), sent: 0, failed: 0 } });
    return null;
  }
  const r = await run({ push, deals: deals || {}, feed, now, send, log });
  await fb.update('hh/push', r.write);
  return r;
}

/* The run log on GitHub is public, so it says what kind of pop-ups went out, never what they said. */
export function runSummary(r) {
  if (!r) return 'No phone has turned notifications on yet.';
  const kinds = r.plan.out.map((n) => (n.welcome ? 'a welcome' : /^sale:/.test(n.key) ? 'a sale day reminder' : 'watch-list specials'));
  const what = kinds.filter((k, i) => kinds.indexOf(k) === i);
  return 'Sent ' + r.ok + (r.ok === 1 ? ' pop-up' : ' pop-ups') + (what.length ? ' (' + what.join(', ') + ')' : '') + (r.failed ? ', ' + r.failed + " couldn't be sent" : '') + '.';
}

async function main() {
  const email = process.env.BOT_EMAIL, password = process.env.BOT_PASSWORD;
  if (!email || !password) { console.log("::notice::Phone notifications aren't set up yet. Add the BOT_EMAIL and BOT_PASSWORD secrets."); return; }
  const config = webConfig(await readFile('firebase-config.js', 'utf8').catch(() => ''));
  if (!config.apiKey || !config.projectId) { console.log("::error::Couldn't read the app's Firebase settings from firebase-config.js."); process.exitCode = 1; return; }
  let feed = {};
  try { feed = JSON.parse(await readFile(process.argv[2] || 'deals.json', 'utf8')); } catch (e) { feed = {}; }
  const [owner, repo] = String(process.env.GITHUB_REPOSITORY || '').split('/');
  const site = owner && repo ? 'https://' + owner.toLowerCase() + '.github.io/' + repo + '/' : '';
  const webpush = (await import('web-push')).default;
  const send = async (s, payload, vapid) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload),
        { vapidDetails: { subject: site || 'mailto:noreply@example.com', publicKey: vapid.pub, privateKey: vapid.d }, TTL: 12 * 3600, urgency: 'normal' });
      return { ok: true };
    } catch (e) {
      return { ok: false, status: e && e.statusCode ? e.statusCode : 0 };
    }
  };
  try {
    const r = await job({ email, password, config, feed, now: new Date(), send, referer: site, log: (m) => console.log('::warning::' + m) });
    console.log('::notice::' + runSummary(r));
  } catch (e) {
    console.log('::error::' + (e && e.message ? e.message : e));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
