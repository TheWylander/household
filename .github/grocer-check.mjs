// One-off: what product photo links Harris Farm and Umall's public store data gives. Prints a few as notes.
const lists = [
  ['Harris Farm', 'https://www.harrisfarm.com.au/collections/online-specials/products.json?limit=4'],
  ['Umall', 'https://www.umall.com.au/collections/half-price/products.json?limit=4']
];
for (const [shop, url] of lists) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (household deals check)', accept: 'application/json' } });
    const j = await r.json();
    const ps = j.products || [];
    const withImg = ps.filter((p) => p.images && p.images.length).length;
    console.log(`::notice::${shop}: HTTP ${r.status}, ${ps.length} products, ${withImg} with images`);
    ps.slice(0, 3).forEach((p) => {
      const im = (p.images || [])[0] || {}, vf = ((p.variants || [])[0] || {}).featured_image;
      console.log(`::notice::${shop} | ${String(p.title).slice(0, 40)} | img=${im.src} | ${im.width}x${im.height} | variantImg=${vf ? vf.src : 'none'}`);
    });
  } catch (e) {
    console.log(`::notice::${shop}: failed ${e.message}`);
  }
}
