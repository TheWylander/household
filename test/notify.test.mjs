/* What the notification job sends, and to whom, without Firebase or a push service. node test/notify.test.mjs */
import assert from 'node:assert';
import { plan, run, sydneyNow, weekKey, weekHits, wordHits, specialsPop, oldKeys, webConfig, fromFs, toFs, fieldPath, toUpdate, job, runSummary } from '../src/github/notify.mjs';

let passed = 0;
async function t(name, fn) {
  try { await fn(); passed++; } catch (e) { console.error('FAIL', name, '\n ', e.message); process.exitCode = 1; }
}
const keys = { p256dh: 'BPk', auth: 'au' };
const push = () => ({
  vapid: { pub: 'KEY', d: 'secret' },
  subs: {
    p1: { who: 'a', endpoint: 'https://web.push.apple.com/1', keys, vapid: 'KEY', welcomed: false, device: 'iPhone' },
    p2: { who: 'b', endpoint: 'https://web.push.apple.com/2', keys, vapid: 'KEY', welcomed: true, device: 'iPhone' },
    p3: { who: 'b', endpoint: 'https://web.push.apple.com/3', keys, vapid: 'OLD', welcomed: true },
    p4: null
  },
  prefs: { b: { specials: false } },
  sent: {}
});
const lucky = { id: 's1', store: 'Lucky Mart', offer: 'Up to 20% off', where: 'Shop 2, 2 Wilkes Ave, Artarmon', rule: { k: 'nth', n: 2, dow: 6 }, keen: true, skip: [], on: [] };
const deals = () => ({ sales: [lucky], watch: ['weetbix', 'tokyo mart'] });
const feed = {
  sources: { report: { ok: true, from: '2026-11-11', to: '2026-11-17' }, harris: { ok: true, from: '2026-11-11', to: '2026-11-17' } },
  specials: [
    { s: 'Coles', n: 'Sanitarium Weet-Bix 575g', now: 250, was: 500, off: 50, src: 'hp' },
    { s: 'Woolworths', n: 'Muffins', now: 300, was: 600, off: 50, src: 'hp' }
  ],
  deals: [
    { id: '1', t: '20% off Everything In-Store', s: 'Tokyo Mart', to: '2026-11-15' },
    { id: '2', t: 'Weet-Bix half price + 191 more', s: 'Coles', to: '2026-11-17', hp: true }
  ]
};
const FRI_EVENING = new Date('2026-11-13T08:07:00Z'); // Fri 13 Nov, 7:07pm in Sydney
const SAT_MORNING = new Date('2026-11-13T20:37:00Z'); // Sat 14 Nov, 7:37am in Sydney

await t('Sydney time, across daylight saving', () => {
  assert.deepStrictEqual(sydneyNow(FRI_EVENING), { day: '2026-11-13', hour: 19 });
  assert.deepStrictEqual(sydneyNow(new Date('2026-06-12T09:07:00Z')), { day: '2026-06-12', hour: 19 }, 'winter is UTC+10');
});

await t('the evening before a sale day', () => {
  const p = plan({ push: push(), deals: deals(), feed, now: FRI_EVENING });
  assert.deepStrictEqual(p.subs.map((s) => s.id), ['p1', 'p2'], 'phones with an older key or removed are left out');
  const titles = p.out.map((n) => n.title);
  assert.deepStrictEqual(titles, ['🔔 Notifications are on', '📅 Lucky Mart sale tomorrow', '🏷️ 2 things we buy are on special']);
  assert.strictEqual(p.out[0].body.split('\n').length, 3, 'the welcome lists the three kinds of pop-up, one per line');
  const sale = p.out[1];
  assert.deepStrictEqual([sale.to, sale.body, sale.url, sale.key], [['p1', 'p2'], 'Up to 20% off\n📍 Shop 2, 2 Wilkes Ave, Artarmon', './#deals', 'sale:s1|2026-11-14:eve']);
  const sp = p.out[2];
  assert.deepStrictEqual(sp.to, ['p1'], 'the second person turned specials off');
  assert.strictEqual(sp.body, 'Sanitarium Weet-Bix 575g · $2.50 at Coles\n20% off Everything In-Store at Tokyo Mart', 'one per line with the price; watch words match a deal by its shop, and the half-price post is left out');
  assert.deepStrictEqual(p.out[0].to, ['p1'], 'only the new phone is welcomed');
});

