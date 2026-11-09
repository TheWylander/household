/* Builds deals.json for the household app from public sources. GitHub runs it free every Wednesday, when the
   supermarket specials change, and publishes only when something is new.
     - OzBargain's grocery feeds: deals people post, with when they end.
     - The weekly "Catalogue Half-Price Report" on OzBargain: every Coles and Woolworths half-price item in the NSW catalogue.
     - Harris Farm's online specials: the public product list their Shopify shop serves.
   Nothing about the household is in here. Each phone picks out what matters to it.
   Run: node deals.mjs prev.json out/deals.json   (prev.json is the last deals.json, or {}) */
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.env.GITHUB_REPOSITORY || 'household';
const UA = 'Mozilla/5.0 (compatible; household-deals/1.0; +https://github.com/' + REPO + ')';
const OZB = 'https://www.ozbargain.com.au';
export const FEEDS = [
  OZB + '/cat/groceries/feed',
  OZB + '/deals/coles.com.au/feed',
  OZB + '/deals/woolworths.com.au/feed',
  OZB + '/deals/harrisfarm.com.au/feed'
];
const HF = 'https://www.harrisfarm.com.au';
/* "online-specials" is the site's All Specials list. The others are its biggest specials aisles, in case that one moves. */
export const HF_LISTS = ['online-specials', 'grocery-specials', 'fruit-and-veg-specials'];
/* OzBargain categories worth showing in a grocery app. */
const KEEP_CATS = /\/cat\/(groceries|alcohol|gift-cards)$/;
const STATE = /^(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)$/;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const LINK_OK = /^https:\/\/(www\.)?(ozbargain\.com\.au|coles\.com\.au|woolworths\.com\.au|harrisfarm\.com\.au)\//;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', hellip: '...' };
export function decode(s) {
  return String(s == null ? '' : s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9]+);/gi, (m, k) => (k in ENT ? ENT[k] : m));
}
/* Visible text of a bit of HTML or XML. */
export function text(h) {
  return decode(String(h == null ? '' : h).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
export const cents = (s) => {
  const m = /(\d+(?:\.\d{1,2})?)/.exec(String(s == null ? '' : s).replace(/,/g, ''));
  return m ? Math.round(parseFloat(m[1]) * 100) : 0;
};
export function sydneyDay(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/* Supermarket specials run Wednesday to Tuesday. */
export function specialsWeek(s) {
  const back = (new Date(s + 'T12:00:00Z').getUTCDay() + 4) % 7, from = addDays(s, -back);
  return { from, to: addDays(from, 6) };
}
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const safeLink = (u) => (LINK_OK.test(String(u || '')) ? clip(u, 300) : '');

/* ---------- OzBargain feeds ---------- */
export function parseRss(xml) {
  const items = [], re = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(String(xml)))) {
    const b = m[1];
    const tag = (name) => { const r = new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)<\\/' + name + '>', 'i').exec(b); return r ? r[1] : ''; };
    const meta = {};
    const mm = /<ozb:meta\b([^>]*)>/i.exec(b);
    if (mm) mm[1].replace(/([\w:-]+)="([^"]*)"/g, (_, k, v) => { meta[k] = decode(v); });
    const flag = /<ozb:title-msg\b[^>]*type="([^"]*)"/i.exec(b);
    const cats = [];
    b.replace(/<category\b([^>]*)>([\s\S]*?)<\/category>/gi, (_, a, c) => { const d = /domain="([^"]*)"/.exec(a); cats.push({ name: text(c), domain: d ? d[1] : '' }); });
    items.push({ title: text(tag('title')), link: text(tag('link')), desc: text(tag('description')), pub: text(tag('pubDate')), cats, meta, flag: flag ? flag[1].toLowerCase() : '' });
  }
  return items;
}
/* "[NSW, ACT] Iceberg Lettuce $1.50 @ Harris Farm" -> states, what, store. */
export function splitTitle(t) {
  let title = String(t || '').trim(), states = [];
  const s = /^\[([^\]]+)\]\s*/.exec(title);
  if (s) {
    const parts = s[1].split(/\s*(?:,|\/|&|\band\b)\s*/i).filter(Boolean).map((x) => x.toUpperCase());
    if (parts.length && parts.every((x) => STATE.test(x))) { states = parts; title = title.slice(s[0].length); }
  }
  const at = title.lastIndexOf(' @ ');
  return { states, what: at > 0 ? title.slice(0, at).trim() : title, store: at > 0 ? title.slice(at + 3).trim() : '' };
}
const dayOf = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso || '') ? iso.slice(0, 10) : '');
/* A deal ending at midnight ends the day before. */
const lastDay = (iso) => { const d = dayOf(iso); if (!d) return ''; return /T00:00(:00)?/.test(iso) ? addDays(d, -1) : d; };
const pubDay = (s) => { const d = new Date(s); return isNaN(d) ? '' : sydneyDay(d); };
export const nodeId = (link) => { const m = /\/node\/(\d+)/.exec(String(link || '')); return m ? m[1] : ''; };
export const isReport = (it) => /\+\s*\d+\s+More\s+@\s+Coles\s+(?:and|&)\s+Woolworths/i.test(it.title) || /Half-?Price Report/i.test(it.desc);

