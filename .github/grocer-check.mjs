// One-off: what do United Meat Co and Meat Emporium publish? Prints a few notes.
const UA = 'Mozilla/5.0 (household deals check)';
const note = (s) => console.log('::notice::' + s.replace(/[\r\n]+/g, ' ').slice(0, 900));
async function get(url, accept) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: accept || '*/*' }, redirect: 'follow' });
  const t = await r.text();
  return { r, t };
}
for (const host of ['unitedmeatco.com.au', 'www.meatemporium.com.au']) {
  try {
    const { r, t } = await get('https://' + host + '/', 'text/html');
    const shop = /cdn\.shopify\.com|Shopify\.theme|myshopify/i.test(t);
    const other = (/wix\.com|squarespace|woocommerce|wp-content|bigcommerce|webflow/i.exec(t) || [])[0] || '';
    const guard = /incapsula|_Incapsula_|imperva|akamai|access denied|just a moment|cf-chl|captcha|reese84/i.exec(t);
    note(`${host} home: HTTP ${r.status}, ${t.length} bytes, shopify ${shop}, other ${other || '-'}${guard ? ', bot check: ' + guard[0] : ''}, title "${((/<title>([^<]{0,80})/.exec(t) || [])[1] || '').trim()}"`);
  } catch (e) { note(`${host} home: failed ${e.message}`); }
  let all = [];
  for (let page = 1; page <= 8; page++) {
    try {
      const { r, t } = await get('https://' + host + '/products.json?limit=250&page=' + page, 'application/json');
      if (page === 1) note(`${host} products.json: HTTP ${r.status}, ${r.headers.get('content-type')}, ${t.length} bytes, starts "${t.slice(0, 60).replace(/\s+/g, ' ')}"`);
      let j; try { j = JSON.parse(t); } catch { break; }
      const ps = j.products || [];
      if (!ps.length) break;
      all = all.concat(ps);
      if (ps.length < 250) break;
    } catch (e) { note(`${host} products.json page ${page}: failed ${e.message}`); break; }
  }
  if (all.length) {
    const sale = all.filter((p) => (p.variants || []).some((v) => Number(v.compare_at_price) > Number(v.price)));
    const withImg = all.filter((p) => (p.images || []).length).length;
    const avail = all.filter((p) => (p.variants || []).some((v) => v.available)).length;
    const types = {}; all.forEach((p) => { types[p.product_type || '-'] = (types[p.product_type || '-'] || 0) + 1; });
    note(`${host}: ${all.length} products, ${avail} available, ${withImg} with photos, ${sale.length} with a was-price above the price`);
    note(`${host} types: ` + Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 12).map((e) => e[0] + ' ' + e[1]).join(', '));
    for (const p of sale.slice(0, 6)) {
      const v = p.variants.find((x) => Number(x.compare_at_price) > Number(x.price));
      note(`${host} sale: ${p.title} | now ${v.price} was ${v.compare_at_price} | ${p.product_type} | avail ${v.available} | img ${(p.images || []).length}`);
    }
    for (const p of all.filter((x) => /special|sale|deal|wagyu/i.test(x.title + ' ' + (x.tags || []).join(' '))).slice(0, 4)) note(`${host} sample: ${p.title} | ${p.variants[0].price} | tags ${(p.tags || []).slice(0, 5).join('/')}`);
  }
  try {
    const { r, t } = await get('https://' + host + '/collections.json?limit=250', 'application/json');
    let j; try { j = JSON.parse(t); } catch { j = null; }
    if (j) note(`${host} collections (${(j.collections || []).length}): ` + j.collections.map((c) => c.handle + ' ' + c.products_count).join(', '));
    else note(`${host} collections.json: HTTP ${r.status}, not JSON`);
  } catch (e) { note(`${host} collections: failed ${e.message}`); }
}