await t('the morning of, and nothing twice', () => {
  const pp = push();
  pp.subs.p1.welcomed = true;
  pp.sent = { 'sale:s1|2026-11-14:eve': 1, 'sp:2026-11-11': ['Sanitarium Weet-Bix 575g', '20% off Everything In-Store'] };
  const p = plan({ push: pp, deals: deals(), feed, now: SAT_MORNING });
  assert.deepStrictEqual(p.out.map((n) => n.title), ['🛒 Lucky Mart sale is on today']);
  pp.sent['sale:s1|2026-11-14:am'] = 1;
  assert.deepStrictEqual(plan({ push: pp, deals: deals(), feed, now: SAT_MORNING }).out, []);
  const more = JSON.parse(JSON.stringify(feed));
  more.specials.push({ s: 'Woolworths', n: 'Weetbix Bites 510g', now: 400, was: 800, off: 50, src: 'hp' });
  const p2 = plan({ push: pp, deals: deals(), feed: more, now: SAT_MORNING });
  assert.deepStrictEqual([p2.out[0].title, p2.out[0].body], ['🏷️ More on special this week', 'Weetbix Bites 510g · $4.00 at Woolies']);
  const lots = JSON.parse(JSON.stringify(feed));
  ['Weet-Bix Kids', 'Weet-Bix Blends', 'Weet-Bix Gold', 'Weet-Bix Protein'].forEach((n) => lots.specials.push({ s: 'Coles', n, now: 300, was: 600, off: 50, src: 'hp' }));
  const grouped = plan({ push: push(), deals: deals(), feed: lots, now: FRI_EVENING }).out.filter((n) => n.tag === 'specials')[0];
  assert.deepStrictEqual(grouped.body.split('\n'), ['Sanitarium Weet-Bix 575g · $2.50 at Coles', '20% off Everything In-Store at Tokyo Mart'], 'five Weet-Bix specials make one line, with the best of them');
  const six = plan({ push: push(), deals: { sales: [], watch: ['weetbix', 'tokyo mart', 'muffins', 'kids', 'blends', 'gold'] }, feed: lots, now: FRI_EVENING }).out.filter((n) => n.tag === 'specials')[0];
  assert.deepStrictEqual([six.title, six.body.split('\n').length, six.body.split('\n')[3]], ['🏷️ 6 things we buy are on special', 4, '+ kids, blends and gold in the app'], 'six words: three lines and the rest by name');
  const one = specialsPop(wordHits(feed, ['weetbix'], '2026-11-13'), false);
  assert.deepStrictEqual(one, { title: '🏷️ Weetbix is on special', body: 'Sanitarium Weet-Bix 575g · $2.50 at Coles' }, 'one word says which');
});

await t("not keen, skipped, or not today: no pop-up", () => {
  const d = deals();
  d.sales[0] = Object.assign({}, lucky, { skip: ['2026-11-14'] });
  assert.ok(!plan({ push: push(), deals: d, feed: {}, now: FRI_EVENING }).out.some((n) => /Lucky/.test(n.title)));
  d.sales[0] = Object.assign({}, lucky, { keen: false, on: [] });
  assert.ok(!plan({ push: push(), deals: d, feed: {}, now: FRI_EVENING }).out.some((n) => /Lucky/.test(n.title)));
  d.sales[0] = Object.assign({}, lucky, { keen: false, on: ['2026-11-14'] });
  assert.ok(plan({ push: push(), deals: d, feed: {}, now: FRI_EVENING }).out.some((n) => /Lucky/.test(n.title)), 'keen on just that date');
  assert.ok(!plan({ push: push(), deals: deals(), feed: {}, now: new Date('2026-11-12T08:07:00Z') }).out.some((n) => /Lucky/.test(n.title)), 'Thursday evening: not tomorrow');
  const pp = push(); pp.prefs = { a: { sale: false }, b: { sale: false } };
  assert.ok(!plan({ push: pp, deals: deals(), feed: {}, now: FRI_EVENING }).out.some((n) => /Lucky/.test(n.title)), 'both turned sale days off');
});

