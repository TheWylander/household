/* The deals job, run against saved copies of each source. node test/deals_job.test.mjs */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, parseRss, parseReport, splitTitle, hfItems, hfCat, FEEDS, HF_LISTS, UM_LISTS, umWindow, umItems, umCat, sydneyDay, specialsWeek, fingerprint } from '../src/github/deals.mjs';

const dir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const read = (f) => readFileSync(dir + f, 'utf8');
let passed = 0;
async function t(name, fn) {
  try { await fn(); passed++; } catch (e) { console.error('FAIL', name, '\n ', e.message); process.exitCode = 1; }
}
const NOW = new Date('2026-11-08T23:00:00Z'); // Mon 9 Nov 2026, 10am in Sydney
function site(over) {
  const calls = [];
  const pages = Object.assign({
    [FEEDS[0]]: { status: 200, text: read('ozb-groceries.xml') },
    [FEEDS[1]]: { status: 200, text: read('ozb-coles.xml') },
    [FEEDS[2]]: { status: 403, text: '<html>Just a moment...</html>' },
    [FEEDS[3]]: { status: 200, text: read('ozb-harris.xml') },
    'https://www.ozbargain.com.au/node/980001': { status: 200, text: read('ozb-report.html') },
    ['https://www.harrisfarm.com.au/collections/' + HF_LISTS[0] + '/products.json?limit=250']: { status: 404, text: 'Not found' },
    ['https://www.harrisfarm.com.au/collections/' + HF_LISTS[1] + '/products.json?limit=250']: { status: 200, text: read('hf-products.json') }
  }, over || {});
  const fetchText = async (u) => { calls.push(u); return pages[u] || { status: 404, text: '' }; };
  return { fetchText, calls };
}

await t('titles: states, what and store', () => {
  assert.deepStrictEqual(splitTitle('[NSW, ACT] Iceberg Lettuce $1.50 @ Harris Farm'), { states: ['NSW', 'ACT'], what: 'Iceberg Lettuce $1.50', store: 'Harris Farm' });
  assert.deepStrictEqual(splitTitle('[Pre Order] Thing @ Shop'), { states: [], what: '[Pre Order] Thing', store: 'Shop' });
  assert.deepStrictEqual(splitTitle('No store here'), { states: [], what: 'No store here', store: '' });
  assert.strictEqual(sydneyDay(NOW), '2026-11-09');
  assert.deepStrictEqual(specialsWeek('2026-11-09'), { from: '2026-11-04', to: '2026-11-10' });
});

await t('the feed parses', () => {
  const items = parseRss(read('ozb-groceries.xml'));
  assert.strictEqual(items.length, 7);
  assert.strictEqual(items[0].title, "Tony's Chocolonely Chocolate Varieties 180g $7.95 (Was $9.95) @ Coles");
  assert.strictEqual(items[0].meta.expiry, '2026-11-11T00:00:00+11:00');
  assert.strictEqual(items[0].meta['votes-pos'], '45');
  assert.strictEqual(items[2].flag, 'expired');
  assert.ok(items[5].title.startsWith('½ Price: Sanitarium'), items[5].title);
});

await t('the half-price report parses', () => {
  const r = parseReport(read('ozb-report.html'));
  assert.strictEqual(r.date, '2026-11-04');
  assert.strictEqual(r.from, '2026-11-04');
  assert.strictEqual(r.to, '2026-11-10');
  assert.deepStrictEqual(r.items.map((x) => x.n), ['Curash Fragrance Free Sensitive Skin Baby Wipes 80 Pack', 'BabyLove Bulk Nappy Pants Pk 22-34', 'Sanitarium Weet-Bix 575g', 'Vittoria Espresso Coffee Beans 1kg', "Arnott's Tim Tam Original 200g"]);
  assert.deepStrictEqual(r.items.map((x) => x.cat), ['Baby', 'Baby', 'Pantry', 'Pantry', 'Snacks & Confectionery']);
  assert.deepStrictEqual(r.items[0], { s: 'Coles', n: 'Curash Fragrance Free Sensitive Skin Baby Wipes 80 Pack', was: 550, now: 275, off: 50, cat: 'Baby', last: '11 weeks ago @ WW', link: 'https://www.coles.com.au/product/curash-wipes-123', src: 'hp' });
  assert.strictEqual(r.items[1].link, '', 'only https links to the stores are kept');
  assert.strictEqual(r.items[3].last, 'Never');
  const y = parseReport('<p>Catalogue Half-Price Report - 2026-12-30</p><p>Valid from Wed 30 December to Tue 5 January.</p>');
  assert.deepStrictEqual([y.from, y.to], ['2026-12-30', '2027-01-05'], 'a week over new year');
});

