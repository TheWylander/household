/* What the notification job sends, and to whom, without Firebase or a push service. node test/notify.test.mjs */
import assert from 'node:assert';
import { APP, payloadOf, plan, run, sydneyNow, awake, weekKey, weekHits, wordHits, specialsPop, weeklyPop, topPicks, withSnaps, withWeb, spendsPop, oldKeys, webConfig, fromFs, toFs, fieldPath, toUpdate, job, runSummary } from '../src/github/notify.mjs';

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
    { s: 'Coles', n: 'Sanitarium Weet-Bix 575g', now: 250, was: 500, off: 50, src: 'hp', cat: 'Pantry' },
    { s: 'Woolworths', n: 'Muffins', now: 300, was: 600, off: 50, src: 'hp', cat: 'Bakery' }
  ],
  deals: [
    { id: '1', t: '20% off Everything In-Store', s: 'Tokyo Mart', to: '2026-11-15' },
    { id: '2', t: 'Weet-Bix half price + 191 more', s: 'Coles', to: '2026-11-17', hp: true }
  ]
};
const FRI_EVENING = new Date('2026-11-13T08:07:00Z'); // Fri 13 Nov, 7:07pm in Sydney
const SAT_MORNING = new Date('2026-11-13T20:37:00Z'); // Sat 14 Nov, 7:37am in Sydney

await t('Sydney time, across daylight saving', () => {
  assert.deepStrictEqual(sydneyNow(FRI_EVENING), { day: '2026-11-13', hour: 19, min: 7 });
  assert.deepStrictEqual(sydneyNow(new Date('2026-06-12T09:07:00Z')), { day: '2026-06-12', hour: 19, min: 7 }, 'winter is UTC+10');
});