await t('the week key and hits follow the live list', () => {
  assert.strictEqual(weekKey(feed, '2026-11-13'), 'sp:2026-11-11');
  assert.strictEqual(weekKey(feed, '2026-11-18'), '', 'last week has ended');
  assert.deepStrictEqual(weekHits(feed, [], '2026-11-13'), []);
  const um = JSON.parse(JSON.stringify(feed));
  um.specials.push({ s: 'Umall', n: 'Frozen Pork Dumplings 1kg', now: 999, was: 1869, off: 47, src: 'um', to: '2026-11-17' }, { s: 'Umall', n: 'Pork Buns 6 Pack', now: 500, was: 900, off: 44, src: 'um', to: '2026-11-10' });
  assert.deepStrictEqual(weekHits(um, ['dumplings', 'buns'], '2026-11-13').map((h) => h.n), ['Frozen Pork Dumplings 1kg'], "Umall's specials count while each one runs");
  assert.deepStrictEqual(oldKeys({ 'sale:s1|2026-08-01:eve': 1, 'sale:s1|2026-11-14:eve': 1, 'sp:2026-09-01': [], 'welcome:x': 1 }, '2026-11-13'), ['sale:s1|2026-08-01:eve', 'sp:2026-09-01']);
});

await t('sending: what gets written back', async () => {
  const pp = push(), calls = [];
  pp.sent = { 'sale:s1|2026-08-01:eve': 1 };
  const send = async (s, payload, vapid) => {
    calls.push([s.id, payload.title, vapid.pub]);
    if (s.id === 'p2') return { ok: false, status: 410 };
    return { ok: true };
  };
  const r = await run({ push: pp, deals: deals(), feed, now: FRI_EVENING, send });
  assert.deepStrictEqual(calls, [['p1', '🔔 Notifications are on', 'KEY'], ['p1', '📅 Lucky Mart sale tomorrow', 'KEY'], ['p2', '📅 Lucky Mart sale tomorrow', 'KEY'], ['p1', '🏷️ 2 things we buy are on special', 'KEY']]);
  assert.deepStrictEqual(r.write.subs, { p1: { welcomed: true }, p2: null }, 'welcomed, and a phone that has gone is removed');
  assert.deepStrictEqual(Object.keys(r.write.sent).sort(), ['sale:s1|2026-11-14:eve', 'sp:2026-11-11']);
  assert.deepStrictEqual(r.write.drop, ['sale:s1|2026-08-01:eve']);
  assert.deepStrictEqual([r.ok, r.failed], [3, 1]);
  const stale = await run({ push: push(), deals: { sales: [], watch: [] }, feed: {}, now: FRI_EVENING, send: async () => ({ ok: false, status: 403 }) });
  assert.deepStrictEqual(stale.write.subs, { p1: { stale: true } }, 'a key mismatch marks the phone to sign up again');
  assert.deepStrictEqual(stale.write.sent, {});
});

await t('Firestore values go both ways', () => {
  const v = { a: 1, b: 2.5, c: 'x', d: true, e: null, f: [1, 'two', { g: false }], h: {}, i: [] };
  assert.deepStrictEqual(fromFs(toFs(v)), v);
  assert.deepStrictEqual(toFs(1731500000000), { integerValue: '1731500000000' }, 'whole numbers are integers, as the app writes them');
  assert.deepStrictEqual(fromFs({ mapValue: {} }), {}, 'an empty map comes back without fields');
  assert.deepStrictEqual(fromFs({ arrayValue: {} }), []);
  assert.deepStrictEqual(toFs({ a: undefined, b: 1 }), { mapValue: { fields: { b: { integerValue: '1' } } } });
});