export function toDeals(items, today) {
  const seen = {}, out = [];
  items.forEach((it) => {
    const id = nodeId(it.link);
    if (!id || seen[id]) return;
    seen[id] = true;
    if (it.flag === 'expired' || it.flag === 'targeted') return;
    const main = it.cats.find((c) => /\/cat\//.test(c.domain));
    if (main && !KEEP_CATS.test(main.domain)) return;
    const t = splitTitle(it.title);
    if (t.states.length && t.states.indexOf('NSW') < 0) return;
    const to = lastDay(it.meta.expiry), from = dayOf(it.meta.starting) || pubDay(it.pub);
    if (to && to < today) return;
    const votes = (Number(it.meta['votes-pos']) || 0) - (Number(it.meta['votes-neg']) || 0);
    out.push({ id, t: clip(t.what, 160), s: clip(t.store, 40), st: t.states, link: OZB + '/node/' + id, from, to, votes, hp: isReport(it) || undefined });
  });
  return out.sort((a, b) => (a.from < b.from ? 1 : a.from > b.from ? -1 : b.votes - a.votes));
}

/* ---------- the weekly half-price report ---------- */
function monthIdx(name) { const k = String(name || '').toLowerCase().slice(0, 3); return MONTHS.findIndex((m) => m.slice(0, 3) === k); }
export function parseReport(html) {
  const h = String(html || ''), plain = text(h);
  const head = /Half-?Price Report\s*[-–—]\s*(\d{4})-(\d{2})-(\d{2})/i.exec(plain);
  const out = { date: head ? head[1] + '-' + head[2] + '-' + head[3] : '', from: '', to: '', items: [] };
  const valid = /Valid from\s+\w+\s+(\d{1,2})\s+([A-Za-z]+)\s+to\s+\w+\s+(\d{1,2})\s+([A-Za-z]+)/i.exec(plain);
  const year = head ? Number(head[1]) : new Date().getUTCFullYear();
  if (valid && monthIdx(valid[2]) >= 0 && monthIdx(valid[4]) >= 0) {
    const fm = monthIdx(valid[2]), tm = monthIdx(valid[4]), ty = tm < fm ? year + 1 : year;
    const p = (n) => String(n).padStart(2, '0');
    out.from = year + '-' + p(fm + 1) + '-' + p(valid[1]);
    out.to = ty + '-' + p(tm + 1) + '-' + p(valid[3]);
  } else if (out.date) { out.from = out.date; out.to = addDays(out.date, 6); }
  const tables = /<table\b[\s\S]*?<\/table>/gi;
  let tm, lastEnd = 0;
  while ((tm = tables.exec(h))) {
    const before = h.slice(lastEnd, tm.index);
    lastEnd = tm.index + tm[0].length;
    const heads = before.match(/<(h[1-6]|strong|b)\b[^>]*>[\s\S]*?<\/\1>/gi);
    const cat = heads ? clip(text(heads[heads.length - 1]), 40) : '';
    const rows = tm[0].match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    rows.forEach((r) => {
      const cells = (r.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || []);
      if (cells.length < 6) return;
      const c = cells.map(text), store = /^coles$/i.test(c[0]) ? 'Coles' : /^woolworths$/i.test(c[0]) ? 'Woolworths' : '';
      if (!store) return;
      const was = cents(c[2]), now = cents(c[4]), off = parseInt(c[5], 10) || (was ? Math.round((was - now) / was * 100) : 0);
      if (!(now > 0) || !(was >= now) || !c[1]) return;
      const a = /href="([^"]+)"/i.exec(cells[1]);
      out.items.push({ s: store, n: clip(c[1], 120), was, now, off, cat, last: clip(c[6] || '', 40), link: a ? safeLink(decode(a[1])) : '', src: 'hp' });
    });
  }
  return out;
}

