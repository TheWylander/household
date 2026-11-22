/* Sends the household app's phone notifications. GitHub runs it each morning and evening for free, straight after
   each deals refresh, and the app starts it the moment one of us adds a spend (with NOTIFY_MODE=spends). GitHub can run
   its timers hours late, so a run at night sends nothing and leaves what's due for the morning.
   It signs in to Firebase as its own bot user, whose email and password are in two GitHub secrets, BOT_EMAIL and
   BOT_PASSWORD. The Firestore rules only let that user read the sale days, watch list, phones and new-spend notes in
   hh/deals and hh/push, and note what it sent. Without the secrets, it stops quietly. Each pop-up is encrypted for the phone it goes to.
   Each household keeps its own in households/{id}/hh, and the website specials everyone shares are in shared/web. Until
   the rules let the bot list the households, or before the first one is made, it uses the one household at the top.
   Run from the top of the repo: node .github/notify/notify.mjs deals.json */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
/* The app's own date rules, so a "2nd Saturday" lands on the same day here as on your phone. */
const L = require(existsSync(new URL('./logic.js', import.meta.url)) ? './logic.js' : '../logic.js');

export function sydneyNow(d) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return { day: p.year + '-' + p.month + '-' + p.day, hour: Number(p.hour), min: Number(p.minute) };
}
/* Pop-ups go out between 6:30am and 9:30pm in Sydney. GitHub sometimes runs the morning and evening jobs hours late, and
   a late run in the night keeps what's due for the next one. New spends started from the app go straight away. */
export const AWAKE = [6 * 60 + 30, 21 * 60 + 30];
export const awake = (t) => t.hour * 60 + t.min >= AWAKE[0] && t.hour * 60 + t.min < AWAKE[1];
/* A pop-up's bold title says what it's about. The iPhone adds "from Two of Us" under it itself, so the app's name
   isn't repeated: it only stands in for a pop-up that has no title. */
export const APP = 'Two of Us';
export const payloadOf = (n) => ({ title: n.title || APP, body: n.body || '', url: n.url, tag: n.tag });
const keenOn = (s, d) => (s.keen !== false ? (s.skip || []).indexOf(d) < 0 : (s.on || []).indexOf(d) >= 0);
const shop = (s) => (s === 'Woolworths' ? 'Woolies' : s);
const short = (n) => String(n).split(' ').slice(0, 4).join(' ');

/* The week's specials key, from whichever list has started and is still running. */
export function weekKey(feed, day) {
  const s = (feed && feed.sources) || {}, on = (x) => !!(x && x.ok !== false && x.from && x.from <= day && x.to >= day);
  const from = (on(s.report) && s.report.from) || (on(s.harris) && s.harris.from) || '';
  return from ? 'sp:' + from : '';
}
/* Whether a special is running on a day. A list counts once it has started: next week's half-price list is posted days early. */
function runningOn(feed, day) {
  const s = (feed && feed.sources) || {}, live = (k) => !!(s[k] && s[k].to && s[k].to >= day && (!s[k].from || s[k].from <= day));
  return (x) => (x.src === 'um' || x.src === 'snap' || x.src === 'web' ? !!x.to && x.to >= day : live(x.src === 'hf' ? 'harris' : x.src === 'me' ? 'meat' : 'report'));
}
/* Specials we read in from screenshots in the app (Coles fresh food, Liquorland), kept in hh/deals until their last day,
   join the lists, so the watch list and the week's picks see them. One the lists already have is left out. */
