/* Two of Us: this week's Woolies fresh food specials, read in our own browser.
   This runs on a woolworths.com.au page open in the browser on our laptop (the weekly scheduled run pastes it into
   that page). Woolworths' specials pages fill in their products after they open, by asking the site for each page of
   the list; this asks for the same pages the same way, one after another with a pause, the way paging through the
   specials would, and stops if Woolworths answers with anything but its normal list (a check page is never got around).
   Then it opens Two of Us with the specials in the link, after the #, which never leaves the browser; the app checks
   them and saves them for both phones, leaving Coles' as they are.
   Fresh food is Fruit & Veg and Poultry, Meat & Seafood. Anything sold by weight goes in at its price per kilo. */
(async () => {
  const APP = 'https://thewylander.github.io/household/';
  /* [the list's address, Woolworths' name for it, its id, our aisle] */
  const SECTIONS = [['fruit-veg/fruit-veg-specials', 'Fruit & Veg Specials & Offers', '1-E5BEE36E_SPECIALS', 'Fruit & Veg'],
    ['poultry-meat-seafood/poultry-meat-seafood-specials', 'Poultry, Meat & Seafood Specials & Offers', '1_D5A2236_SPECIALS', 'Meat & Seafood']];
  const PAGE_SIZE = 36, MAX_PAGES = 15, PAUSE_MS = 900;
  if (!/(^|\.)woolworths\.com\.au$/.test(location.hostname)) return { ok: false, error: 'Open a woolworths.com.au page first.' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cents = (v) => Math.round((Number(v) || 0) * 100);
  const money = (v) => '$' + (cents(v) % 100 ? (cents(v) / 100).toFixed(2) : String(cents(v) / 100));
  const firstOf = (json) => { try { const a = JSON.parse(json || '[]'); return Array.isArray(a) && a[0] ? String(a[0]) : ''; } catch (e) { return ''; } };
  const items = [], seen = new Set(), counts = {};
  let store = 0;
  for (const [slug, title, id, cat] of SECTIONS) {
    const url = '/shop/browse/' + slug;
    let page = 1, pages = 1, n = 0;
    while (page <= pages && page <= MAX_PAGES) {
      const body = { categoryId: id, pageNumber: page, pageSize: PAGE_SIZE, sortType: 'TraderRelevance', url, location: url + (page > 1 ? '?pageNumber=' + page : ''),
        formatObject: JSON.stringify({ name: title }), isSpecial: false, isHideUnavailableProducts: false, isBundle: false, isMobile: false,
        isRegisteredRewardCardPromotion: false, isHideEverydayMarketProducts: false, filters: [], categoryVersion: 'v2' };
      const res = await fetch('/apis/ui/browse/category', { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' }, body: JSON.stringify(body) });
      let j = null;
      try { j = /json/i.test(res.headers.get('content-type') || '') ? await res.json() : null; } catch (e) { j = null; }
      if (!res.ok || !j || !Array.isArray(j.Bundles)) return { ok: false, error: 'Woolworths didn\'t send its normal ' + cat + ' list (page ' + page + ', status ' + res.status + '), so nothing was read. Nothing was got around.', counts };
      pages = Math.max(1, Math.ceil((Number(j.TotalRecordCount) || 0) / PAGE_SIZE));
      j.Bundles.forEach((b) => (b && Array.isArray(b.Products) ? b.Products : []).forEach((p) => {
        if (!p || !(p.Price > 0) || !p.Stockcode || seen.has(p.Stockcode)) return;
        const mb = p.CentreTag && p.CentreTag.MultibuyData, multi = !!(mb && mb.Quantity > 1 && mb.Price > 0), cut = p.WasPrice > p.Price;
        if (!cut && !multi) return; /* on the list but not on a deal */
        seen.add(p.Stockcode);
        store = store || Number(p.FulfilmentStoreId) || 0;
        /* Sold by weight, or a roast that varies in size: the price per kilo, as on the shelf ticket. */
        const kg = p.CupMeasure === '1KG' && p.CupPrice > 0 && (p.Unit === 'KG' || (p.MinWeightPrice > 0 && p.MaxWeightPrice > 0)) ? Number(p.CupPrice) : 0;
        const now = kg ? cents(kg) : cents(p.Price), was = cut ? (kg ? Math.round(cents(p.WasPrice) * kg / p.Price) : cents(p.WasPrice)) : 0;
        const size = String(p.PackageSize || '').replace(/\s+/g, ' ').trim();
        let name = String(p.Name || p.DisplayName || '').replace(/\s+/g, ' ').trim();
        if (kg) name += ' per kg';
        else if (size && !/^each$/i.test(size) && name.toLowerCase().indexOf(size.toLowerCase()) < 0) name += ' ' + size;
        const slugName = String(p.UrlFriendlyName || '').toLowerCase();
        items.push(['Woolworths', name.slice(0, 120), now, was > now ? was : 0, multi ? mb.Quantity + ' for ' + money(mb.Price) : '', cat,
          firstOf(p.AdditionalAttributes && p.AdditionalAttributes.piescategorynamesjson).slice(0, 30),
          /^[a-z0-9-]+$/.test(slugName) ? '/shop/productdetails/' + p.Stockcode + '/' + slugName : '']);
        n++;
      }));
      page++;
      /* A hidden browser pane holds timers back for up to a minute, so there the answers themselves do the spacing. */
      if (page <= pages && page <= MAX_PAGES && !document.hidden) await sleep(PAUSE_MS);
    }
    counts[cat] = n;
  }
  if (!items.length) return { ok: false, error: 'No specials came back from Woolworths.', counts };
  /* Packed small for the link: gzip, then base64 that's safe in a URL. */
  const zipped = new Uint8Array(await new Response(new Blob([JSON.stringify({ v: 1, at: new Date().toISOString(), shops: ['Woolworths'], items })]).stream()
    .pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let bin = '';
  for (let i = 0; i < zipped.length; i += 0x8000) bin += String.fromCharCode.apply(null, zipped.subarray(i, i + 0x8000));
  const packed = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  location.href = APP + '#web=' + packed; /* the summary still comes back: this page stays until the app's starts loading */
  return { ok: true, counts, total: items.length, store, size: packed.length, sample: items.slice(0, 3) };
})()