await t('the evening before a sale day', () => {
  const p = plan({ push: push(), deals: deals(), feed, now: FRI_EVENING });
  assert.deepStrictEqual(p.subs.map((s) => s.id), ['p1', 'p2'], 'phones with an older key or removed are left out');
  const titles = p.out.map((n) => n.title);
  assert.deepStrictEqual(titles, ['🔔 Notifications are on', '📅 Lucky Mart sale tomorrow', '🏷️ Check out the top weekly specials']);
  assert.deepStrictEqual(p.out[0].body.split('\n').map((l) => l.slice(0, 2)), ['💸', '📅', '🏷️'.slice(0, 2)], 'the welcome lists each kind of pop-up, one per line');
  const sale = p.out[1];
  assert.deepStrictEqual([sale.to, sale.body, sale.url, sale.key], [['p1', 'p2'], 'Up to 20% off\n📍 Shop 2, 2 Wilkes Ave, Artarmon', './#cal=2026-11-14', 'sale:s1|2026-11-14:eve'], 'tapping it opens the Calendar on the sale day');
  const sp = p.out[2];
  assert.deepStrictEqual(sp.to, ['p1'], 'the second person turned specials off');
  assert.strictEqual(sp.body, 'Sanitarium Weet-Bix 575g · $2.50 at Coles\n20% off Everything In-Store at Tokyo Mart\nMuffins · $3.00 at Woolies',
    "the week's first: one per line with the price, watch words first (they match a deal by its shop, and the half-price post is left out), then the week's best");
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
  assert.deepStrictEqual([p2.out[0].title, p2.out[0].body], ['🏷️ More top specials this week', 'Weetbix Bites 510g · $4.00 at Woolies']);
  const lots = JSON.parse(JSON.stringify(feed));
  ['Weet-Bix Kids', 'Weet-Bix Blends', 'Weet-Bix Gold', 'Weet-Bix Protein'].forEach((n) => lots.specials.push({ s: 'Coles', n, now: 300, was: 600, off: 50, src: 'hp' }));
  const grouped = plan({ push: push(), deals: deals(), feed: lots, now: FRI_EVENING }).out.filter((n) => n.tag === 'specials')[0];
  assert.deepStrictEqual(grouped.body.split('\n'), ['Sanitarium Weet-Bix 575g · $2.50 at Coles', '20% off Everything In-Store at Tokyo Mart', 'Muffins · $3.00 at Woolies'], 'five Weet-Bix specials make one line, with the best of them, and none fills the third line');
  const six = plan({ push: push(), deals: { sales: [], watch: ['weetbix', 'tokyo mart', 'muffins', 'kids', 'blends', 'gold'] }, feed: lots, now: FRI_EVENING }).out.filter((n) => n.tag === 'specials')[0];
  assert.deepStrictEqual([six.title, six.body.split('\n').length, six.body.split('\n')[2]], ['🏷️ Check out the top weekly specials', 3, '+ muffins, kids, blends and gold in the app'], 'six words: two lines and the rest by name, so it fits under the heading');
  const one = specialsPop(wordHits(feed, ['weetbix'], '2026-11-13'), false);
  assert.deepStrictEqual(one, { title: '🏷️ Check out the top weekly specials', body: 'Sanitarium Weet-Bix 575g · $2.50 at Coles' }, 'one word: its best deal');
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
  assert.deepStrictEqual(weekHits(feed, ['weetbix'], '2026-11-10'), [], "next week's list, posted early, doesn't pop up until it starts");
  assert.strictEqual(weekHits(feed, ['weetbix'], '2026-11-11').length, 1, 'and does on the day it starts');
  const um = JSON.parse(JSON.stringify(feed));
  um.specials.push({ s: 'Umall', n: 'Frozen Pork Dumplings 1kg', now: 999, was: 1869, off: 47, src: 'um', to: '2026-11-17' }, { s: 'Umall', n: 'Pork Buns 6 Pack', now: 500, was: 900, off: 44, src: 'um', to: '2026-11-10' });
  assert.deepStrictEqual(weekHits(um, ['dumplings', 'buns'], '2026-11-13').map((h) => h.n), ['Frozen Pork Dumplings 1kg'], "Umall's specials count while each one runs");
  const me = JSON.parse(JSON.stringify(feed));
  me.sources.meat = { ok: true, from: '2026-11-11', to: '2026-11-17' };
  me.specials.push({ s: 'Meat Emporium', n: 'Beef Rump Cap WAS $30.99/KG NOW $25.99/KG', now: 5718, was: 6818, off: 16, src: 'me' });
  assert.deepStrictEqual(weekHits(me, ['rump'], '2026-11-13').map((h) => [h.n, h.s]), [['Beef Rump Cap WAS $30.99/KG NOW $25.99/KG', 'Meat Emporium']], "Meat Emporium's sales count through the specials week");
  assert.deepStrictEqual(weekHits(me, ['rump'], '2026-11-18'), [], 'and not after it');
  assert.deepStrictEqual(oldKeys({ 'sale:s1|2026-08-01:eve': 1, 'sale:s1|2026-11-14:eve': 1, 'sp:2026-09-01': [], 'welcome:x': 1, 'ev:2026-11-05:e1': 1, 'ev:2026-11-06:e2': 1 }, '2026-11-13'), ['sale:s1|2026-08-01:eve', 'sp:2026-09-01', 'ev:2026-11-05:e1'], "a spend's marker goes after a week");
});

/* The week's top specials: Wednesday's new lists, as Coles and Woolies post them, with when each was last this cheap. */
const WED_AM = new Date('2026-11-10T20:40:00Z'); // Wed 11 Nov, 7:40am in Sydney
const week = () => ({
  sources: { report: { ok: true, from: '2026-11-11', to: '2026-11-17' }, harris: { ok: true, from: '2026-11-11', to: '2026-11-17' } },
  specials: [
    { s: 'Coles', n: 'Bread Loaf 650g', now: 200, was: 400, off: 50, src: 'hp', cat: 'Bakery', last: '2 weeks ago @ CL' },
    { s: 'Woolworths', n: 'Anolon Endurance+ 6 Piece Cookware Set', now: 49000, was: 98000, off: 50, src: 'hp', cat: 'Home & Lifestyle', last: '' },
    { s: 'Woolworths', n: 'Finish Ultimate Dishwashing Tablets 70 Pack', now: 2600, was: 5200, off: 50, src: 'hp', cat: 'Cleaning & Maintenance', last: '1 week ago @ WW' },
    { s: 'Coles', n: 'Ferrero Rocher Diamond Gift Box 300g', now: 1850, was: 3700, off: 50, src: 'hp', cat: 'Snacks & Confectionery', last: '1 week ago @ CL' },
    { s: 'Coles', n: 'Lindt Lindor Gift Box 235g', now: 1500, was: 3000, off: 50, src: 'hp', cat: 'Snacks & Confectionery', last: '1 week ago @ CL' },
    { s: 'Coles', n: 'Vittoria Freeze Dried Instant Coffee 400g', now: 1950, was: 3900, off: 50, src: 'hp', cat: 'Drinks', last: '9 weeks ago @ CL' },
    { s: 'Coles', n: "Arnott's Tim Tam Original 200g", now: 300, was: 600, off: 50, src: 'hp', cat: 'Snacks & Confectionery', last: '10 weeks ago @ CL' },
    { s: 'Coles', n: 'Sunrice Jasmine Rice 5kg', now: 1350, was: 2700, off: 50, src: 'hp', cat: 'Pantry', last: '3 weeks ago @ CL' },
    { s: 'Umall', n: 'Pork Buns 6 Pack', now: 500, was: 4900, off: 90, src: 'um', cat: 'Freezer', to: '2026-11-10' },
    { s: 'Harris Farm', n: 'Imperfect Avocados 600g', now: 350, was: 0, off: 0, src: 'hf', cat: 'Fruit' }
  ],
  deals: []
});
const onePhone = () => Object.assign(push(), { subs: { p1: Object.assign({}, push().subs.p1, { welcomed: true }) }, prefs: {} });