/* ---------- Harris Farm ---------- */
/* Harris Farm's "was" price is often per kilo while the special is per item or pack (a 250g brie "was $36.99"), so
   only the special price is kept. Its product types carry shelf codes: "Frdg1-Cheese" is Cheese. */
export const hfCat = (t) => clip(String(t || '').replace(/^[A-Za-z]+\d*[A-Za-z]?-/, '').trim(), 40);
export function hfItems(products) {
  const out = [], seen = {};
  (products || []).forEach((p) => {
    if (!p || !p.title) return;
    (p.variants || []).slice(0, 3).forEach((v) => {
      const now = cents(v && v.price), was = cents(v && v.compare_at_price);
      if (!(now > 0 && was > now)) return;
      const n = clip(String(p.title).trim() + (v.title && !/^default title$/i.test(v.title) ? ' ' + v.title : ''), 120);
      if (seen[n.toLowerCase()]) return;
      seen[n.toLowerCase()] = true;
      out.push({ s: 'Harris Farm', n, was: 0, now, off: 0, cat: hfCat(p.product_type), last: '', link: p.handle ? safeLink(HF + '/products/' + encodeURIComponent(p.handle)) : '', src: 'hf' });
    });
  });
  return out.slice(0, 400);
}

/* ---------- putting it together ---------- */
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
export async function build({ prev, now = new Date(), fetchText, wait = 400, log = () => {} }) {
  const P = prev && typeof prev === 'object' ? prev : {}, PS = P.sources || {}, today = sydneyDay(now), at = now.toISOString();
  const out = { v: 1, updated: at, today, sources: {}, specials: [], deals: [] };
  const live = (x) => x && x.to && x.to >= today;

  /* OzBargain feeds */
  const items = [];
  let feeds = 0;
  for (const u of FEEDS) {
    const r = await fetchText(u);
    if (r && r.status === 200 && /<rss\b|<channel\b/i.test(r.text)) { feeds++; items.push(...parseRss(r.text)); } else log('Feed not read: ' + u + ' (' + (r ? r.status : 'no answer') + ')');
    await pause(wait);
  }
  out.deals = feeds ? toDeals(items, today).slice(0, 80) : (Array.isArray(P.deals) ? P.deals.filter((d) => !d.to || d.to >= today) : []);
  out.sources.ozb = { ok: feeds > 0, feeds, n: out.deals.length, at: feeds ? at : (PS.ozb && PS.ozb.at) || null };

  /* The half-price report: read again only when there's a new one. */
  const reports = items.filter(isReport).map((it) => ({ id: nodeId(it.link), pub: new Date(it.pub).getTime() || 0, title: it.title })).filter((x) => x.id).sort((a, b) => b.pub - a.pub);
  const pr = PS.report, prevItems = (Array.isArray(P.specials) ? P.specials : []).filter((x) => x.src === 'hp');
  let rep = null;
  if (reports.length && pr && pr.id === reports[0].id && live(pr) && prevItems.length) rep = { meta: pr, items: prevItems };
  else if (reports.length) {
    const r = await fetchText(OZB + '/node/' + reports[0].id);
    const parsed = r && r.status === 200 ? parseReport(r.text) : null;
    if (parsed && parsed.items.length && parsed.to >= today) {
      rep = { meta: { ok: true, id: reports[0].id, link: OZB + '/node/' + reports[0].id, date: parsed.date, from: parsed.from, to: parsed.to, at }, items: parsed.items };
    } else log('Half-price report not read: node ' + reports[0].id + ' (' + (r ? r.status : 'no answer') + ')');
    await pause(wait);
  }
  if (!rep && live(pr) && prevItems.length) rep = { meta: Object.assign({}, pr, { stale: true }), items: prevItems };
  if (rep) {
    rep.meta.n = rep.items.length;
    rep.meta.coles = rep.items.filter((x) => x.s === 'Coles').length;
    rep.meta.woolies = rep.items.filter((x) => x.s === 'Woolworths').length;
    out.sources.report = rep.meta;
    out.specials.push(...rep.items);
  } else out.sources.report = { ok: false };

  /* Harris Farm: the list that worked last time first. */
  const ph = PS.harris || {}, lists = ph.handle ? [ph.handle].concat(HF_LISTS.filter((x) => x !== ph.handle)) : HF_LISTS;
  let hf = null;
  const tried = [];
  for (const handle of lists) {
    const r = await fetchText(HF + '/collections/' + handle + '/products.json?limit=250');
    await pause(wait);
    tried.push([handle, r ? r.status : 0]);
    if (!r || r.status !== 200) continue;
    let data = null;
    try { data = JSON.parse(r.text); } catch (e) { data = null; }
    if (!data || !Array.isArray(data.products) || !data.products.length) continue;
    let products = data.products;
    for (let page = 2; page <= 3 && data && Array.isArray(data.products) && data.products.length === 250; page++) {
      const more = await fetchText(HF + '/collections/' + handle + '/products.json?limit=250&page=' + page);
      await pause(wait);
      try { data = more && more.status === 200 ? JSON.parse(more.text) : null; } catch (e) { data = null; }
      if (data && Array.isArray(data.products)) products = products.concat(data.products);
    }
    const list = hfItems(products);
    if (list.length) { const wk = specialsWeek(today); hf = { meta: { ok: true, handle, from: wk.from, to: wk.to, at }, items: list }; break; }
  }
  const prevHf = (Array.isArray(P.specials) ? P.specials : []).filter((x) => x.src === 'hf');
  if (!hf) {
    log('Harris Farm specials not read');
    if (live(ph) && prevHf.length) hf = { meta: Object.assign({}, ph, { stale: true }), items: prevHf };
  }
  if (hf) { hf.meta.n = hf.items.length; out.sources.harris = hf.meta; out.specials.push(...hf.items); } else out.sources.harris = { ok: false, tried };
  return out;
}