await t('Harris Farm specials are the discounted products', () => {
  const list = hfItems(JSON.parse(read('hf-products.json')).products);
  assert.deepStrictEqual(list.map((x) => [x.n, x.now, x.was, x.off]), [['Imperfect Avocados 600g', 299, 0, 0], ['Harris Farm Pure Australian Honey 1kg', 899, 0, 0], ['Sirena Tuna 95g', 199, 0, 0]], 'the special price only: their was price is often per kilo');
  assert.deepStrictEqual(['S11S-Veg', 'Frdg1-Cheese', 'Fridge-Seafood', 'Butcher', 'S07H-Fruit'].map(hfCat), ['Veg', 'Cheese', 'Seafood', 'Butcher', 'Fruit']);
  assert.strictEqual(list[0].link, 'https://www.harrisfarm.com.au/products/imperfect-avocados');
  assert.deepStrictEqual(list.map((x) => x.img), ['https://cdn.shopify.com/s/files/1/0206/9470/products/1382-done.jpg?v=1611533677', '', 'https://cdn.shopify.com/s/files/1/0206/9470/files/1331.webp?v=1694663013'], "each product's photo from Shopify's image CDN; anything else is left out");
  assert.deepStrictEqual(hfItems([{ title: 'x', handle: 'x', variants: [{ price: 'free', compare_at_price: '2' }] }, null]), []);
});

const UM_HALF = 'https://www.umall.com.au/collections/half-price/products.json?limit=250';
const UM_WEEK = 'https://www.umall.com.au/collections/weekly-special/products.json?limit=250';
await t("Umall: half-price picks run Saturday to Tuesday, weekly specials Wednesday to Friday", () => {
  const [half, week] = UM_LISTS;
  assert.deepStrictEqual(umWindow('2026-11-09', half), { from: '2026-11-07', to: '2026-11-10' }, 'Monday: the weekend picks still run');
  assert.deepStrictEqual(umWindow('2026-11-09', week), { from: '2026-11-04', to: '2026-11-06' }, "Monday: last week's weekly specials have ended");
  assert.deepStrictEqual(umWindow('2026-11-11', half), { from: '2026-11-07', to: '2026-11-10' }, 'Wednesday: the weekend picks have ended');
  assert.deepStrictEqual(umWindow('2026-11-11', week), { from: '2026-11-11', to: '2026-11-13' });
  assert.deepStrictEqual(umWindow('2026-11-14', half), { from: '2026-11-14', to: '2026-11-17' }, 'Saturday: new picks');
});

await t('Umall specials: the discounted products, with the shop, aisle and end day', () => {
  const list = umItems(JSON.parse(read('um-products.json')).products, '2026-11-10');
  assert.deepStrictEqual(list.map((x) => [x.n, x.now, x.was, x.off, x.cat]), [
    ['Frozen Pork & Cabbage Dumplings - 1kg', 999, 1869, 47, 'Freezer'],
    ['Chinese Broccoli (Gai Lan), 1 Bundle', 219, 429, 49, 'Fruit & Veg'],
    ['Samyang Carbo Buldak Ramen 105g', 339, 439, 23, 'Pantry'],
    ['Ediya Triple Sweet Americano 500ml', 179, 209, 14, 'Drinks'],
    ['Bestore Braised Duck Neck 100g', 359, 439, 18, 'Meat & Seafood']
  ], 'no full-price sauce, and no markup in names');
  assert.deepStrictEqual([list[0].s, list[0].src, list[0].to, list[0].link], ['Umall', 'um', '2026-11-10', 'https://www.umall.com.au/products/frozen-pork-cabbage-dumplings-1kg']);
  assert.deepStrictEqual(list.map((x) => x.img ? x.img.split('/').pop() : ''), ['erp_03.source_80e4ed67-c9df-4faf-a805-83025c3347c4.png?v=1785875988', '', '', '', 'duck.jpg?v=1'], 'photos only from the image CDN');
  assert.strictEqual(umCat({ product_type: 'Durians', tags: ['frozen', 'fruit'], title: 'Frozen Durian 400g' }), 'Freezer', 'frozen comes first');
  assert.strictEqual(umCat({ product_type: 'Toothpaste', tags: [], title: 'Darlie Toothpaste' }), 'Health & Beauty');
  assert.deepStrictEqual(umItems([{ title: 'x', handle: 'x', variants: [{ price: '2', compare_at_price: '1' }] }, null], '2026-11-10'), []);
});

