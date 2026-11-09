/* The deals job, run against saved copies of each source. node test/deals_job.test.mjs */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, parseRss, parseReport, splitTitle, hfItems, FEEDS, HF_LISTS, sydneyDay, specialsWeek } from '../src/github/deals.mjs';

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
    'https://www.harrisfarm.com.au/collections/specials/products.json?limit=250': { status: 404, text: 'Not found' },
    'https://www.harrisfarm.com.au/collections/all-specials/products.json?limit=250': { status: 200, text: read('hf-products.json') }
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
  assert.deepStrictEqual(list.map((x) => [x.n, x.now, x.was, x.off]), [['Imperfect Avocados 600g', 299, 450, 34], ['Harris Farm Pure Australian Honey 1kg', 899, 1299, 31], ['Sirena Tuna 95g', 199, 269, 26]]);
  assert.strictEqual(list[0].link, 'https://www.harrisfarm.com.au/products/imperfect-avocados');
  assert.deepStrictEqual(hfItems([{ title: 'x', handle: 'x', variants: [{ price: 'free', compare_at_price: '2' }] }, null]), []);
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
  assert.deepStrictEqual([first.sources.harris.handle, first.sources.harris.n, first.sources.harris.from, first.sources.harris.to], ['all-specials', 3, '2026-11-04', '2026-11-10']);
  assert.strictEqual(first.specials.length, 8);
  assert.ok(JSON.stringify(first).indexOf('<script>') < 0);
  assert.ok(s.calls.indexOf('https://www.harrisfarm.com.au/collections/' + HF_LISTS[0] + '/products.json?limit=250') >= 0);
});

await t('the next run reuses the report and the Harris Farm list that worked', async () => {
  const s = site({ 'https://www.ozbargain.com.au/node/980001': { status: 403, text: 'blocked' } });
  const next = await build({ prev: first, now: new Date('2026-11-09T07:00:00Z'), fetchText: s.fetchText, wait: 0 });
  assert.strictEqual(s.calls.indexOf('https://www.ozbargain.com.au/node/980001'), -1, 'same report, not fetched again');
  assert.strictEqual(next.sources.report.n, 5);
  assert.strictEqual(s.calls.filter((u) => /harrisfarm\.com\.au\/collections/.test(u))[0], 'https://www.harrisfarm.com.au/collections/all-specials/products.json?limit=250');
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
});

console.log(passed + ' groups passed');