const flat = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
/* The % off, for sorting the biggest discounts first like the lists' own. */
const offOf = (now, was) => (was > now && now > 0 ? Math.round((1 - now / was) * 100) : 0);
export function withSnaps(feed, snaps) {
  const f = feed || {}, have = new Set((Array.isArray(f.specials) ? f.specials : []).map((x) => x && L.storeName(x.s) + '|' + flat(x.n)));
  const list = (Array.isArray(snaps) ? snaps : []).filter((x) => x && typeof x.n === 'string' && x.n.trim() && x.now > 0 && /^\d{4}-\d{2}-\d{2}$/.test(x.to || ''))
    .map((x) => ({ s: L.storeName(x.s), n: x.n.trim(), now: x.now, was: x.was > x.now ? x.was : 0, off: offOf(x.now, x.was), cat: String(x.cat || ''), src: 'snap', to: x.to }))
    .filter((x) => !have.has(x.s + '|' + flat(x.n)));
  return list.length ? Object.assign({}, f, { specials: (Array.isArray(f.specials) ? f.specials : []).concat(list) }) : feed;
}
/* Coles fresh food and Liquorland from Coles' website, and Woolies fresh food from Woolworths', read each week in the
   browser on the laptop, kept in hh/deals as one tab-separated line each: shop, name, price and usual price in cents,
   deal words, aisle, finer aisle, link. Each shop has its own last day in web.shops; before Woolies, web.to covered the lot. */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function withWeb(feed, web) {
  const w = web && typeof web === 'object' ? web : null;
  if (!w || !Array.isArray(w.items) || !w.items.length) return feed;
  const sh = w.shops && typeof w.shops === 'object' ? w.shops : null;
  const toOf = (s) => { const x = sh ? sh[s] : (s === 'Woolworths' ? null : w); return x && ISO.test(x.to || '') ? x.to : ''; };
  const f = feed || {}, old = (Array.isArray(f.specials) ? f.specials : []).filter(Boolean);
  const have = new Set(old.map((x) => L.storeName(x.s) + '|' + flat(x.n))), byPrice = {};
  old.forEach((x) => { const k = L.storeName(x.s) + '|' + x.now + '|' + (x.was || 0); (byPrice[k] = byPrice[k] || []).push(x.n); });
  const list = w.items.filter((l) => typeof l === 'string').map((l) => {
    const x = l.split('\t'), s = L.storeName(x[0]), now = Number(x[2]) || 0, was = Number(x[3]) || 0;
    return { s, n: String(x[1] || '').trim(), now, was: was > now ? was : 0, off: offOf(now, was), cat: String(x[5] || ''), src: 'web', to: toOf(s) };
  }).filter((x) => x.n && x.now > 0 && x.to && !have.has(x.s + '|' + flat(x.n)) && !(byPrice[x.s + '|' + x.now + '|' + x.was] || []).some((n) => sameThing(n, x.n)));
  return list.length ? Object.assign({}, f, { specials: old.concat(list) }) : feed;
}
/* The same thing named two ways at the same shop and price, like the half-price list's "Chicken Garlic Kyiv – From the
   Deli" and Woolworths' "Woolworths Chicken Garlic Kyiv From The Deli each": every word of the shorter name is in the
   longer one (as in the app). Two flavours at one price stay two things. */
const NAME_SKIP = /^(woolworths|coles|each|from|the|and|or|of|with|per)$/;
const nameWords = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 1 && !NAME_SKIP.test(w));
export function sameThing(a, b) {
  const A = new Set(nameWords(a)), B = new Set(nameWords(b)), small = A.size <= B.size ? A : B, big = small === A ? B : A;
  if (small.size < 2) return false;
  for (const w of small) if (!big.has(w)) return false;
  return true;
}
/* This week's specials and OzBargain deals that match the watch list. A deal matches on its shop too. */
export function weekHits(feed, watch, day) {
  if (!feed || !Array.isArray(watch) || !watch.length) return [];
  const running = runningOn(feed, day);
  const specials = L.sortSpecials((feed.specials || []).filter((x) => x && x.n && running(x) && L.watchHits(x.n, watch).length), watch)
    .map((x) => ({ n: x.n, s: L.storeName(x.s), now: x.now }));
  const deals = (feed.deals || []).filter((d) => d && d.t && !d.hp && (!d.to || d.to >= day) && L.watchHits(d.t + ' ' + d.s, watch).length)
    .map((d) => ({ n: d.t, s: L.storeName(d.s) }));
  return specials.concat(deals);
}
/* For each watch word, what matches it: specials first, best first, then OzBargain posts. */
export function wordHits(feed, watch, day) {
  return (Array.isArray(watch) ? watch : []).map((w) => ({ w, hits: weekHits(feed, [w], day) })).filter((g) => g.hits.length);
}
const andList = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const itemLine = (h) => short(h.n) + (h.now > 0 ? ' · ' + L.fmt(h.now) : '') + (h.s ? ' at ' + shop(h.s) : '');
/* How many weeks since a half-price item was last this cheap, from the list's note ("26 weeks ago @ WW"). */
const rareWeeks = (x) => { const t = String(x.last || '').trim(); return !t || x.src !== 'hp' ? 0 : /never|first/i.test(t) ? 99 : L.weeksSince(t) || 0; };
/* Food and drink aisles, from each shop's own categories, so the week's top picks are things we'd buy, one from each. */
const AISLES = [['meat', /poultry|meat|butcher|seafood|fish/i], ['fresh', /fruit|veg/i], ['fridge', /dairy|cheese|deli|antipasto/i], ['frozen', /freezer|frozen/i],
  ['snacks', /snack|confection/i], ['drinks', /drinks/i], ['pantry', /pantry|bakery|breakfast/i]];
const aisleOf = (cat) => (AISLES.filter((a) => a[1].test(String(cat || '')))[0] || [''])[0];
/* The week's best food and drink specials that aren't on the watch list: the biggest savings, one from each aisle so
   it isn't all chocolate, and on a tie the one not this cheap for longest. Cookware, SIM cards and razors are left to the app. */
export function topPicks(feed, watch, day, n = 3) {
  const running = runningOn(feed, day), w = Array.isArray(watch) ? watch : [], seen = {};
  return (feed && Array.isArray(feed.specials) ? feed.specials : [])
    .filter((x) => x && x.n && x.now > 0 && x.was > x.now && aisleOf(x.cat) && running(x) && !L.watchHits(x.n, w).length)
    .map((x, i) => ({ x, i, save: x.was - x.now, rare: rareWeeks(x) }))
    .sort((a, b) => b.save - a.save || b.rare - a.rare || a.i - b.i)
    .filter((o) => { const k = aisleOf(o.x.cat); return seen[k] ? false : (seen[k] = true); })
    .slice(0, n).map((o) => ({ n: o.x.n, s: L.storeName(o.x.s), now: o.x.now }));
}
/* One line per thing we buy, with its best deal. Under the heading, three lines fit on an iPhone lock screen: up to three,
   or two and the rest by name. */