await t('field paths put odd keys in backticks', () => {
  assert.strictEqual(fieldPath('subs', 'p1a2b3c4d5e6f', 'stale'), 'subs.p1a2b3c4d5e6f.stale');
  assert.strictEqual(fieldPath('sent', 'sale:s1|2026-11-14:eve'), 'sent.`sale:s1|2026-11-14:eve`');
  assert.strictEqual(fieldPath('sent', 'a`b\\c'), 'sent.`a\\`b\\\\c`');
  const u = toUpdate({ subs: { p1: { welcomed: true }, p2: null }, sent: { 'sp:2026-11-11': ['Weet-Bix'] }, drop: ['sp:2026-11-11', 'sp:2026-09-02'], last: { at: 'x', sent: 1, failed: 0 } });
  assert.deepStrictEqual(u.mask, ['last', 'subs.p1.welcomed', 'subs.p2', 'sent.`sp:2026-11-11`', 'sent.`sp:2026-09-02`'], 'a key being written is never also cleared');
  assert.deepStrictEqual(Object.keys(u.fields).sort(), ['last', 'sent', 'subs']);
});

await t("the app's public Firebase settings", () => {
  const c = webConfig('window.HH_FIREBASE = {\n  apiKey: "AIzaTEST",\n  authDomain: "demo.firebaseapp.com",\n  projectId: "demo-household",\n};');
  assert.deepStrictEqual(c, { apiKey: 'AIzaTEST', projectId: 'demo-household' });
  assert.deepStrictEqual(webConfig(''), { apiKey: '', projectId: '' });
});

/* A pretend Firebase: email sign-in, and Firestore with the bot's rules. */
const BOT = 'robin+bot@example.com';
function fakeFirebase(docs, { rules = true } = {}) {
  const seen = { referer: [], auth: [], commits: 0 };
  const parse = (p) => { const out = []; let i = 0; while (i < p.length) { let s = ''; if (p[i] === '`') { i++; while (p[i] !== '`') { if (p[i] === '\\') i++; s += p[i++]; } i++; } else { while (i < p.length && p[i] !== '.') s += p[i++]; } out.push(s); if (p[i] === '.') i++; } return out; };
  const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
  const denied = () => json(403, { error: { code: 403, message: 'Missing or insufficient permissions.', status: 'PERMISSION_DENIED' } });
  const fetch = async (url, init = {}) => {
    const h = init.headers || {};
    if (url.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaTEST')) {
      seen.referer.push(h.referer);
      const b = JSON.parse(init.body);
      return b.email === BOT && b.password === 'long-pass' ? json(200, { idToken: 'bot-token', localId: 'u1' }) : json(400, { error: { code: 400, message: 'INVALID_LOGIN_CREDENTIALS' } });
    }
    const base = 'https://firestore.googleapis.com/v1/projects/demo-household/databases/(default)/documents';
    if (!url.startsWith(base)) return json(404, {});
    seen.auth.push(h.authorization);
    if (h.authorization !== 'Bearer bot-token') return json(401, { error: { status: 'UNAUTHENTICATED' } });
    if (url === base + ':commit') {
      seen.commits++;
      const w = JSON.parse(init.body).writes[0], path = w.update.name.split('/documents/')[1];
      if (!rules || path !== 'hh/push') return denied();
      if (!docs[path]) return json(404, { error: { status: 'NOT_FOUND' } });
      const before = JSON.stringify(docs[path]), next = JSON.parse(before), data = fromFs({ mapValue: { fields: w.update.fields } });
      w.updateMask.fieldPaths.forEach((fp) => {
        const keys = parse(fp); let from = data, to = next;
        for (let i = 0; i < keys.length - 1; i++) { from = from && from[keys[i]]; to = to[keys[i]] = to[keys[i]] && typeof to[keys[i]] === 'object' ? to[keys[i]] : {}; }
        const k = keys[keys.length - 1];
        if (from && k in from) to[k] = from[k]; else delete to[k];
      });
      const changed = Object.keys(Object.assign({}, docs[path], next)).filter((k) => JSON.stringify(docs[path][k]) !== JSON.stringify(next[k]));
      if (changed.some((k) => ['subs', 'sent', 'last'].indexOf(k) < 0)) return denied();
      docs[path] = next;
      return json(200, { writeResults: [{}] });
    }
    const path = url.slice(base.length + 1);
    if (!rules || ['hh/deals', 'hh/push'].indexOf(path) < 0) return denied();
    return docs[path] ? json(200, { name: path, fields: toFs(docs[path]).mapValue.fields }) : json(404, { error: { status: 'NOT_FOUND' } });
  };
  return { fetch, seen };
}
const config = { apiKey: 'AIzaTEST', projectId: 'demo-household' };