/* What a run found, leaving out times and vote counts, so a run with nothing new can skip publishing. */
export function fingerprint(out) {
  const o = out && typeof out === 'object' ? out : {}, s = o.sources || {};
  return JSON.stringify({
    report: s.report && s.report.ok ? [s.report.id, s.report.to] : null,
    harris: s.harris && s.harris.ok ? [s.harris.from, s.harris.to] : null,
    specials: (Array.isArray(o.specials) ? o.specials : []).map((x) => [x.s, x.n, x.now, x.was]),
    deals: (Array.isArray(o.deals) ? o.deals : []).map((d) => d.id + '|' + d.to).sort()
  });
}

async function realFetch(url) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: /products\.json/.test(url) ? 'application/json' : /\/feed$/.test(url) ? 'application/rss+xml, application/xml;q=0.9, */*;q=0.5' : 'text/html, */*;q=0.5' },
      redirect: 'follow', signal: AbortSignal.timeout(20000)
    });
    return { status: r.status, text: await r.text() };
  } catch (e) {
    return { status: 0, text: String(e && e.message) };
  }
}

async function main() {
  const [prevPath = 'prev.json', outPath = 'out/deals.json'] = process.argv.slice(2);
  let prev = {};
  try { prev = JSON.parse(await readFile(prevPath, 'utf8')); } catch (e) { prev = {}; }
  const out = await build({ prev, fetchText: realFetch, log: (m) => console.log('::warning::' + m) });
  const changed = fingerprint(out) !== fingerprint(prev);
  if (!changed && prev.updated) out.updated = prev.updated;
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out));
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, 'changed=' + changed + '\n');
  const s = out.sources;
  console.log((changed ? 'New deals. ' : 'Nothing new, so nothing published. ') + 'OzBargain deals: ' + out.deals.length + ' | half-price list: ' + (s.report.n || 0) + (s.report.stale ? ' (kept from last run)' : '') +
    ' | Harris Farm: ' + (s.harris.n || 0) + (s.harris.handle ? ' from /collections/' + s.harris.handle : '') + (s.harris.stale ? ' (kept from last run)' : ''));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