export function specialsPop(groups, more) {
  const shown = groups.length > 3 ? groups.slice(0, 2) : groups;
  const body = shown.map((g) => itemLine(g.hits[0])).concat(groups.length > 3 ? ['+ ' + andList(groups.slice(2).map((g) => g.w)) + ' in the app'] : []).join('\n');
  return { title: '🏷️ ' + (more ? 'More top specials this week' : 'Check out the top weekly specials'), body };
}
/* The week's first specials pop-up: the watch list's matches, then the week's best, three lines under the heading. */
export function weeklyPop(groups, picks) {
  if (groups.length > 3) return specialsPop(groups, false);
  return { title: '🏷️ Check out the top weekly specials', body: groups.map((g) => itemLine(g.hits[0])).concat(picks.map(itemLine)).slice(0, 3).join('\n') };
}

/* A TCN gift card deal: how much off and where, then its cards, the day it ends and the popular shops they cover. */
export function tcnPop(d, cards) {
  const byName = {}, popular = [];
  (Array.isArray(cards) ? cards : []).forEach((c) => { if (c && c.n) byName[String(c.n).replace(/^TCN\s+/i, '').toLowerCase()] = c; });
  (d.cards || []).forEach((n) => { const c = byName[String(n).toLowerCase()]; (c && Array.isArray(c.top) ? c.top : []).forEach((s) => { if (popular.indexOf(s) < 0) popular.push(s); }); });
  const deal = d.off ? d.off + '% off' : d.back ? 'about ' + d.back + '% back in points' : 'a deal';
  const shop = String(d.s || '').replace(/\s*\(.*$/, '').trim();
  return {
    title: '🎁 TCN gift cards: ' + deal + (shop ? ' at ' + shop : ''),
    body: [(d.cards && d.cards.length ? andList(d.cards.slice(0, 6)) : String(d.t || '')) + (d.to ? ', till ' + L.fmtDay(d.to) : ''),
      popular.length ? 'Covers ' + andList(popular.slice(0, 5)) : ''].filter(Boolean).join('\n')
  };
}

/* Several new spends from one person in a single pop-up: the total, what they were on one line, and your share. */
export function spendsPop(list) {
  if (list.length === 1) return { title: list[0].t, body: list[0].b || '' };
  const name = list[list.length - 1].n, total = list.reduce((a, e) => a + (e.c > 0 ? e.c : 0), 0), share = list.reduce((a, e) => a + (e.sh > 0 ? e.sh : 0), 0);
  const line = (e) => e.l || String(e.t || '').replace(/^\W+/u, '');
  const what = list.length > 3 ? list.slice(0, 2).map(line).join(', ') + ' and ' + (list.length - 2) + ' more' : andList(list.map(line));
  const lines = [what].concat(list.every((e) => typeof e.sh === 'number') ? ['Your share: ' + L.fmt(share)] : []);
  return { title: '💸 ' + (name ? name + ' added ' : '') + list.length + ' spends' + (total > 0 ? ', ' + L.fmt(total) : ''), body: lines.join('\n') };
}
const EV_FRESH = 36 * 3600e3, TEST_FRESH = 15 * 60e3;
/* New spends. Each phone keeps a short list of what its person added in hh/push (events.a and events.b); the job
   sends them to the other person's phones. A test pop-up from the setup goes to the person's own phones. */
export function spendEvents(P, sent, now) {
  const out = [], at = now.getTime();
  ['a', 'b'].forEach((by) => {
    (P.events && Array.isArray(P.events[by]) ? P.events[by] : []).forEach((e) => {
      if (!e || typeof e !== 'object' || !e.id || !e.t || typeof e.at !== 'number') return;
      const age = at - e.at;
      if (age > (e.self ? TEST_FRESH : EV_FRESH) || age < -10 * 60e3) return;
      const key = 'ev:' + sydneyNow(new Date(e.at)).day + ':' + String(e.id).slice(0, 40);
      if (!sent[key]) out.push({ by, e, key });
    });
  });
  return out.sort((x, y) => x.e.at - y.e.at);
}

/* Each household's phones are sent to at most 8 at a time, and a pop-up that hasn't gone in 10 seconds counts as not sent. */
export const MAX_PHONES = 8, SEND_WAIT = 10e3;
/* Pop-ups only go to the big push services (Apple, Google, Mozilla, Microsoft), so a phone's saved address can't
   point the job at some other server, one that never answers, say. */
const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com'], PUSH_ENDS = ['.push.apple.com', '.notify.windows.com', '.push.services.mozilla.com'];
export function knownPush(endpoint) {
  let u;
  try { u = new URL(String(endpoint || '')); } catch (e) { return false; }
  const h = u.hostname;
  return u.protocol === 'https:' && !u.username && !u.password && !u.port
    && (PUSH_HOSTS.indexOf(h) >= 0 || PUSH_ENDS.some((end) => h.length > end.length && h.endsWith(end)));
}
/* A phone's name as the app saved it, made safe for the public log: letters, digits, spaces and a little
   punctuation, 40 characters at most. A new line could otherwise start a GitHub command of its own. */
export const deviceOf = (s) => String((s && s.device) || '').replace(/[^A-Za-z0-9 .,'()_-]+/g, '').replace(/ {2,}/g, ' ').trim().slice(0, 40).trim() || 'a phone';
/* A send that hasn't answered in time counts as failed, so one slow phone can't hold up the rest. */
function within(p, ms) {
  let tm;
  return Promise.race([p, new Promise((ok) => { tm = setTimeout(ok, ms, { ok: false, status: 0, late: true }); })]).finally(() => clearTimeout(tm));
}

/* Everything to send on this run, and which phones it goes to. The app starts a run in "spends" mode the moment a
   spend is added; that run leaves sale days and specials to the morning and evening runs. */
export function plan({ push, deals, feed, now, mode = 'all' }) {
  const P = push || {}, D = deals || {}, sent = P.sent || {}, pub = P.vapid && P.vapid.pub, out = [];
  feed = withWeb(withSnaps(feed, D.snaps), D.web);
  const t = sydneyNow(now), { day, hour } = t;
  let subs = Object.keys(P.subs || {}).map((id) => Object.assign({ id }, P.subs[id]))
    .filter((s) => s && s.endpoint && s.keys && s.keys.p256dh && s.keys.auth && s.vapid === pub && !s.stale);
  /* At most 8 phones a household, the most recently turned on, so one household can't hold up the run. */
  const capped = Math.max(0, subs.length - MAX_PHONES);
  if (capped) {
    const keep = new Set(subs.slice().sort((x, y) => (Number(y.at) || 0) - (Number(x.at) || 0)).slice(0, MAX_PHONES).map((s) => s.id));
    subs = subs.filter((s) => keep.has(s.id));
  }
  const wants = (who, k) => !(P.prefs && P.prefs[who] && P.prefs[who][k] === false);
  if (mode !== 'spends' && !awake(t)) return { day, hour, subs, out, night: true, capped };

  subs.filter((s) => !s.welcomed).forEach((s) => out.push({
    key: 'welcome:' + s.id, to: [s.id], welcome: true, title: '🔔 Notifications are on',
    body: "💸 New spends from the other of us\n📅 Sale days we're keen on\n🏷️ Top specials each Wednesday, and our watch list", url: './'
  }));

  /* New spends, as one pop-up per person; with nobody to tell, they're only marked as done. */
  const evs = spendEvents(P, sent, now);
  ['a', 'b'].forEach((by) => {
    const mine = evs.filter((x) => x.by === by && !x.e.self);
    if (!mine.length) return;
    const to = subs.filter((x) => x.who !== by && wants(x.who, 'spends')).map((x) => x.id), keys = mine.map((x) => x.key);
    out.push(Object.assign({ key: keys[0], keys, to, spend: true, quiet: !to.length, url: './' }, spendsPop(mine.map((x) => x.e))));
  });
  evs.filter((x) => x.e.self).forEach((x) => {
    const to = subs.filter((s) => s.who === x.by).map((s) => s.id);
    out.push({ key: x.key, keys: [x.key], to, test: true, quiet: !to.length, title: x.e.t, body: x.e.b || '', url: './' });
  });
  if (mode === 'spends') return { day, hour, subs, out, capped };

  /* Sale days: the evening before, and the morning of. */
  const evening = hour >= 12, date = evening ? L.addDays(day, 1) : day;
  (Array.isArray(D.sales) ? D.sales : []).forEach((s) => {
    if (!s || !s.id || !s.store || !s.rule) return;
    L.saleDates(s.rule, date, date).forEach((d) => {
      const key = 'sale:' + s.id + '|' + d + (evening ? ':eve' : ':am');
      if (!keenOn(s, d) || sent[key]) return;
      const to = subs.filter((x) => wants(x.who, 'sale')).map((x) => x.id);
      if (to.length) out.push({ key, to, title: (evening ? '📅 ' + s.store + ' sale tomorrow' : '🛒 ' + s.store + ' sale is on today'), body: [s.offer, s.where ? '📍 ' + s.where : ''].filter(Boolean).join('\n') || 'One of your sale days.', url: './#cal=' + d, tag: 'sale-' + s.id });
    });
  });

  /* Specials. The week's first pop-up, once its lists have started (by Friday), has the top specials with the watch
     list's matches first. After that, only new watch-list matches. */
  const wk = weekKey(feed, day), from = wk.slice(3), top = from ? 'top:' + from : '';
  const toSp = subs.filter((x) => wants(x.who, 'specials')).map((x) => x.id);
  if (wk && toSp.length) {
    const hits = weekHits(feed, D.watch, day), before = Array.isArray(sent[wk]) ? sent[wk] : null;
    if (!before && !sent[top] && day <= L.addDays(from, 2)) {
      const groups = wordHits(feed, D.watch, day), picks = topPicks(feed, D.watch, day, 3);
      if (groups.length || picks.length) {
        out.push(Object.assign({ key: top, marks: { [top]: now.getTime(), [wk]: hits.map((h) => h.n).slice(0, 60) }, to: toSp, url: './#deals', tag: 'specials', top: true }, weeklyPop(groups, picks)));
      }
    } else if (hits.length) {
      const prev = before || [], names = hits.filter((h) => prev.indexOf(h.n) < 0).map((h) => h.n);
      const groups = wordHits(feed, D.watch, day).map((g) => ({ w: g.w, hits: g.hits.filter((h) => names.indexOf(h.n) >= 0) })).filter((g) => g.hits.length);
      if (groups.length) out.push(Object.assign({ key: wk, names: hits.map((h) => h.n).slice(0, 60), to: toSp, url: './#deals', tag: 'specials' }, specialsPop(groups, prev.length > 0 || !!sent[top])));
    }
  }

  /* The Card Network's gift card deals: one pop-up when one worth having (10% or more) starts, at most two a run. */
  const tcn = feed && feed.tcn && typeof feed.tcn === 'object' ? feed.tcn : {}, toTcn = subs.filter((x) => wants(x.who, 'specials')).map((x) => x.id);
  (Array.isArray(tcn.deals) ? tcn.deals : []).filter((d) => d && d.id && (d.off >= 10 || d.back >= 10) && (!d.from || d.from <= day) && (!d.to || d.to >= day))
    .map((d) => ({ d, key: 'tcn:' + d.id + (d.to ? '|' + d.to : '') })).filter((x) => !sent[x.key]).slice(0, 2)
    .forEach((x) => { if (toTcn.length) out.push(Object.assign({ key: x.key, to: toTcn, url: './#tcn', tag: 'tcn-' + x.d.id }, tcnPop(x.d, tcn.cards))); });
  return { day, hour, subs, out, capped };
}

/* Markers older than 60 days are cleared, so the record stays small; a spend's marker goes after a week. */
export function oldKeys(sent, day) {
  const cut = L.addDays(day, -60), evCut = L.addDays(day, -7);
  return Object.keys(sent || {}).filter((k) => { const m = /(\d{4}-\d{2}-\d{2})/.exec(k); return m && m[1] < (/^ev:/.test(k) ? evCut : cut); });
}

/* Sends the plan and works out what to write back: what was sent, phones that welcomed, ones that are gone. */
export async function run({ push, deals, feed, now = new Date(), mode = 'all', send, log = () => {}, wait = SEND_WAIT }) {
  const p = plan({ push, deals, feed, now, mode }), subs = {}, sent = {}, skip = {};
  let ok = 0, failed = 0;
  if (p.capped) log('Sent to ' + MAX_PHONES + ' phones only; ' + p.capped + ' more were left out.');
  for (const n of p.out) {
    if (n.quiet) { n.keys.forEach((k) => { sent[k] = Date.now(); }); continue; }
    let any = false;
    for (const id of n.to) {
      if (subs[id] === null) continue;
      /* A phone that was skipped or too slow once this run isn't tried again. */
      if (skip[id]) { failed++; continue; }
      const s = p.subs.find((x) => x.id === id);
      if (!knownPush(s.endpoint)) { skip[id] = true; failed++; log('Not sent to ' + deviceOf(s) + " (its address isn't a known push service)"); continue; }
      const r = await within(send(s, payloadOf(n), push.vapid), wait);
      if (r && r.ok) { any = true; ok++; continue; }
      failed++;
      if (r && r.late) { skip[id] = true; log('Not sent to ' + deviceOf(s) + ' (no answer in time)'); continue; }
      const st = r ? r.status : 0;
      if (st === 404 || st === 410) subs[id] = null;
      else if (st === 401 || st === 403) subs[id] = Object.assign(subs[id] || {}, { stale: true });
      log('Not sent to ' + deviceOf(s) + ' (' + st + (st === 404 || st === 410 ? ', it has unsubscribed' : st === 401 || st === 403 ? ', it needs to turn notifications on again' : '') + ')');
    }
    if (!any) continue;
    if (n.welcome) { if (subs[n.to[0]] !== null) subs[n.to[0]] = Object.assign(subs[n.to[0]] || {}, { welcomed: true }); }
    else if (n.marks) Object.keys(n.marks).forEach((k) => { sent[k] = n.marks[k]; });
    else if (n.keys) n.keys.forEach((k) => { sent[k] = Date.now(); });
    else sent[n.key] = n.names || Date.now();
  }
  return { plan: p, ok, failed, write: { subs, sent, drop: oldKeys(push.sent, p.day), last: { at: now.toISOString(), sent: ok, failed } } };
}

/* ---------- Firebase, through its REST APIs ---------- */
/* The app's public Firebase settings, from firebase-config.js at the top of the repo. */
export function webConfig(text) {
  const pick = (k) => { const m = new RegExp(k + '\\s*:\\s*["\']([^"\']+)["\']').exec(String(text || '')); return m ? m[1] : ''; };
  return { apiKey: pick('apiKey'), projectId: pick('projectId') };
}

/* Firestore's REST format wraps every value with its type. */
export function fromFs(v) {
  if (!v || typeof v !== 'object') return null;
  if ('mapValue' in v) return fromFields(v.mapValue.fields);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  return null;
}
export const fromFields = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, fromFs(v)]));
export function toFs(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isSafeInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === 'string') return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(toFs) } };
  return { mapValue: { fields: toFields(x) } };
}
export const toFields = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toFs(v)]));

