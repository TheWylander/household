/* Two of Us: this week's Coles fresh food and Liquorland specials, read in our own browser.
   Coles turns automated readers away, so this runs on a coles.com.au page open in the browser on our laptop
   (the weekly scheduled run pastes it into that page). It reads the same pages anyone sees there, one after another
   with a pause, the way paging through the specials would, and stops if Coles shows anything but its normal page
   (a check page is never got around). Then it opens Two of Us with the specials in the link, after the #, which never
   leaves the browser; the app checks them and saves them for both phones.
   Fresh food is Fruit & Vegetables and Meat & Seafood; Liquorland is everything it has on special at Coles. */
(async () => {
  const APP = 'https://thewylander.github.io/household/';
  const SECTIONS = [['fruit-vegetables', 'Coles', 'Fruit & Veg', 'Fruit & Vegetables'], ['meat-seafood', 'Coles', 'Meat & Seafood', 'Meat & Seafood'],
    ['liquorland', 'Liquorland', 'Liquor', 'Liquorland']];
  const MAX_PAGES = 30, PAUSE_MS = 900;
  if (!/(^|\.)coles\.com\.au$/.test(location.hostname)) return { ok: false, error: 'Open a coles.com.au page first.' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cents = (v) => Math.round((Number(v) || 0) * 100);
  const nextData = (html) => {
    const m = /<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    try { return m ? JSON.parse(m[1]) : null; } catch (e) { return null; }
  };
  const where = (document.querySelector('header') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 400);
  const items = [], seen = new Set(), counts = {};
  for (const [slug, shop, cat, heirName] of SECTIONS) {
    let page = 1, pages = 1, n = 0;
    while (page <= pages && page <= MAX_PAGES) {
      const res = await fetch('/on-special/' + slug + (page > 1 ? '?page=' + page : ''), { credentials: 'include' });
      const html = res.ok ? await res.text() : '', d = nextData(html);
      const sr = d && d.props && d.props.pageProps && d.props.pageProps.searchResults;
      if (!sr) return { ok: false, error: 'Coles didn\'t show its normal ' + slug + ' page (page ' + page + ', status ' + res.status + '), so nothing was read. Nothing was got around.' };
      pages = Math.max(1, Math.ceil((sr.noOfResults || 0) / (sr.pageSize || 48)));
      const links = {};
      html.replace(/href="(\/product\/[a-z0-9.\-]+-(\d+))"/g, (m, p, id) => { links[id] = p; return m; });
      (sr.results || []).forEach((x) => {
        if (!x || x._type !== 'PRODUCT' || !x.pricing || !(x.pricing.now > 0) || seen.has(x.id)) return;
        const heirs = Array.isArray(x.onlineHeirs) ? x.onlineHeirs : [];
        const heir = heirs.filter((h) => h && (h.subCategory === heirName || (slug === 'liquorland' && h.subCategory === 'Drinks')))[0];
        if (x.adId && !heir) return; /* an ad for something from another aisle */
        seen.add(x.id);
        const p = x.pricing, u = p.unit || {}, brand = String(x.brand || '').trim(), name = String(x.name || '').trim(), size = String(x.size || '').trim();
        /* Fruit and veg sold by weight: the price per kilo, as on the shelf ticket. */
        const kgM = /\$([\d.]+)\s*\/\s*1\s*kg/i.exec(p.comparable || ''), kg = u.isWeighted && kgM ? parseFloat(kgM[1]) : 0;
        const now = kg ? cents(kg) : cents(p.now), was = p.was > p.now ? (kg ? Math.round(cents(p.was) * kg / p.now) : cents(p.was)) : 0;
        let n2 = (brand && name.toLowerCase().indexOf(brand.toLowerCase()) !== 0 ? brand + ' ' : '') + name;
        if (kg) n2 += ' per kg';
        else if (size && !/^1 each$/i.test(size) && n2.toLowerCase().indexOf(size.toLowerCase()) < 0) n2 += ' ' + size;
        const c = slug === 'liquorland' && heir && heir.subCategory === 'Drinks' ? 'Drinks' : cat;
        items.push([shop, n2.replace(/\s+/g, ' ').slice(0, 120), now, was, String(p.offerDescription || '').replace(/\s+/g, ' ').slice(0, 40), c,
          String((heir || heirs[0] || {}).category || '').slice(0, 30), links[x.id] || '']);
        n++;
      });
      page++;
      /* A hidden browser pane holds timers back for up to a minute, so there the page loads themselves do the spacing. */
      if (page <= pages && page <= MAX_PAGES && !document.hidden) await sleep(PAUSE_MS);
    }
    counts[slug] = n;
  }
  if (!items.length) return { ok: false, error: 'No specials came back from Coles.', counts };
  /* Packed small for the link: gzip, then base64 that's safe in a URL. */
  const zipped = new Uint8Array(await new Response(new Blob([JSON.stringify({ v: 1, at: new Date().toISOString(), items })]).stream()
    .pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let bin = '';
  for (let i = 0; i < zipped.length; i += 0x8000) bin += String.fromCharCode.apply(null, zipped.subarray(i, i + 0x8000));
  const packed = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  location.href = APP + '#web=' + packed; /* the summary still comes back: this page stays until the app's starts loading */
  return { ok: true, counts, total: items.length, where, size: packed.length, sample: items.slice(0, 3) };
})()