await t("Wednesday's top specials, even with nothing from the watch list", async () => {
  assert.deepStrictEqual(topPicks(week(), [], '2026-11-11', 5).map((x) => x.n), ['Vittoria Freeze Dried Instant Coffee 400g', 'Ferrero Rocher Diamond Gift Box 300g', 'Sunrice Jasmine Rice 5kg'],
    'food and drink only (no cookware or dishwasher tablets), biggest saving first, one from each aisle (one box of chocolates, and the bread shares the pantry with the rice), and nothing that has ended or has no usual price');
  assert.strictEqual(topPicks(week(), ['vittoria'], '2026-11-11')[0].n, 'Ferrero Rocher Diamond Gift Box 300g', "the watch list's own matches aren't picks");
  const p = plan({ push: onePhone(), deals: { sales: [], watch: [] }, feed: week(), now: WED_AM });
  assert.deepStrictEqual(p.out.map((n) => [n.title, n.body, n.url, n.key]), [['🏷️ Check out the top weekly specials',
    'Vittoria Freeze Dried Instant · $19.50 at Coles\nFerrero Rocher Diamond Gift · $18.50 at Coles\nSunrice Jasmine Rice 5kg · $13.50 at Coles', './#deals', 'top:2026-11-11']], 'each name cut to four words so three lines fit');
  const watched = plan({ push: onePhone(), deals: { sales: [], watch: ['tim tam'] }, feed: week(), now: WED_AM }).out[0];
  assert.deepStrictEqual(watched.body.split('\n'), ["Arnott's Tim Tam Original · $3.00 at Coles", 'Vittoria Freeze Dried Instant · $19.50 at Coles', 'Ferrero Rocher Diamond Gift · $18.50 at Coles'], 'the watch list goes first');
  const pp = onePhone();
  const r = await run({ push: pp, deals: { sales: [], watch: [] }, feed: week(), now: WED_AM, send: async () => ({ ok: true }) });
  assert.deepStrictEqual([r.write.sent['top:2026-11-11'], r.write.sent['sp:2026-11-11']], [WED_AM.getTime(), []], 'noted, with the watch-list matches it had (none)');
  assert.strictEqual(runSummary(r), "Sent 1 pop-up (the week's top specials).");
  pp.sent = r.write.sent;
  assert.deepStrictEqual(plan({ push: pp, deals: { sales: [], watch: [] }, feed: week(), now: FRI_EVENING }).out, [], 'once a week');
  const later = plan({ push: pp, deals: { sales: [], watch: ['tim tam'] }, feed: week(), now: FRI_EVENING }).out;
  assert.deepStrictEqual(later.map((n) => [n.title, n.body]), [['🏷️ More top specials this week', "Arnott's Tim Tam Original · $3.00 at Coles"]], 'a new watch-list match later in the week');
});