/* A field path, with keys like sale:s1|2026-11-14:eve in backticks. */
export const fieldPath = (...keys) => keys.map((k) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : '`' + String(k).replace(/[\\`]/g, '\\$&') + '`')).join('.');

/* run()'s write as one Firestore update that touches only those fields: a field named in the mask but left out
   of the data is deleted, which is how gone phones and old markers are cleared. */
export function toUpdate(write) {
  const data = { last: write.last }, mask = ['last'], subs = {}, sent = {};
  Object.keys(write.subs || {}).forEach((id) => {
    const v = write.subs[id];
    if (v === null) { mask.push(fieldPath('subs', id)); return; }
    Object.keys(v).forEach((k) => { (subs[id] = subs[id] || {})[k] = v[k]; mask.push(fieldPath('subs', id, k)); });
  });
  Object.keys(write.sent || {}).forEach((k) => { sent[k] = write.sent[k]; mask.push(fieldPath('sent', k)); });
  (write.drop || []).forEach((k) => { if (!(k in sent)) mask.push(fieldPath('sent', k)); });
  if (Object.keys(subs).length) data.subs = subs;
  if (Object.keys(sent).length) data.sent = sent;
  return { fields: toFields(data), mask };
}

/* What went wrong, in words that say what to fix. */
function explain(step, status, message) {
  const m = String(message || '');
  if (step === 'sign in') {
    if (/INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND|INVALID_PASSWORD|INVALID_EMAIL|MISSING_PASSWORD/.test(m)) return "The bot couldn't sign in. Check the BOT_EMAIL and BOT_PASSWORD secrets match the user you added in Firebase Authentication.";
    if (/USER_DISABLED/.test(m)) return "The bot's user is turned off in Firebase Authentication.";
    if (/OPERATION_NOT_ALLOWED/.test(m)) return 'Email and password sign-in is turned off in Firebase Authentication.';
    if (/TOO_MANY_ATTEMPTS/.test(m)) return 'Firebase paused sign-ins after too many tries. The next run should work.';
  } else if (status === 403) return "Firestore didn't let the bot in. Publish the new Firestore rules, the ones with isBot() in them.";
  return 'Firebase ' + step + ' failed (' + (status || 'no answer') + (m ? ': ' + m : '') + ').';
}

/* Signs the bot in, then reads and updates documents with its login, so the Firestore rules apply. */
export function firebase({ apiKey, projectId, referer, fetch: f = globalThis.fetch }) {
  const docs = 'projects/' + projectId + '/databases/(default)/documents', base = 'https://firestore.googleapis.com/v1/';
  let token = '';
  async function call(step, url, init) {
    let r;
    try { r = await f(url, init); } catch (e) { throw Object.assign(new Error(explain(step, 0, e && e.message)), { firebase: true }); }
    const j = await r.json().catch(() => ({}));
    if (r.ok || (step === 'read' && r.status === 404)) return { status: r.status, body: j };
    const e = new Error(explain(step, r.status, j && j.error && j.error.message));
    e.status = r.status;
    e.firebase = true;
    throw e;
  }
  const auth = () => ({ authorization: 'Bearer ' + token, 'content-type': 'application/json' });
  /* A document path, checked and then encoded a piece at a time for the URL, so an odd id can't step out of its
     place: fetch reads '..', and '%2e%2e' too, as "the folder above". */
  const checked = (path) => {
    const parts = String(path).split('/');
    if (parts.some((s) => !s || s === '.' || s === '..')) throw Object.assign(new Error("The job was asked for a Firestore path it doesn't allow, so it left it alone."), { firebase: true });
    return parts;
  };
  const at = (path) => checked(path).map(encodeURIComponent).join('/');
  return {
    async signIn(email, password) {
      const headers = { 'content-type': 'application/json' };
      if (referer) headers.referer = referer;
      const r = await call('sign in', 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(apiKey),
        { method: 'POST', headers, body: JSON.stringify({ email, password, returnSecureToken: true }) });
      token = r.body.idToken;
      if (!token) throw new Error(explain('sign in', r.status, 'no token came back'));
    },
    async get(path) {
      const r = await call('read', base + docs + '/' + at(path), { headers: auth() });
      return r.status === 404 ? null : fromFields(r.body.fields);
    },
    /* A collection's documents, 100 a page, each as its id and only the fields asked for (mask.fieldPaths, once per
       field, on every page, as a page token needs the same question each time). A document without any of them comes
       back with no fields. The id is all of the name after the collection, so one with a / in it stays whole, for
       job() to turn away. The page cap stops a fault at Google's end looping forever. */
    async list(path, fields) {
      const out = [], mask = (fields || []).map((k) => '&mask.fieldPaths=' + encodeURIComponent(fieldPath(k))).join('');
      const from = docs + '/' + checked(path).join('/') + '/';
      let page = '';
      for (let i = 0; i < 100; i++) {
        const r = await call('list', base + docs + '/' + at(path) + '?pageSize=100' + mask + (page ? '&pageToken=' + encodeURIComponent(page) : ''), { headers: auth() });
        const b = r.body || {};
        (Array.isArray(b.documents) ? b.documents : []).forEach((d) => {
          const name = String((d && d.name) || '');
          out.push({ id: name.indexOf(from) === 0 ? name.slice(from.length) : '', data: fromFields(d && d.fields) });
        });
        page = b.nextPageToken || '';
        if (!page) break;
      }
      return out;
    },
    /* The document's name in the write is Firestore's own name for it, not a URL, so it isn't encoded; it's checked. */
    async update(path, write) {
      const u = toUpdate(write), name = docs + '/' + checked(path).join('/');
      await call('update', base + docs + ':commit', {
        method: 'POST', headers: auth(),
        body: JSON.stringify({ writes: [{ update: { name, fields: u.fields }, updateMask: { fieldPaths: u.mask }, currentDocument: { exists: true } }] })
      });
    }
  };
}

/* One household: read its sale days, watch list and phones, send, and note what was sent in its own hh/push. A run for
   new spends doesn't need the sale days or watch list, so it reads only hh/push. at is where its documents are: '' for
   the one household at the top, from before there were several. web, if given, gets the website specials everyone
   shares, which stand in for the household's own copy in hh/deals. */
async function household(fb, at, { feed, now, mode, send, log, web, wait }) {
  const [push, deals] = await Promise.all([fb.get(at + 'hh/push'), mode === 'spends' ? null : fb.get(at + 'hh/deals')]);
  if (!push || !push.vapid || !push.vapid.pub || !push.vapid.d) {
    if (push) await fb.update(at + 'hh/push', { last: { at: now.toISOString(), sent: 0, failed: 0 } });
    return null;
  }
  const w = web && mode !== 'spends' ? await web() : null;
  const r = await run({ push, deals: w ? Object.assign({}, deals, { web: w }) : deals || {}, feed, now, mode, send, log, wait });
  /* If the note fails, the pop-ups have still gone, so the summary can count them. */
  try { await fb.update(at + 'hh/push', r.write); } catch (e) { if (e && typeof e === 'object') e.run = r; throw e; }
  return r;
}

/* Why a household was skipped, for the public log. Firebase's own words are fine, with the household's id cut to its
   first 6 characters; anything else only says what kind of error, as its words could quote what's in the documents. */
function whyNot(e, hid) {
  if (!e || !e.firebase) return 'the job hit an error (' + ((e && e.name) || 'Error') + ').';
  const m = String(e.message || '');
  return hid ? m.split(hid).join(hid.slice(0, 6)) : m;
}

/* The app's household ids: 16 lower-case letters and digits. Anything else is left alone, whatever the rules allow. */
export const HID = /^[a-z0-9]{16}$/;

/* One run: sign in, then each household in turn. While the rules don't let the bot list the households yet (403),
   or there are none yet, it's the one household at the top, just as before. The one at the top also keeps going
   alongside the others until the household its data moves into (marked legacy) is there, and from then on it's left
   out, so the same phones never get a pop-up from both. Only that mark is read from each household. One household
   going wrong is noted in the log and the rest carry on. */
export async function job({ email, password, config, feed, now = new Date(), mode = 'all', fetch: f, send, referer, log = () => {}, wait }) {
  const fb = firebase({ apiKey: config.apiKey, projectId: config.projectId, referer, fetch: f });
  await fb.signIn(email, password);
  let listed = [];
  try { listed = await fb.list('households', ['legacy']); } catch (e) { if (e.status !== 403) throw e; }
  const homes = listed.filter((h) => HID.test(h.id)), odd = listed.length - homes.length;
  if (odd) log('Left out ' + odd + (odd === 1 ? ' household' : ' households') + " with an id the app doesn't make.");
  if (!homes.length) return household(fb, '', { feed, now, mode, send, log, wait });
  const todo = (homes.some((h) => h.data.legacy === true) ? [] : [{ id: 'top-level', at: '' }])
    .concat(homes.map((h) => ({ id: h.id.slice(0, 6), hid: h.id, at: 'households/' + h.id + '/' })));

  /* The shared website specials, read once, the first time a household needs them. If they're missing or can't be
     read, each household's own copy in its hh/deals is used. */
  let shared = null;
  const web = () => (shared = shared || fb.get('shared/web').then((w) => (w && Array.isArray(w.items) ? w : null), (e) => {
    log("Couldn't read the shared website specials, so each household's own copy is used. " + whyNot(e));
    return null;
  }));
  /* The one at the top runs as it always has, with its own copy of the website specials. */
  const done = [];
  for (const h of todo) {
    const say = (m) => log('Household ' + h.id + ': ' + m);
    try {
      done.push({ id: h.id, r: await household(fb, h.at, { feed, now, mode, send, log: say, web: h.hid ? web : null, wait }) });
    } catch (e) {
      log('Household ' + h.id + ' went wrong: ' + whyNot(e, h.hid));
      done.push({ id: h.id, error: true, r: e && e.run });
    }
  }
  /* All of it together, so runSummary works as before, with a count for each household. */
  const ran = done.filter((h) => h.r), sum = (k) => ran.reduce((a, h) => a + h.r[k], 0);
  if (!ran.length && !done.some((h) => h.error)) return null;
  return {
    plan: { night: ran.length > 0 && ran.every((h) => h.r.plan.night), out: ran.reduce((a, h) => a.concat(h.r.plan.out), []) },
    ok: sum('ok'), failed: sum('failed'),
    households: done.map((h) => ({ id: h.id, ok: h.r ? h.r.ok : 0, failed: h.r ? h.r.failed : 0, none: !h.r && !h.error, error: !!h.error }))
  };
}

/* The run log on GitHub is public, so it says what kind of pop-ups went out, never what they said. */
export function runSummary(r) {
  if (!r) return 'No phone has turned notifications on yet.';
  /* With several households, a few words on each, by the first 6 characters of its id. */
  const each = Array.isArray(r.households) ? ' Households: ' + r.households.map((h) => h.id + ' ' + (h.error ? (h.ok ? 'sent ' + h.ok + ", but couldn't note what it sent" : "couldn't be done")
    : h.none ? 'has no phone on yet' : 'sent ' + h.ok + (h.failed ? ', ' + h.failed + " couldn't be sent" : ''))).join('; ') + '.' : '';
  if (r.plan.night) return 'Night time in Sydney, so nothing went out. Anything due goes on the first run after 6:30am.' + each;
  const kinds = r.plan.out.filter((n) => !n.quiet).map((n) => (n.welcome ? 'a welcome' : n.test ? 'a test' : n.spend ? (n.keys.length === 1 ? 'a new spend' : 'new spends') : /^sale:/.test(n.key) ? 'a sale day reminder' : n.top ? "the week's top specials" : 'watch-list specials'));
  const what = kinds.filter((k, i) => kinds.indexOf(k) === i);
  return 'Sent ' + r.ok + (r.ok === 1 ? ' pop-up' : ' pop-ups') + (what.length ? ' (' + what.join(', ') + ')' : '') + (r.failed ? ', ' + r.failed + " couldn't be sent" : '') + '.' + each;
}

async function main() {
  const email = process.env.BOT_EMAIL, password = process.env.BOT_PASSWORD;
  if (!email || !password) { console.log("::notice::Phone notifications aren't set up yet. Add the BOT_EMAIL and BOT_PASSWORD secrets."); return; }
  const config = webConfig(await readFile('firebase-config.js', 'utf8').catch(() => ''));
  if (!config.apiKey || !config.projectId) { console.log("::error::Couldn't read the app's Firebase settings from firebase-config.js."); process.exitCode = 1; return; }
  let feed = {};
  try { feed = JSON.parse(await readFile(process.argv[2] || 'deals.json', 'utf8')); } catch (e) { feed = {}; }
  const [owner, repo] = String(process.env.GITHUB_REPOSITORY || '').split('/');
  const site = owner && repo ? 'https://' + owner.toLowerCase() + '.github.io/' + repo + '/' : '';
  const webpush = (await import('web-push')).default;
  const send = async (s, payload, vapid) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload),
        { vapidDetails: { subject: site || 'mailto:noreply@example.com', publicKey: vapid.pub, privateKey: vapid.d }, TTL: 12 * 3600, urgency: 'normal', timeout: SEND_WAIT });
      return { ok: true };
    } catch (e) {
      return { ok: false, status: e && e.statusCode ? e.statusCode : 0 };
    }
  };
  const mode = process.env.NOTIFY_MODE === 'spends' ? 'spends' : 'all';
  try {
    /* One line each, whatever is in it, so nothing in a message can start a GitHub command of its own. */
    const r = await job({ email, password, config, feed, now: new Date(), mode, send, referer: site, log: (m) => console.log('::warning::' + String(m).replace(/[\r\n]+/g, ' ')) });
    console.log('::notice::' + runSummary(r));
    /* A run where no household could be done fails, as one with the single household at the top does. */
    if (r && Array.isArray(r.households) && r.households.every((h) => h.error)) process.exitCode = 1;
  } catch (e) {
    console.log('::error::' + String(e && e.message ? e.message : e).replace(/[\r\n]+/g, ' '));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
