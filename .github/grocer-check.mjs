/* One-off: for each store and collection, fetch the public Shopify product list and print how many items are on sale. */
const UA = 'household-deals-check/1.0 (+https://github.com/' + process.env.GITHUB_REPOSITORY + ')';
const tries = [
  ['umall', 'https://www.umall.com.au', ['half-price', 'weekly-special', 'on-sale']],
  ['asiangroceronline', 'https://www.asiangroceronline.com.au', ['half-price', 'weekly-special', 'on-sale']]
];
const out = [];
for (const [name, base, cols] of tries) {
  try {
    const r = await fetch(base + '/robots.txt', { headers: { 'user-agent': UA } });
    const t = await r.text();
    const lines = t.split('\n').filter((l) => /disallow/i.test(l) && /collections|products|json/i.test(l)).slice(0, 8).map((l) => l.trim());
    out.push(name + ' robots ' + r.status + ': ' + (lines.join(' ; ') || 'nothing about collections or products'));
  } catch (e) { out.push(name + ' robots: ' + e.message); }
  for (const c of cols) {
    try {
      const r = await fetch(base + '/collections/' + c + '/products.json?limit=250', { headers: { 'user-agent': UA, accept: 'application/json' } });
      const ct = r.headers.get('content-type') || '';
      let msg = r.status + ' ' + ct.split(';')[0];
      if (/json/.test(ct)) {
        const j = await r.json(), ps = j.products || [];
        const sale = ps.filter((p) => (p.variants || []).some((v) => v.compare_at_price && Number(v.compare_at_price) > Number(v.price)));
        const ex = sale.slice(0, 2).map((p) => p.title + ' $' + p.variants[0].price + ' was $' + p.variants[0].compare_at_price + ' [' + (p.product_type || '') + '] tags:' + (p.tags || []).slice(0, 4).join('/')).join(' || ');
        msg += ': ' + ps.length + ' products, ' + sale.length + ' with a was price. e.g. ' + ex;
      }
      out.push(name + ' ' + c + ': ' + msg);
    } catch (e) { out.push(name + ' ' + c + ': ' + e.message); }
  }
}
out.forEach((l) => console.log('::notice::' + l.replace(/\s+/g, ' ').slice(0, 600)));