/* Coles fresh food and Liquorland come in from our screenshots in the app, kept in hh/deals until their last day. */
const SNAPS = [
  { id: 's1', s: 'Coles', n: 'Coles Australian Pork Loin Chops 1kg', now: 1100, was: 1600, promo: '', cat: 'Meat & Seafood', to: '2026-11-17', by: 'a' },
  { id: 's2', s: 'Liquorland', n: 'Coopers Pale Ale 24 x 375mL', now: 5500, was: 6500, promo: 'Save $10', cat: 'Liquor', to: '2026-11-17', by: 'b' },
  { id: 's3', s: 'coles', n: 'Bread loaf 650g', now: 200, was: 400, cat: 'Bakery', to: '2026-11-17' },
  { id: 's4', s: 'Coles', n: 'Kensington Pride Mangoes Each', now: 100, was: 200, cat: 'Fruit & Veg', to: '2026-11-10' },
  { n: '', now: 100, to: '2026-11-17' }, { n: 'No price', now: 0, to: '2026-11-17' }, { n: 'No last day', now: 300 }, null];
await t('specials from our screenshots join the lists', () => {
  const f = withSnaps(week(), SNAPS), mine = f.specials.filter((x) => x.src === 'snap');
  assert.deepStrictEqual(mine.map((x) => [x.s, x.n]), [['Coles', 'Coles Australian Pork Loin Chops 1kg'], ['Liquorland', 'Coopers Pale Ale 24 x 375mL'], ['Coles', 'Kensington Pride Mangoes Each']],
    "the bread the half-price list already has is left out, and so is anything without a name, price or last day");
  assert.strictEqual(week().specials.length + 3, f.specials.length, 'the lists themselves are untouched');
  assert.strictEqual(withSnaps(week(), []).specials.length, week().specials.length);
  assert.strictEqual(withSnaps(undefined, undefined), undefined, 'no screenshots, nothing changes');
  assert.deepStrictEqual(weekHits(f, ['pork loin', 'coopers', 'mangoes'], '2026-11-13').map((h) => [h.n, h.s]), [['Coles Australian Pork Loin Chops 1kg', 'Coles'], ['Coopers Pale Ale 24 x 375mL', 'Liquorland']],
    'they count for the watch list till their last day (the mangoes ended on Tuesday)');
  assert.deepStrictEqual(weekHits(f, ['pork loin'], '2026-11-18'), [], 'and not after');
  assert.ok(topPicks(f, [], '2026-11-11', 5).some((x) => x.n === 'Coles Australian Pork Loin Chops 1kg'), "and they're in the running for the week's top picks");
  const p = plan({ push: onePhone(), deals: { sales: [], watch: ['pork loin'], snaps: SNAPS }, feed: week(), now: WED_AM });
  assert.strictEqual(p.out[0].body.split('\n')[0], 'Coles Australian Pork Loin · $11.00 at Coles', "Wednesday's pop-up leads with the watch list's match from a screenshot");
  const sentAlready = Object.assign(onePhone(), { sent: { 'top:2026-11-11': WED_AM.getTime(), 'sp:2026-11-11': [] } });
  const q = plan({ push: sentAlready, deals: { sales: [], watch: ['coopers'], snaps: SNAPS }, feed: week(), now: new Date('2026-11-12T22:00:00Z') });
  assert.deepStrictEqual(q.out.map((n) => [n.title, n.body]), [['🏷️ More top specials this week', 'Coopers Pale Ale 24 · $55.00 at Liquorland']],
    'after the week\'s pop-up, a watch-list match added from a screenshot pops up on the next run');
});

/* Coles fresh food and Liquorland, read from Coles' website in the laptop's browser, one tab-separated line each. */
const WEB = { at: '2026-11-11T22:47:00Z', by: 'a', to: '2026-11-17', items: [
  ['Coles', 'Coles Australian Pork Loin Chops 1kg', 1100, 1600, '', 'Meat & Seafood', 'Pork', '/product/coles-australian-pork-loin-chops-1kg-123'].join('\t'),
  ['Coles', 'Coles Medium Calypso Mangoes', 290, 0, 'Buy 2 for $5', 'Fruit & Veg', 'Fruit', ''].join('\t'),
  ['Liquorland', 'Jameson Irish Whiskey 700ml', 5500, 6800, '', 'Liquor', 'Spirits', ''].join('\t'),
  ['Coles', 'Bread Loaf 650g', 200, 400, '', 'Bakery', '', ''].join('\t'),
  ['Coles', '', 100, 0, '', 'Fruit & Veg', '', ''].join('\t'), 42, null] };