await t('a run end to end, signed in as the bot', async () => {
  const pp = push();
  pp.sent = { 'sale:s1|2026-08-01:eve': 1 };
  const docs = { 'hh/push': pp, 'hh/deals': deals(), 'hh/settings': { names: { a: 'Robin' } } }, fb = fakeFirebase(docs);
  const send = async (s) => (s.id === 'p2' ? { ok: false, status: 410 } : { ok: true });
  const r = await job({ email: BOT, password: 'long-pass', config, feed, now: FRI_EVENING, fetch: fb.fetch, send, referer: 'https://robin.github.io/household/' });
  const after = docs['hh/push'];
  assert.deepStrictEqual(fb.seen.referer, ['https://robin.github.io/household/'], 'signs in from the app site, in case the web key is locked to it');
  assert.ok(fb.seen.auth.every((a) => a === 'Bearer bot-token'), 'every Firestore call uses the bot login');
  assert.strictEqual(after.subs.p1.welcomed, true);
  assert.strictEqual(after.subs.p1.endpoint, 'https://web.push.apple.com/1', 'the rest of the phone is kept');
  assert.ok(!('p2' in after.subs), 'a phone that has gone is removed');
  assert.ok(after.subs.p3 && 'p4' in after.subs, 'other phones are left alone');
  assert.deepStrictEqual(Object.keys(after.sent).sort(), ['sale:s1|2026-11-14:eve', 'sp:2026-11-11'], 'old markers cleared, new ones noted');
  assert.deepStrictEqual(after.sent['sp:2026-11-11'], ['Sanitarium Weet-Bix 575g', '20% off Everything In-Store']);
  assert.deepStrictEqual(after.vapid, { pub: 'KEY', d: 'secret' });
  assert.deepStrictEqual(after.prefs, { b: { specials: false } });
  assert.deepStrictEqual(after.last, { at: FRI_EVENING.toISOString(), sent: 3, failed: 1 });
  assert.strictEqual(runSummary(r), "Sent 3 pop-ups (a welcome, a sale day reminder, watch-list specials), 1 couldn't be sent.");
  assert.ok(!/Lucky|Weet/.test(runSummary(r)), 'the public log never says what the pop-ups said');
  const again = await job({ email: BOT, password: 'long-pass', config, feed, now: FRI_EVENING, fetch: fb.fetch, send });
  assert.strictEqual(again.ok, 0, 'nothing is sent twice');
});

await t('clear errors for a wrong login or old rules', async () => {
  const send = async () => ({ ok: true });
  await assert.rejects(job({ email: BOT, password: 'nope', config, feed, now: FRI_EVENING, fetch: fakeFirebase({ 'hh/push': push() }).fetch, send }), /BOT_EMAIL and BOT_PASSWORD/);
  await assert.rejects(job({ email: BOT, password: 'long-pass', config, feed, now: FRI_EVENING, fetch: fakeFirebase({ 'hh/push': push() }, { rules: false }).fetch, send }), /new Firestore rules/);
  const offline = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
  await assert.rejects(job({ email: BOT, password: 'long-pass', config, feed, now: FRI_EVENING, fetch: offline, send }), /sign in failed \(no answer: getaddrinfo/);
});

await t('before any phone is on, it only notes that it ran', async () => {
  const docs = { 'hh/push': { prefs: { a: { sale: true } } } }, fb = fakeFirebase(docs);
  const r = await job({ email: BOT, password: 'long-pass', config, feed, now: FRI_EVENING, fetch: fb.fetch, send: async () => assert.fail('nothing to send') });
  assert.strictEqual(r, null);
  assert.deepStrictEqual(docs['hh/push'], { prefs: { a: { sale: true } }, last: { at: FRI_EVENING.toISOString(), sent: 0, failed: 0 } });
  assert.strictEqual(runSummary(r), 'No phone has turned notifications on yet.');
  const none = fakeFirebase({});
  assert.strictEqual(await job({ email: BOT, password: 'long-pass', config, feed, now: FRI_EVENING, fetch: none.fetch, send: async () => ({ ok: true }) }), null);
  assert.strictEqual(none.seen.commits, 0, "with no phones document yet, it doesn't try to make one");
});

console.log(passed + ' groups passed');