let first;
await t('a full run', async () => {
  const s = site();
  first = await build({ prev: {}, now: NOW, fetchText: s.fetchText, wait: 0 });
  assert.strictEqual(first.today, '2026-11-09');
  assert.deepStrictEqual(first.deals.map((d) => d.id).sort(), ['979001', '979002', '979005', '979009', '980001'], 'no expired, other-state, targeted, mobile or duplicate deals');
  const tony = first.deals.find((d) => d.id === '979001');
  assert.deepStrictEqual([tony.s, tony.from, tony.to, tony.votes], ['Coles', '2026-11-04', '2026-11-10', 44], 'a deal ending at midnight ends the day before');
  const lettuce = first.deals.find((d) => d.id === '979005');
  assert.deepStrictEqual([lettuce.s, lettuce.from, lettuce.to, lettuce.st], ['Harris Farm', '2026-11-07', '2026-11-09', ['NSW', 'ACT']]);
  assert.strictEqual(first.deals.find((d) => d.id === '980001').hp, true);
  assert.strictEqual(first.sources.ozb.feeds, 3);
  assert.deepStrictEqual([first.sources.report.id, first.sources.report.n, first.sources.report.coles, first.sources.report.woolies, first.sources.report.to], ['980001', 5, 2, 3, '2026-11-10']);
  assert.deepStrictEqual([first.sources.harris.handle, first.sources.harris.n, first.sources.harris.from, first.sources.harris.to], [HF_LISTS[1], 3, '2026-11-04', '2026-11-10']);
  assert.strictEqual(first.specials.length, 8);
  assert.ok(JSON.stringify(first).indexOf('<script>') < 0);
  assert.ok(s.calls.indexOf('https://www.harrisfarm.com.au/collections/' + HF_LISTS[0] + '/products.json?limit=250') >= 0);
});

await t("a run with Umall: Monday reads the weekend picks only, and they're kept while they run if Umall is down", async () => {
  const s = site({ [UM_HALF]: { status: 200, text: read('um-products.json') } });
  const run = await build({ prev: {}, now: NOW, fetchText: s.fetchText, wait: 0 });
  assert.strictEqual(s.calls.indexOf(UM_WEEK), -1, "last week's weekly specials are over, so not asked for");
  assert.deepStrictEqual([run.sources.umall.ok, run.sources.umall.n, run.sources.umall.from, run.sources.umall.to, run.sources.umall.lists], [true, 5, '2026-11-07', '2026-11-10', 'half-price']);
  assert.strictEqual(run.specials.filter((x) => x.src === 'um').length, 5);
  assert.notStrictEqual(fingerprint(run), fingerprint(first), 'new Umall specials are news');
  const down = await build({ prev: run, now: new Date('2026-11-09T07:00:00Z'), fetchText: async () => ({ status: 0, text: '' }), wait: 0 });
  assert.deepStrictEqual([down.sources.umall.stale, down.specials.filter((x) => x.src === 'um').length], [true, 5]);
  const wed = await build({ prev: run, now: new Date('2026-11-10T21:00:00Z'), fetchText: site({ [UM_WEEK]: { status: 200, text: '{"products":[]}' } }).fetchText, wait: 0 });
  assert.deepStrictEqual([wed.sources.umall.ok, wed.sources.umall.lists, wed.specials.filter((x) => x.src === 'um').length], [true, 'weekly-special', 0], "Wednesday: the weekend picks are gone and this week's list is read");
  assert.strictEqual(first.sources.umall.ok, false, 'Umall not answering on the first run is noted');
});

await t('the next run reuses the report and the Harris Farm list that worked', async () => {
  const s = site({ 'https://www.ozbargain.com.au/node/980001': { status: 403, text: 'blocked' } });
  const next = await build({ prev: first, now: new Date('2026-11-09T07:00:00Z'), fetchText: s.fetchText, wait: 0 });
  assert.strictEqual(s.calls.indexOf('https://www.ozbargain.com.au/node/980001'), -1, 'same report, not fetched again');
  assert.strictEqual(next.sources.report.n, 5);
  assert.strictEqual(s.calls.filter((u) => /harrisfarm\.com\.au\/collections/.test(u))[0], 'https://www.harrisfarm.com.au/collections/' + HF_LISTS[1] + '/products.json?limit=250');
});