await t("specials from Coles' website join the lists", () => {
  const f = withWeb(week(), WEB), mine = f.specials.filter((x) => x.src === 'web');
  assert.deepStrictEqual(mine.map((x) => [x.s, x.n, x.now, x.was, x.to]), [['Coles', 'Coles Australian Pork Loin Chops 1kg', 1100, 1600, '2026-11-17'],
    ['Coles', 'Coles Medium Calypso Mangoes', 290, 0, '2026-11-17'], ['Liquorland', 'Jameson Irish Whiskey 700ml', 5500, 6800, '2026-11-17']],
    'the bread already on the half-price list is left out, and so is a line without a name or one that is not text');
  const w0 = week();
  assert.ok(withWeb(w0, null) === w0 && withWeb(undefined, { to: 'soon', items: ['x'] }) === undefined && withWeb(w0, { to: '2026-11-17', items: [] }) === w0, 'nothing to add, nothing changes');
  assert.deepStrictEqual(weekHits(f, ['jameson', 'mangoes'], '2026-11-13').map((h) => h.n), ['Jameson Irish Whiskey 700ml', 'Coles Medium Calypso Mangoes'], 'they count for the watch list');
  assert.deepStrictEqual(weekHits(f, ['jameson'], '2026-11-18'), [], 'until their last day');
  const sentAlready = Object.assign(onePhone(), { sent: { 'top:2026-11-11': WED_AM.getTime(), 'sp:2026-11-11': [] } });
  const q = plan({ push: sentAlready, deals: { sales: [], watch: ['jameson'], web: WEB }, feed: week(), now: new Date('2026-11-12T22:00:00Z') });
  assert.deepStrictEqual(q.out.map((n) => [n.title, n.body]), [['🏷️ More top specials this week', 'Jameson Irish Whiskey 700ml · $55.00 at Liquorland']],
    'a watch-list match read from the website pops up on the next run');
  const both = withWeb(withSnaps(week(), [{ s: 'Liquorland', n: 'Jameson Irish Whiskey 700ml', now: 5000, to: '2026-11-17' }]), WEB);
  assert.strictEqual(both.specials.filter((x) => /Jameson/.test(x.n)).length, 1, 'one we added from a screenshot is not doubled up by the website');
});

await t("the top specials wait for the week's lists, and stop after Friday", () => {
  const early = week();
  early.sources.harris = { ok: true, from: '2026-11-04', to: '2026-11-10' };
  const tue = new Date('2026-11-09T20:40:00Z'); // Tue 10 Nov, 7:40am
  assert.strictEqual(weekKey(early, '2026-11-10'), 'sp:2026-11-04', "next week's half-price list, posted early, isn't this week's");
  assert.deepStrictEqual(plan({ push: onePhone(), deals: { sales: [], watch: [] }, feed: early, now: tue }).out, [], "so nothing on Tuesday, and last week's is long done");
  assert.strictEqual(weekKey(early, '2026-11-11'), 'sp:2026-11-11', 'it counts from Wednesday');
  const sat = plan({ push: onePhone(), deals: { sales: [], watch: [] }, feed: week(), now: SAT_MORNING }).out;
  assert.deepStrictEqual(sat, [], 'a week that started on Wednesday gets no top specials on Saturday');
  const satHit = plan({ push: onePhone(), deals: { sales: [], watch: ['tim tam'] }, feed: week(), now: SAT_MORNING }).out;
  assert.deepStrictEqual(satHit.map((n) => n.title), ['🏷️ Check out the top weekly specials'], 'though a watch-list match still pops up');
  const pp = onePhone(); pp.sent = { 'sp:2026-11-11': ['Something'] };
  assert.deepStrictEqual(plan({ push: pp, deals: { sales: [], watch: [] }, feed: week(), now: WED_AM }).out, [], 'a specials pop-up already went this week');
  const off = onePhone(); off.prefs = { a: { specials: false } };
  assert.deepStrictEqual(plan({ push: off, deals: { sales: [], watch: [] }, feed: week(), now: WED_AM }).out, [], 'specials switched off');
  assert.deepStrictEqual(plan({ push: onePhone(), deals: { sales: [], watch: [] }, feed: { sources: week().sources, specials: [], deals: [] }, now: WED_AM }).out, [], 'nothing on special, nothing to say');
  assert.deepStrictEqual(weeklyPop([], []), { title: '🏷️ Check out the top weekly specials', body: '' });
});

