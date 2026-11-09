/* What the notification job sends, and to whom, without Firebase or a push service. node test/notify.test.mjs */
import assert from 'node:assert';
import { plan, run, sydneyNow, weekKey, weekHits, oldKeys } from '../src/github/notify.mjs';

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
  assert.deepStrictEqual(titles, ['Notifications are on', 'Lucky Mart sale tomorrow', 'On special this week']);
  const sale = p.out[1];
  assert.deepStrictEqual([sale.to, sale.body, sale.url, sale.key], [['p1', 'p2'], 'Up to 20% off · Artarmon', './#deals', 'sale:s1|2026-11-14:eve']);
  const sp = p.out[2];
  assert.deepStrictEqual(sp.to, ['p1'], 'the second person turned specials off');
  assert.strictEqual(sp.body, 'Sanitarium Weet-Bix 575g at Coles, 20% off Everything In-Store at Tokyo Mart', 'watch words match a deal by its shop, and the half-price post is left out');
  assert.deepStrictEqual(p.out[0].to, ['p1'], 'only the new phone is welcomed');
});

await t('the morning of, and nothing twice', () => {
  const pp = push();
  pp.subs.p1.welcomed = true;
  pp.sent = { 'sale:s1|2026-11-14:eve': 1, 'sp:2026-11-11': ['Sanitarium Weet-Bix 575g', '20% off Everything In-Store'] };
  const p = plan({ push: pp, deals: deals(), feed, now: SAT_MORNING });
  assert.deepStrictEqual(p.out.map((n) => n.title), ['Lucky Mart sale is on today']);
  pp.sent['sale:s1|2026-11-14:am'] = 1;
  assert.deepStrictEqual(plan({ push: pp, deals: deals(), feed, now: SAT_MORNING }).out, []);
  const more = JSON.parse(JSON.stringify(feed));
  more.specials.push({ s: 'Woolworths', n: 'Weetbix Bites 510g', now: 400, was: 800, off: 50, src: 'hp' });
  const p2 = plan({ push: pp, deals: deals(), feed: more, now: SAT_MORNING });
  assert.deepStrictEqual([p2.out[0].title, p2.out[0].body], ['More on special this week', 'Weetbix Bites 510g at Woolies']);
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
  assert.deepStrictEqual(calls, [['p1', 'Notifications are on', 'KEY'], ['p1', 'Lucky Mart sale tomorrow', 'KEY'], ['p2', 'Lucky Mart sale tomorrow', 'KEY'], ['p1', 'On special this week', 'KEY']]);
  assert.deepStrictEqual(r.write.subs, { p1: { welcomed: true }, p2: null }, 'welcomed, and a phone that has gone is removed');
  assert.deepStrictEqual(Object.keys(r.write.sent).sort(), ['sale:s1|2026-11-14:eve', 'sp:2026-11-11']);
  assert.deepStrictEqual(r.write.drop, ['sale:s1|2026-08-01:eve']);
  assert.deepStrictEqual([r.ok, r.failed], [3, 1]);
  const stale = await run({ push: push(), deals: { sales: [], watch: [] }, feed: {}, now: FRI_EVENING, send: async () => ({ ok: false, status: 403 }) });
  assert.deepStrictEqual(stale.write.subs, { p1: { stale: true } }, 'a key mismatch marks the phone to sign up again');
  assert.deepStrictEqual(stale.write.sent, {});
});

console.log(passed + ' groups passed');