await t("next week's half-price list, posted early, waits until it starts", async () => {
  const item = '<item>\n<title>&#189; Price: Arnott\'s Tim Tam 175g $2.75 @ Coles + 180 More @ Coles and Woolworths</title>\n<link>https://www.ozbargain.com.au/node/980500</link>\n' +
    '<description><![CDATA[<p>Catalogue Half-Price Report - 2026-11-11 Valid from Wed 11 November to Tue 17 November.</p>]]></description>\n' +
    '<category domain="https://www.ozbargain.com.au/cat/groceries">Groceries</category>\n<pubDate>Sun, 08 Nov 2026 20:00:00 +1100</pubDate>\n</item>\n';
  const feed = read('ozb-groceries.xml').replace('<item>', item + '<item>');
  const page = read('ozb-report.html').replace(/2026-11-04/g, '2026-11-11').replace(/4 November/g, '11 November').replace(/10 November/g, '17 November');
  const over = { [FEEDS[0]]: { status: 200, text: feed }, 'https://www.ozbargain.com.au/node/980500': { status: 200, text: page } };
  const logs = [], mon = await build({ prev: first, now: NOW, fetchText: site(over).fetchText, wait: 0, log: (m) => logs.push(m) });
  assert.deepStrictEqual([mon.sources.report.id, mon.sources.report.from, mon.sources.report.to, mon.specials.filter((x) => x.src === 'hp').length], ['980001', '2026-11-04', '2026-11-10', 5], "Monday: this week's list stays");
  assert.ok(logs.some((m) => /Next week's half-price list is out \(from 2026-11-11\)/.test(m)));
  const wed = await build({ prev: mon, now: new Date('2026-11-10T20:07:00Z'), fetchText: site(over).fetchText, wait: 0 });
  assert.deepStrictEqual([wed.sources.report.id, wed.sources.report.from, wed.sources.report.to], ['980500', '2026-11-11', '2026-11-17'], 'Wednesday morning: the new list takes over');
  const fresh = await build({ prev: {}, now: NOW, fetchText: site(over).fetchText, wait: 0 });
  assert.strictEqual(fresh.sources.report.id, '980500', 'with nothing running to keep, the new list is shown early rather than nothing');
});
await t("Liquorland's deals come from OzBargain's Liquorland feed", async () => {
  assert.strictEqual(FEEDS[4], 'https://www.ozbargain.com.au/deals/liquorland.com.au/feed');
  const run = await build({ prev: {}, now: NOW, fetchText: site({ [FEEDS[4]]: { status: 200, text: read('ozb-liquorland.xml') } }).fetchText, wait: 0 });
  const lq = run.deals.filter((d) => d.id === '981500' || d.id === '981501');
  assert.deepStrictEqual(lq.map((d) => [d.id, d.to, d.votes]).sort(), [['981500', '2026-11-15', 63], ['981501', '2026-11-10', 22]]);
  assert.ok(lq.every((d) => /Liquorland/.test(d.s)), 'each says it is at Liquorland: ' + lq.map((d) => d.s).join(', '));
  assert.strictEqual(run.sources.ozb.feeds, 4, 'four feeds read: the fixtures leave Woolworths blocked');
});

await t('when everything is down, what still applies is kept', async () => {
  const down = async () => ({ status: 0, text: '' });
  const kept = await build({ prev: first, now: new Date('2026-11-09T07:00:00Z'), fetchText: down, wait: 0 });
  assert.strictEqual(kept.sources.ozb.ok, false);
  assert.deepStrictEqual(kept.deals.map((d) => d.id).sort(), ['979001', '979002', '979005', '979009', '980001'], 'deals still running are kept');
  assert.strictEqual(kept.sources.report.stale, true);
  assert.strictEqual(kept.sources.harris.stale, true);
  assert.strictEqual(kept.specials.length, 8);
  const later = await build({ prev: first, now: new Date('2026-11-11T07:00:00Z'), fetchText: down, wait: 0 });
  assert.deepStrictEqual(later.deals.map((d) => d.id), ['979009'], 'only what has not ended');
  assert.strictEqual(later.specials.length, 0, "last week's specials are dropped");
  assert.strictEqual(later.sources.report.ok, false);
  assert.deepStrictEqual(later.sources.harris.tried, [HF_LISTS[1], HF_LISTS[0], HF_LISTS[2]].map((h) => [h, 0]), 'what was tried is kept, to see why, starting with the list that worked last time');
});

await t('a run with nothing new is spotted, so it is not published', async () => {
  const again = await build({ prev: first, now: new Date('2026-11-09T01:00:00Z'), fetchText: site().fetchText, wait: 0 });
  again.deals.forEach((d) => { d.votes += 7; });
  again.sources.ozb.at = 'later';
  assert.strictEqual(fingerprint(again), fingerprint(first), 'new times and votes alone are not news');
  const cheaper = JSON.parse(JSON.stringify(again));
  cheaper.specials[0].now -= 10;
  assert.notStrictEqual(fingerprint(cheaper), fingerprint(first), 'a price change is');
  const fewer = JSON.parse(JSON.stringify(again));
  fewer.deals.pop();
  assert.notStrictEqual(fingerprint(fewer), fingerprint(first), 'a deal ending is');
  assert.notStrictEqual(fingerprint(first), fingerprint({}), 'the first run always publishes');
});

console.log(passed + ' groups passed');