await t('night time in Sydney: nothing goes out until 6:30am, except a spend added just now', () => {
  const at = (iso) => plan({ push: push(), deals: deals(), feed: week(), now: new Date(iso) });
  const late = at('2026-11-10T16:22:00Z'); // Wed 3:22am, when GitHub ran the 7pm job
  assert.deepStrictEqual([late.out, late.night], [[], true], 'no welcome, sale day or specials at 3am');
  assert.strictEqual(runSummary({ plan: late, ok: 0, failed: 0 }), 'Night time in Sydney, so nothing went out. Anything due goes on the first run after 6:30am.');
  assert.deepStrictEqual([at('2026-11-10T19:29:00Z').night, at('2026-11-10T19:30:00Z').night], [true, undefined], '6:29am is night, 6:30am is morning');
  assert.deepStrictEqual([at('2026-11-11T10:29:00Z').night, at('2026-11-11T10:30:00Z').night], [undefined, true], '9:29pm is evening, 9:30pm is night');
  assert.deepStrictEqual([awake({ hour: 6, min: 30 }), awake({ hour: 21, min: 29 }), awake({ hour: 21, min: 30 }), awake({ hour: 3, min: 0 })], [true, true, false, false]);
  const night = new Date('2026-11-10T16:22:00Z'), sp = Object.assign(push(), { prefs: {}, events: { a: [{ id: 'e1', at: night.getTime() - 60e3, n: 'Robin', t: '💸 Robin added $9.00', b: 'Coles', c: 900, sh: 450 }] } });
  assert.deepStrictEqual(plan({ push: sp, deals: {}, feed: {}, now: night, mode: 'spends' }).out.filter((n) => n.spend).map((n) => n.to), [['p2']], 'a spend added at night still goes to the other phone straight away');
  assert.deepStrictEqual(plan({ push: sp, deals: {}, feed: {}, now: night }).out, [], 'but a late morning or evening run holds it till morning');
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
  assert.deepStrictEqual(calls, [['p1', '🔔 Notifications are on', 'KEY'], ['p1', '📅 Lucky Mart sale tomorrow', 'KEY'], ['p2', '📅 Lucky Mart sale tomorrow', 'KEY'], ['p1', '🏷️ Check out the top weekly specials', 'KEY']],
    "each pop-up's title says what it's about (the iPhone adds \"from Two of Us\" itself), sent with the household's key")
  assert.deepStrictEqual(payloadOf({ title: '📅 Lucky Mart sale tomorrow', body: 'Up to 20% off', url: './#cal=2026-11-14', tag: 'sale-s1', key: 'x', to: ['p1'] }),
    { title: '📅 Lucky Mart sale tomorrow', body: 'Up to 20% off', url: './#cal=2026-11-14', tag: 'sale-s1' }, 'only what the phone shows goes in the pop-up');
  assert.deepStrictEqual([APP, payloadOf({ body: 'No title' }).title], ['Two of Us', 'Two of Us'], "the app's name only stands in for a missing title");
  assert.deepStrictEqual(r.write.subs, { p1: { welcomed: true }, p2: null }, 'welcomed, and a phone that has gone is removed');
  assert.deepStrictEqual(Object.keys(r.write.sent).sort(), ['sale:s1|2026-11-14:eve', 'sp:2026-11-11', 'top:2026-11-11']);
  assert.deepStrictEqual(r.write.sent['sp:2026-11-11'], ['Sanitarium Weet-Bix 575g', '20% off Everything In-Store'], 'the watch-list matches it had, so only new ones pop up later');
  assert.deepStrictEqual(r.write.drop, ['sale:s1|2026-08-01:eve']);
  assert.deepStrictEqual([r.ok, r.failed], [3, 1]);
  const stale = await run({ push: push(), deals: { sales: [], watch: [] }, feed: {}, now: FRI_EVENING, send: async () => ({ ok: false, status: 403 }) });
  assert.deepStrictEqual(stale.write.subs, { p1: { stale: true } }, 'a key mismatch marks the phone to sign up again');
  assert.deepStrictEqual(stale.write.sent, {});
});

