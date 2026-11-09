/* Sends the household app's phone notifications. GitHub runs it each morning and evening for free.
   It needs one secret, FIREBASE_SERVICE_ACCOUNT (a Firebase key), to read the sale days, watch list and phones in
   hh/deals and hh/push. Without it, it stops quietly. Each pop-up is encrypted for the phone it goes to.
   Run: node notify.mjs deals.json */
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
const where = (s) => String(s || '').split(', ').pop();
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
    .map((x) => ({ n: x.n, s: L.storeName(x.s) }));
  const deals = (feed.deals || []).filter((d) => d && d.t && !d.hp && (!d.to || d.to >= day) && L.watchHits(d.t + ' ' + d.s, watch).length)
    .map((d) => ({ n: d.t, s: L.storeName(d.s) }));
  return specials.concat(deals);
}
const summary = (list) => list.slice(0, 2).map((h) => short(h.n) + (h.s ? ' at ' + shop(h.s) : '')).join(', ') + (list.length > 2 ? ' and ' + (list.length - 2) + ' more' : '');

/* Everything to send on this run, and which phones it goes to. */
export function plan({ push, deals, feed, now }) {
  const P = push || {}, D = deals || {}, sent = P.sent || {}, pub = P.vapid && P.vapid.pub, out = [];
  const { day, hour } = sydneyNow(now);
  const subs = Object.keys(P.subs || {}).map((id) => Object.assign({ id }, P.subs[id]))
    .filter((s) => s && s.endpoint && s.keys && s.keys.p256dh && s.keys.auth && s.vapid === pub && !s.stale);
  const wants = (who, k) => !(P.prefs && P.prefs[who] && P.prefs[who][k] === false);

  subs.filter((s) => !s.welcomed).forEach((s) => out.push({
    key: 'welcome:' + s.id, to: [s.id], welcome: true, title: 'Notifications are on',
    body: "You'll get a heads-up the evening before a sale day you're keen on, and on Wednesdays when something on the watch list is on special.", url: './'
  }));

  /* Sale days: the evening before, and the morning of. */
  const evening = hour >= 12, date = evening ? L.addDays(day, 1) : day;
  (Array.isArray(D.sales) ? D.sales : []).forEach((s) => {
    if (!s || !s.id || !s.store || !s.rule) return;
    L.saleDates(s.rule, date, date).forEach((d) => {
      const key = 'sale:' + s.id + '|' + d + (evening ? ':eve' : ':am');
      if (!keenOn(s, d) || sent[key]) return;
      const to = subs.filter((x) => wants(x.who, 'sale')).map((x) => x.id);
      if (to.length) out.push({ key, to, title: s.store + (evening ? ' sale tomorrow' : ' sale is on today'), body: [s.offer, where(s.where)].filter(Boolean).join(' · ') || 'One of your sale days.', url: './#deals', tag: 'sale-' + s.id });
    });
  });

  /* Watch-list specials: once a week, and again only for new matches. */
  const wk = weekKey(feed, day), hits = wk ? weekHits(feed, D.watch, day) : [];
  if (hits.length) {
    const before = Array.isArray(sent[wk]) ? sent[wk] : [], fresh = hits.filter((h) => before.indexOf(h.n) < 0);
    const to = subs.filter((x) => wants(x.who, 'specials')).map((x) => x.id);
    if (fresh.length && to.length) out.push({ key: wk, names: hits.map((h) => h.n).slice(0, 60), to, title: before.length ? 'More on special this week' : 'On special this week', body: summary(fresh), url: './#deals', tag: 'specials' });
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
      log('Not sent to ' + (s.device || 'a phone') + ' (' + st + '): ' + n.title);
    }
    if (!any) continue;
    if (n.welcome) { if (subs[n.to[0]] !== null) subs[n.to[0]] = Object.assign(subs[n.to[0]] || {}, { welcomed: true }); }
    else sent[n.key] = n.names || Date.now();
  }
  return { plan: p, ok, failed, write: { subs, sent, drop: oldKeys(push.sent, p.day), last: { at: now.toISOString(), sent: ok, failed } } };
}

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) { console.log("::notice::Phone notifications aren't set up yet. Add the FIREBASE_SERVICE_ACCOUNT secret."); return; }
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const webpush = (await import('web-push')).default;
  initializeApp({ credential: cert(JSON.parse(raw)) });
  const db = getFirestore(), ref = db.doc('hh/push');
  const [pushSnap, dealsSnap] = await Promise.all([ref.get(), db.doc('hh/deals').get()]);
  const push = pushSnap.exists ? pushSnap.data() : {};
  const now = new Date();
  if (!push.vapid || !push.vapid.pub || !push.vapid.d) {
    console.log('No phone has turned notifications on yet.');
    await ref.set({ last: { at: now.toISOString(), sent: 0, failed: 0 } }, { merge: true });
    return;
  }
  let feed = {};
  try { feed = JSON.parse(await readFile(process.argv[2] || 'deals.json', 'utf8')); } catch (e) { feed = {}; }
  const [owner, repo] = String(process.env.GITHUB_REPOSITORY || '').split('/');
  const subject = owner && repo ? 'https://' + owner.toLowerCase() + '.github.io/' + repo + '/' : 'mailto:noreply@example.com';
  const send = async (s, payload, vapid) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload),
        { vapidDetails: { subject, publicKey: vapid.pub, privateKey: vapid.d }, TTL: 12 * 3600, urgency: 'normal' });
      return { ok: true };
    } catch (e) {
      return { ok: false, status: e && e.statusCode ? e.statusCode : 0 };
    }
  };
  const r = await run({ push, deals: dealsSnap.exists ? dealsSnap.data() : {}, feed, now, send, log: (m) => console.log('::warning::' + m) });
  const patch = { last: r.write.last };
  const subs = {};
  Object.keys(r.write.subs).forEach((k) => { subs[k] = r.write.subs[k] === null ? FieldValue.delete() : r.write.subs[k]; });
  if (Object.keys(subs).length) patch.subs = subs;
  const sent = Object.assign({}, r.write.sent);
  r.write.drop.forEach((k) => { sent[k] = FieldValue.delete(); });
  if (Object.keys(sent).length) patch.sent = sent;
  await ref.set(patch, { merge: true });
  console.log('Sent ' + r.ok + (r.failed ? ', ' + r.failed + " couldn't be sent" : '') + '. ' + r.plan.out.map((n) => n.title).join(' | '));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