/* New spends: what each phone notes in hh/push, as the app writes it. */
const T0 = FRI_EVENING.getTime();
const ev = (id, mins, o) => Object.assign({ id, at: T0 - mins * 60e3, n: 'Robin', t: '💸 Robin added $42.10', b: 'Woolworths · Groceries\nRobin paid · your share $21.05', l: '$42.10 Woolworths', c: 4210, sh: 2105 }, o || {});
const spendPush = (events, extra) => Object.assign(push(), { subs: Object.assign(push().subs, { p1: Object.assign({}, push().subs.p1, { welcomed: true }) }), prefs: {}, events }, extra || {});

await t('a new spend pops up on the other phone only', () => {
  const p = plan({ push: spendPush({ a: [ev('e1', 1)] }), deals: deals(), feed, now: FRI_EVENING, mode: 'spends' });
  assert.deepStrictEqual(p.out.length, 1, 'a spends run leaves sale days and specials to the morning and evening runs');
  const n = p.out[0];
  assert.deepStrictEqual([n.to, n.title, n.body, n.keys, n.url, n.spend], [['p2'], '💸 Robin added $42.10', 'Woolworths · Groceries\nRobin paid · your share $21.05', ['ev:2026-11-13:e1'], './', true]);
  const both = plan({ push: spendPush({ b: [ev('e2', 2, { n: 'Jules', t: '💸 Jules added $5.50' })] }), deals: deals(), feed, now: FRI_EVENING, mode: 'spends' });
  assert.deepStrictEqual(both.out.map((x) => [x.to, x.title]), [[['p1'], '💸 Jules added $5.50']], "and the other way: Jules's spend goes to Robin's phone");
  const all = plan({ push: spendPush({ a: [ev('e1', 1)] }), deals: deals(), feed, now: FRI_EVENING });
  assert.deepStrictEqual(all.out.map((x) => x.title), ['💸 Robin added $42.10', '📅 Lucky Mart sale tomorrow', '🏷️ Check out the top weekly specials'], 'the evening run sends a spend that missed out, with the rest');
});

await t('several spends make one pop-up', () => {
  const three = [ev('e1', 30), ev('e2', 20, { l: '$5.50 Coffee', c: 550, sh: 275 }), ev('e3', 10, { l: '$12.00 Uber', c: 1200, sh: 600 })];
  const n = plan({ push: spendPush({ a: three }), deals: deals(), feed, now: FRI_EVENING, mode: 'spends' }).out[0];
  assert.deepStrictEqual([n.title, n.body.split('\n')], ['💸 Robin added 3 spends, $59.60', ['$42.10 Woolworths, $5.50 Coffee and $12.00 Uber', 'Your share: $29.80']]);
  assert.strictEqual(n.keys.length, 3);
  const five = spendsPop([1, 2, 3, 4, 5].map((i) => ev('e' + i, 50 - i, { l: '$1.00 Thing ' + i, c: 100, sh: 50 })));
  assert.deepStrictEqual([five.title, five.body.split('\n')], ['💸 Robin added 5 spends, $5.00', ['$1.00 Thing 1, $1.00 Thing 2 and 3 more', 'Your share: $2.50']], 'short enough for the lock screen under the heading');
});

await t("old, sent, switched off or nobody to tell: no spend pop-up", () => {
  const sent = { 'ev:2026-11-13:e1': 1 };
  assert.deepStrictEqual(plan({ push: spendPush({ a: [ev('e1', 1)] }, { sent }), deals: deals(), feed, now: FRI_EVENING, mode: 'spends' }).out, [], 'nothing twice');
  assert.deepStrictEqual(plan({ push: spendPush({ a: [ev('e1', 37 * 60)] }), deals: deals(), feed, now: FRI_EVENING, mode: 'spends' }).out, [], 'older than a day and a half is left be');
  assert.deepStrictEqual(plan({ push: spendPush({ a: [null, { id: 'x' }, ev('', 1)] }), deals: deals(), feed, now: FRI_EVENING, mode: 'spends' }).out, [], 'odd notes are skipped');
  const off = plan({ push: spendPush({ a: [ev('e1', 1)] }, { prefs: { b: { spends: false } } }), deals: deals(), feed, now: FRI_EVENING, mode: 'spends' }).out;
  assert.deepStrictEqual(off.map((x) => [x.to, x.quiet]), [[[], true]], 'Jules turned spends off: marked as done, not sent');
});

await t("the setup's test pop-up goes to the person's own phones, while it's fresh", () => {
  const test = ev('t1', 1, { self: true, t: '🔔 Instant pop-ups are on', b: 'When Jules adds a spend, it pops up here within a minute.' });
  const p = plan({ push: spendPush({ a: [test] }), deals: deals(), feed, now: FRI_EVENING, mode: 'spends' });
  assert.deepStrictEqual(p.out.map((x) => [x.to, x.title, x.test]), [[['p1'], '🔔 Instant pop-ups are on', true]]);
  assert.deepStrictEqual(plan({ push: spendPush({ a: [Object.assign({}, test, { at: T0 - 16 * 60e3 })] }), deals: deals(), feed, now: FRI_EVENING, mode: 'spends' }).out, [], 'a test that never went out is dropped after 15 minutes');
});

await t('sending spends: what gets written back, and the public log', async () => {
  const calls = [], pp = spendPush({ a: [ev('e1', 3), ev('e2', 2)], b: [ev('e9', 1, { n: 'Jules' })] }, { prefs: { a: { spends: false } } });
  const r = await run({ push: pp, deals: deals(), feed, now: FRI_EVENING, mode: 'spends', send: async (s, payload) => { calls.push([s.id, payload.title, payload.url]); return { ok: true }; } });
  assert.deepStrictEqual(calls, [['p2', '💸 Robin added 2 spends, $84.20', './']], "Robin's two spends go to Jules, as the title; Robin turned spends off");
  assert.deepStrictEqual(Object.keys(r.write.sent).sort(), ['ev:2026-11-13:e1', 'ev:2026-11-13:e2', 'ev:2026-11-13:e9'], 'all three marked done');
  assert.strictEqual(runSummary(r), 'Sent 1 pop-up (new spends).');
  assert.ok(!/Robin|Woolworths|42/.test(runSummary(r)), 'the public log never says what was spent');
  const u = toUpdate(r.write);
  assert.ok(u.mask.indexOf('sent.`ev:2026-11-13:e1`') >= 0 && u.mask.every((m) => /^(last|subs|sent)\b/.test(m)), 'the bot only writes what the rules let it');
  const failed = await run({ push: spendPush({ a: [ev('e1', 3)] }), deals: deals(), feed, now: FRI_EVENING, mode: 'spends', send: async () => ({ ok: false, status: 500 }) });
  assert.deepStrictEqual(failed.write.sent, {}, 'not marked when it could not be sent, so the next run tries again');
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
  assert.deepStrictEqual(Object.keys(after.sent).sort(), ['sale:s1|2026-11-14:eve', 'sp:2026-11-11', 'top:2026-11-11'], 'old markers cleared, new ones noted');
  assert.deepStrictEqual(after.sent['sp:2026-11-11'], ['Sanitarium Weet-Bix 575g', '20% off Everything In-Store']);
  assert.deepStrictEqual(after.vapid, { pub: 'KEY', d: 'secret' });
  assert.deepStrictEqual(after.prefs, { b: { specials: false } });
  assert.deepStrictEqual(after.last, { at: FRI_EVENING.toISOString(), sent: 3, failed: 1 });
  assert.strictEqual(runSummary(r), "Sent 3 pop-ups (a welcome, a sale day reminder, the week's top specials), 1 couldn't be sent.");
  assert.ok(!/Lucky|Weet/.test(runSummary(r)), 'the public log never says what the pop-ups said');
  const again = await job({ email: BOT, password: 'long-pass', config, feed, now: FRI_EVENING, fetch: fb.fetch, send });
  assert.strictEqual(again.ok, 0, 'nothing is sent twice');
});

await t('a spends run end to end reads only the phones document', async () => {
  const docs = { 'hh/push': spendPush({ a: [ev('e1', 1)] }), 'hh/deals': deals() }, fb = fakeFirebase(docs);
  const seen = [], fetch = (url, init) => { seen.push(url.split('/documents/')[1] || url.split('?')[0]); return fb.fetch(url, init); };
  const r = await job({ email: BOT, password: 'long-pass', config, feed: {}, now: FRI_EVENING, mode: 'spends', fetch, send: async () => ({ ok: true }) });
  assert.ok(seen.indexOf('hh/deals') < 0 && seen.indexOf('hh/push') >= 0, 'no need for the sale days or watch list');
  assert.strictEqual(r.ok, 1);
  assert.ok(docs['hh/push'].sent['ev:2026-11-13:e1'] && docs['hh/push'].events.a.length === 1, 'the bot notes it sent the spend, and leaves the notes to the phones');
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
