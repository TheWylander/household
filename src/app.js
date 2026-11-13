/* Our household: screens, shared storage and actions. Needs logic.js (window.L). */
(function () {
  'use strict';
  const L = window.L;
  const root = document.getElementById('app');
  const toastEl = document.getElementById('toast');

  /* Colour schemes: the whole app's palette, plus each person's colour options. Filled in at build time from design/schemes.json. */
  const SCHEMES = /*__SCHEMES__*/{};
  /* Your own starting values (names, card, rent). Filled in at build time for the private Claude version only,
     so the public PWA code carries no names or money. */
  const PRESET = /*__PRESET__*/null;
  const SCHEME_KEYS = Object.keys(SCHEMES);
  const COLOUR_KEYS = ['cobalt', 'coral', 'marigold', 'fern'];
  const VAR_MAP = { ground: '--ground', card: '--card', ink: '--ink', ink2: '--ink2', line: '--line', dash: '--dash', input: '--input', track: '--track',
    hi: '--marigold', hiSoft: '--marigold-soft', add: '--coral', errSoft: '--coral-soft', danger: '--coral-deep', ok: '--fern', okSoft: '--fern-soft', focus: '--cobalt' };
  const SUGGESTED = ['Groceries', 'Eating out', 'Date night', 'Home', 'Bills', 'Transport', 'Travel', 'Health', 'Gifts', 'Pets'];

  /* ---------- small helpers ---------- */
  const noop = () => {};
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const today = () => L.ymd(new Date());
  const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const sumAmt = (list) => list.reduce((t, e) => t + (e.amount || 0), 0);
  const ymKey = (y, m) => y + '-' + L.pad(m + 1);
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage off */ } }
  function deepMerge(t, s) {
    Object.keys(s).forEach((k) => {
      const v = s[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) deepMerge(t[k], v);
      else t[k] = clone(v);
    });
    return t;
  }
  function setPath(obj, path, val) {
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = val;
  }
  const centsToStr = (c) => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));

  const ICON = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    del: '<path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z"/><path d="M12 9.5l5 5M17 9.5l-5 5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    duo: '<circle cx="8.5" cy="12" r="5.5"/><circle cx="15.5" cy="12" r="5.5"/>',
    chart: '<path d="M4 20h16"/><path d="M7 16.5V12M12 16.5V6.5M17 16.5V9.5"/>',
    cart: '<path d="M3 4.5h2.4l2.2 10a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.2L20.6 8H6.2"/><circle cx="9.6" cy="19.6" r="1.4"/><circle cx="17" cy="19.6" r="1.4"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2.2H4.4z"/><path d="M10 20.6a2.1 2.1 0 0 0 4 0"/>',
    up: '<path d="M12 19V6M6 11.5 12 5.5l6 6"/>',
    sort: '<path d="M8 19V5M4.5 8.5 8 5l3.5 3.5"/><path d="M16 5v14M12.5 15.5 16 19l3.5-3.5"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.6"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16.5 15 11l-8 8.5"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    tag: '<path d="M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2a1.6 1.6 0 0 1 0 2.2l-6.1 6.1a1.6 1.6 0 0 1-2.2 0z"/><circle cx="8.3" cy="8.3" r="1.6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5"/><circle cx="12" cy="12" r="6.3"/>'
  };
  const icon = (n) => '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[n] + '</svg>';

  /* ---------- update notes ---------- */
  /* Claude's draft note for each update, newest first. Whoever set the app up edits it on a page only they see and
     decides when the other person gets it; edits live in hh/news. The other person sees the newest shown note once,
     or as a few things to try straight after the welcome. */
  const RELEASES = [
    { id: '2026-11-09', date: '2026-11-09', title: 'Insights, profiles, bills coming up and more', items: [
      ['chart', 'Insights.', "How each month is tracking against the budget, where the money goes and your big day of the week. It's in the bottom bar."],
      ['duo', 'Profiles.', 'Add a photo for each of you: the gear on Home, then Profiles.'],
      ['plus', 'Lines with notes.', 'Add a day of spends with + and give each line its own note, like crepes or coffee.'],
      ['star', 'Points balance.', 'Enter the points from a statement and the app keeps a running total.'],
      ['gear', 'Settings.', 'Customise, sharing and your data now live under the gear on Home.'],
      ['cal', 'Coming up.', "Home shows what's due soon: the next rent, bills that come round again like council and water, and any regular bills you add."],
      ['check', 'Tidy categories.', 'In Insights, tap a category to see every spend in it, and move any that belong somewhere else.'],
      ['star', 'Fun fact.', 'A little fact about how we spend, a new one each time you open the app.'],
      ['arrow', 'Swipe through months.', 'Swipe left or right in Insights and the Calendar. Numbers count up and charts grow as each screen opens.'],
      ['tag', 'Deals.', "Deals has its own tab. Everything on special this week is at the top, from Coles, Woolies, Harris Farm, Umall, Liquorland and Meat Emporium (with photos for Harris Farm, Umall and Meat Emporium), with filters by shop and category and the things that are rarely this cheap. On the weekend list (the cart), Check price searches Coles or Woolies for the same thing. Below it, the best deal for each thing on our watch list, then OzBargain."],
      ['cal', 'Sale days.', "Sale days are in the Calendar: marked on the month, with a Keen button on each. Home shows the next one we're keen on, like Lucky Mart's monthly sale, with the address."],
      ['camera', 'Capture a receipt.', "Tap the plus and choose Capture a receipt. The app reads the shop, total and every item. Tap anything that's just one person's, and it adds the spends."],
      ['gear', 'Upload.', 'Bringing in the Westpac statement and Splitwise files has moved to Settings, under Upload. Spends to check still show on Home.'],
      ['cart', 'Weekend shopping list.', "Tap + on any special, or on a match from the watch list, to add it to our list for the weekend shop or put it on the watch list. The list is under the trolley at the top of Deals: tick things off as you go, and add your own."],
      ['bell', 'Phone notifications.', "Turn them on in Settings, under Phone notifications, and your phone pops up when the other of us adds a spend, the evening before a sale day we're keen on, with the top specials each Wednesday morning, and when something on the watch list is on special."],
      ['check', 'Not in the budget.', "When you add a spend, untick Counts towards our monthly budget for one-offs. It still splits, but leaves the month's budget alone."],
      ['duo', 'Loading screen.', 'While the app opens, it shows the other one of us rotating, cut out from their photo.'],
      ['image', 'Specials from screenshots.', "For Coles fresh food, Liquorland or any shop the lists miss: screenshot their specials, then in Deals tap Add specials from screenshots. Gemini reads in each product and price for both of us, and the watch list sees them. Meat and seafood has its own aisle now too."]
    ] }
  ];

  /* How often a regular bill comes round, in days, and how to say it. */
  const EVERY_DAYS = { week: 7, fortnight: 14, month: 30, quarter: 91, half: 182, year: 365 };
  const EVERY_LABEL = { week: 'every week', fortnight: 'every 2 weeks', month: 'every month', quarter: 'every 3 months', half: 'every 6 months', year: 'every year' };

  /* ---------- state ---------- */
  const S = {
    mode: 'loading', db: null, user: null, myId: null, idResolved: false,
    hhLoaded: false, monthsLoaded: false, live: { hh: false, months: false }, slow: false, offline: false,
    settings: null, tab: null, rules: null, months: {}, entries: [], byId: {},
    me: null, readOnly: false,
    view: 'home', cal: null, add: null, tabForm: { amount: '', label: '', payer: null },
    recapOffset: 0, draft: null, draftSaved: false, setup: null, dialog: null,
    insMode: 'month', insYearOff: 0, insSel: null, insDay: null, pace: null, paceOn: false,
    photos: null, photoBusy: null, photoErr: null, newsShown: false, newsDoc: null, newsEdit: null, newsId: null, factN: 0,
    enterKey: null, enterAt: 0, enterDir: 0, enterDirNow: 0, countsShown: {},
    pushDoc: null, pushBusy: false, pushNote: null,
    dealsDoc: null, feed: null, feedAt: 0, feedBusy: false, feedErr: null, dealsFetch: null, spStore: 'all', spAisle: 'all', spSort: 'best', spWatch: false, spQuery: '', spAll: false, ozbAll: false, watchNew: '', listNew: '', aiDoc: null, aiTokNew: '', ghTokNew: '',
    importResult: null, importing: false, pendingRender: false,
    imp: null, impParsed: null, impKey: null, impBad: false,
    whoPick: false, welcomePreview: false, welcomeT: 0
  };
  const knownDocs = {};
  const queues = {};
  let slowTimer = null;

  function defaults() {
    return {
      v: 1,
      names: PRESET && PRESET.names ? clone(PRESET.names) : { a: '', b: '' },
      colours: { a: 'cobalt', b: 'coral' },
      members: { a: null, b: null },
      budget: null, resetDay: 1, splitA: 50,
      categories: [],
      goal: { name: '', target: null, saved: 0 },
      card: PRESET && PRESET.card ? clone(PRESET.card) : { name: '', holder: 'b', program: '', earns: null, rates: null, ratio: 1, rate: null },
      home: { week: true, goal: true, spot: true, recap: true, soon: true, fact: true, sale: true, deals: true }, bills: [], billsHide: [],
      spot: { type: 'note', text: '', date: '' },
      remember: true, scheme: 'warm',
      moves: {},
      budgetSkip: [], cardFrom: '', cardFromWhy: '',
      welcome: { note: '', to: null, seen: '' }, news: { a: '', b: '' }, editor: null,
      rent: PRESET && PRESET.rent ? Object.assign(clone(PRESET.rent), { on: false }) : { on: false, amount: null, from: 'b', day: 0, start: '' },
      createdAt: Date.now()
    };
  }
  function cfg() {
    const d = defaults();
    const s = S.settings && typeof S.settings === 'object' ? S.settings : {};
    const pick = (k) => Object.assign({}, d[k], s[k] && typeof s[k] === 'object' ? s[k] : {});
    const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
    const goal = pick('goal'), card = pick('card'), welcome = pick('welcome'), rent = pick('rent'), news = pick('news');
    return {
      names: pick('names'), colours: pick('colours'), members: pick('members'),
      budget: num(s.budget) && s.budget > 0 ? s.budget : null,
      resetDay: L.clamp(parseInt(s.resetDay, 10) || 1, 1, 28),
      splitA: s.splitA == null ? 50 : L.clamp(s.splitA, 0, 100),
      categories: Array.isArray(s.categories) ? s.categories.filter((c) => typeof c === 'string' && c.trim()).slice(0, 30) : [],
      goal: { name: String(goal.name || ''), target: num(goal.target), saved: num(goal.saved) || 0 },
      card: {
        name: String(card.name || ''), holder: card.holder === 'a' ? 'a' : 'b', program: String(card.program || ''), rate: num(card.rate),
        earns: ['qantas', 'velocity', 'altitude'].indexOf(card.earns) >= 0 ? card.earns : null,
        rates: card.rates && typeof card.rates === 'object' ? { intl: num(card.rates.intl), everyday: num(card.rates.everyday), other: num(card.rates.other), after: num(card.rates.after) } : null,
        ratio: num(card.ratio) || 3,
        pointsBal: num(card.pointsBal) != null && num(card.pointsBal) >= 0 ? Math.round(num(card.pointsBal)) : null,
        pointsAsOf: typeof card.pointsAsOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(card.pointsAsOf) ? card.pointsAsOf : ''
      },
      home: pick('home'), spot: pick('spot'),
      bills: Array.isArray(s.bills) ? s.bills.filter((b) => b && typeof b === 'object' && typeof b.id === 'string' && typeof b.name === 'string' && num(b.amount) > 0 && EVERY_DAYS[b.every] && /^\d{4}-\d{2}-\d{2}$/.test(b.from || ''))
        .slice(0, 30).map((b) => ({ id: b.id.slice(0, 20), name: b.name.slice(0, 40), amount: Math.round(b.amount), every: b.every, from: b.from })) : [],
      billsHide: Array.isArray(s.billsHide) ? s.billsHide.filter((x) => typeof x === 'string').slice(0, 60) : [],
      remember: s.remember !== false,
      scheme: SCHEMES[s.scheme] ? s.scheme : 'warm',
      moves: s.moves && typeof s.moves === 'object' ? s.moves : {},
      budgetSkip: Array.isArray(s.budgetSkip) ? s.budgetSkip.filter((c) => typeof c === 'string') : [],
      cardFrom: typeof s.cardFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.cardFrom) ? s.cardFrom : '',
      cardFromWhy: s.cardFromWhy === 'splitwise' ? 'splitwise' : '',
      news: { a: typeof news.a === 'string' ? news.a.slice(0, 20) : '', b: typeof news.b === 'string' ? news.b.slice(0, 20) : '' },
      editor: s.editor === 'a' || s.editor === 'b' ? s.editor : null,
      welcome: {
        note: typeof welcome.note === 'string' ? welcome.note.slice(0, 400) : '',
        to: welcome.to === 'a' || welcome.to === 'b' ? welcome.to : null,
        seen: typeof welcome.seen === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(welcome.seen) ? welcome.seen : ''
      },
      rent: {
        on: rent.on === true, amount: num(rent.amount) > 0 ? Math.round(rent.amount) : null, from: rent.from === 'a' ? 'a' : 'b',
        day: L.clamp(parseInt(rent.day, 10) || 0, 0, 6), start: /^\d{4}-\d{2}-\d{2}$/.test(rent.start || '') ? rent.start : ''
      }
    };
  }
  const other = (p) => (p === 'a' ? 'b' : 'a');
  const nm = (p) => { const n = String(cfg().names[p] || '').trim(); return n || (p === 'a' ? 'Person one' : 'Person two'); };
  const poss = (n) => n + "'s";
  /* The scheme on screen: a draft being previewed in Customise or setup, otherwise the saved one. */
  function schemeKey() {
    if (S.view === 'custom' && S.draft && SCHEMES[S.draft.scheme] && S.settings && S.me) return S.draft.scheme;
    if (!S.settings && S.setup && SCHEMES[S.setup.scheme]) return S.setup.scheme;
    if (S.settings) return cfg().scheme;
    const ls = lsGet('hh.scheme');
    return SCHEMES[ls] ? ls : 'warm';
  }
  const pal = () => SCHEMES[schemeKey()] || SCHEMES.warm;
  function applyScheme() {
    const k = schemeKey();
    if (k === S.appliedScheme) return;
    const v = (SCHEMES[k] || SCHEMES.warm).vars, st = document.documentElement.style;
    Object.keys(VAR_MAP).forEach((name) => { if (v[name]) st.setProperty(VAR_MAP[name], v[name]); });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', v.ground);
    S.appliedScheme = k;
    if (S.settings) lsSet('hh.scheme', cfg().scheme);
  }
  function schemePicker(act, current) {
    return '<div class="schemes">' + SCHEME_KEYS.map((k) => {
      const sc = SCHEMES[k], v = sc.vars;
      return '<button type="button" class="scheme" data-act="' + act + '" data-arg="' + k + '" aria-pressed="' + (current === k) + '" style="background:' + v.ground + ';color:' + v.ink + '">' +
        '<span class="scheme-dots" aria-hidden="true"><i style="background:' + sc.people.cobalt.main + '"></i><i style="background:' + v.add + '"></i><i style="background:' + v.hi + '"></i></span>' +
        '<span>' + esc(sc.label) + '</span></button>';
    }).join('') + '</div>';
  }
  const colOf = (p) => { const ppl = pal().people; return ppl[cfg().colours[p]] || (p === 'a' ? ppl.cobalt : ppl.coral); };
  const initial = (n) => (String(n).trim().charAt(0) || '?').toUpperCase();
  const holder = () => cfg().card.holder;
  const cardLabel = () => cfg().card.name || 'shared card';
  const programLabel = () => { const c = cfg().card, pr = L.CARD_PRESETS[c.earns]; return (pr && pr.program) || c.program || 'reward'; };
  const curPeriod = () => L.periodFor(today(), cfg().resetDay);
  const spendsIn = (p) => S.entries.filter((e) => L.isSpend(e) && L.inPeriod(e.date, p));
  const pendingAll = () => S.entries.filter((e) => e.kind === 'expense' && e.status === 'check');
  /* What counts towards the monthly budget (L.inBudget): not a category left out in Customise, nor a spend marked as not
     in the budget. Both still count in the balance. */
  const counted = (list) => { const skip = cfg().budgetSkip; return list.filter((e) => L.inBudget(e, skip)); };
  const listNames = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  const dateY = (d) => { const x = L.parseYmd(d); return x.getDate() + ' ' + L.MONTHS[x.getMonth()] + ' ' + x.getFullYear(); };
  function fmtForeign(o) {
    const amt = (Number(o.amount) || 0) / 100, jpy = o.currency === 'JPY';
    const txt = jpy ? '¥' + Math.round(amt).toLocaleString('en-AU') : o.currency + ' ' + amt.toFixed(2);
    return txt + (o.rate ? ' at ' + (jpy ? '¥' : '') + Number(o.rate).toFixed(2) + ' per $1' : '');
  }
  const EARNS_LABEL = { qantas: 'Qantas', velocity: 'Velocity', altitude: 'Altitude' };
  const EARNS_HINT = 'Altitude Qantas Black earns Qantas Points, Altitude Velocity Black earns Velocity Points, and Altitude Rewards Black earns Altitude Points you move to an airline.';
  const earnsSeg = (act, current) => '<div class="seg">' + ['qantas', 'velocity', 'altitude'].map((k) => segBtn(act, k, current === k, EARNS_LABEL[k])).join('') + '</div>';
  function ratesLine(earns, rates, ratio) {
    const pr = L.CARD_PRESETS[earns];
    const r = rates || (pr && pr.rates);
    if (!r) return '';
    return r.intl + ' ' + pr.unit + ' per $1 overseas, ' + r.everyday + ' at supermarkets, department stores, petrol stations and on utilities, ' +
      r.other + ' on everything else (dining included), then ' + r.after + ' after $10,000 in a statement cycle.' + (earns === 'altitude' ? ' ' + (ratio || pr.ratio) + ' Altitude Points move to 1 Velocity Point.' : '');
  }
  const strRates = (r) => ({ intl: String(r.intl), everyday: String(r.everyday), other: String(r.other), after: String(r.after) });
  const meVars = () => { const c = colOf(S.me || 'a'); return '--me:' + c.main + ';--me-soft:' + c.soft; };

  /* ---------- storage ---------- */
  function MemoryDB() {
    const docs = {};
    let subs = [];
    const meta = { fromCache: false, hasPendingWrites: false };
    const parent = (p) => p.slice(0, p.lastIndexOf('/'));
    const snapDoc = (p) => { const d = docs[p]; return { id: p.split('/').pop(), exists: d !== undefined, data: () => clone(d), metadata: meta }; };
    const snapCol = (c) => { const ds = Object.keys(docs).filter((p) => parent(p) === c).sort().map(snapDoc); return { docs: ds, size: ds.length, empty: !ds.length, docChanges: () => [], metadata: meta }; };
    const fire = (s) => setTimeout(() => { if (subs.indexOf(s) >= 0) s.next(s.col ? snapCol(s.path) : snapDoc(s.path)); }, 0);
    const notify = () => subs.forEach(fire);
    const listen = (path, col, next) => { const s = { path, col, next }; subs.push(s); fire(s); return () => { subs = subs.filter((x) => x !== s); }; };
    function docRef(path) {
      return {
        id: path.split('/').pop(), path,
        get: () => Promise.resolve(snapDoc(path)),
        set: (d) => { docs[path] = clone(d); notify(); return Promise.resolve(); },
        update: (d) => {
          if (docs[path] === undefined) return Promise.reject({ code: 'invalid_argument', message: 'No such document' });
          deepMerge(docs[path], d); notify(); return Promise.resolve();
        },
        delete: () => { delete docs[path]; notify(); return Promise.resolve(); },
        onSnapshot: (next) => listen(path, false, next)
      };
    }
    return {
      doc: docRef,
      collection: (path) => ({
        path,
        doc: (id) => docRef(path + '/' + (id || uid('d'))),
        get: () => Promise.resolve(snapCol(path)),
        onSnapshot: (next) => listen(path, true, next)
      })
    };
  }

  /* The same small interface on Firebase Firestore, for the PWA. update merges nested maps like the Claude store does. */
  function FirebaseDB(fs) {
    const meta = (m) => ({ fromCache: !!(m && m.fromCache), hasPendingWrites: !!(m && m.hasPendingWrites) });
    const fail = (e) => {
      const c = String((e && e.code) || '').replace(/^firestore\//, '');
      const code = { 'permission-denied': 'invalid_argument', 'unauthenticated': 'revoked', 'unavailable': 'unavailable', 'resource-exhausted': 'resource_exhausted', 'invalid-argument': 'invalid_argument' }[c] || c || 'unknown';
      return { code, message: e && e.message, denied: c === 'permission-denied', fromSet: c === 'permission-denied' };
    };
    const plain = (d) => JSON.parse(JSON.stringify(d));
    const snap = (s) => ({ id: s.id, exists: !!s.exists, data: () => s.data(), metadata: meta(s.metadata) });
    const many = (q) => ({ docs: q.docs.map(snap), size: q.size, empty: q.empty, metadata: meta(q.metadata) });
    function docRef(path) {
      const ref = fs.doc(path);
      return {
        id: ref.id, path,
        get: () => ref.get().then(snap, (e) => Promise.reject(fail(e))),
        set: (d) => ref.set(plain(d)).catch((e) => Promise.reject(fail(e))),
        update: (d) => ref.set(plain(d), { merge: true }).catch((e) => Promise.reject(fail(e))),
        delete: () => ref.delete().catch((e) => Promise.reject(fail(e))),
        onSnapshot: (next, error) => ref.onSnapshot((s) => next(snap(s)), (e) => { if (error) error(fail(e)); })
      };
    }
    return {
      doc: docRef,
      collection: (path) => ({
        path,
        doc: (id) => docRef(path + '/' + (id || uid('d'))),
        get: () => fs.collection(path).get().then(many, (e) => Promise.reject(fail(e))),
        onSnapshot: (next, error) => fs.collection(path).onSnapshot((q) => next(many(q)), (e) => { if (error) error(fail(e)); })
      })
    };
  }

  /* One write at a time per document, in order. Resolves true when saved. */
  function enqueue(path, task) {
    if (S.readOnly) { toast("Changes can't be saved from this account."); return Promise.resolve(false); }
    const run = () => task(S.db.doc(path));
    const p = (queues[path] || Promise.resolve())
      .then(() => run().catch((e) => {
        if (e && e.code === 'unavailable') return delay(300 + Math.random() * 600).then(run);
        throw e;
      }))
      .then(() => true, (e) => { handleWriteError(e); return false; });
    queues[path] = p;
    return p;
  }
  function doSet(ref, data) {
    return ref.set(data).catch((e) => { throw { code: e && e.code, message: e && e.message, fromSet: true }; });
  }
  /* Merge into a document, creating it from base if it is not there yet. */
  function upsert(path, patch, base) {
    return enqueue(path, (ref) => {
      if (knownDocs[path]) return ref.update(patch);
      return ref.get().then((snap) => {
        if (snap.exists) { knownDocs[path] = true; return ref.update(patch); }
        return doSet(ref, deepMerge(clone(base || {}), patch)).then(() => { knownDocs[path] = true; });
      });
    });
  }
  function handleWriteError(e) {
    const code = e && e.code;
    if (code === 'invalid_argument' && e.fromSet) { S.readOnly = 'rules'; render(); toast("Changes can't be saved from this account."); return; }
    if (code === 'revoked' || code === 'not_granted' || code === 'capability_disabled' || code === 'capability_removed') { S.readOnly = 'off'; render(); toast("Changes can't be saved right now."); return; }
    if (code === 'quota_exceeded') { toast("Couldn't save: the app's storage is full."); return; }
    if (code === 'resource_exhausted') { toast('Too many changes at once. Wait a moment, then try again.'); return; }
    toast("Couldn't save that. Check your connection and try again.");
  }
  const putEntries = (ym, map) => upsert('months/' + ym, { entries: map }, { month: ym, entries: {} });

  /* ---------- entries ---------- */
  function makeEntry(o) {
    const C = cfg();
    const amount = Math.round(o.amount);
    const splitA = o.splitA == null ? C.splitA : L.clamp(o.splitA, 0, 100);
    let paid = { a: 0, b: 0 }, owed;
    if (o.kind === 'settlement') {
      paid[o.from] = amount; owed = { a: 0, b: 0 }; owed[o.to] = amount;
    } else if (o.kind === 'rent') {
      paid[o.to] = amount; owed = { a: 0, b: 0 }; owed[o.from] = amount;
    } else {
      owed = L.splitOwed(amount, splitA, o.id);
      if (o.paid) paid = { a: o.paid.a || 0, b: o.paid.b || 0 };
      else if (o.payer === 'both') paid = { a: owed.a, b: owed.b };
      else paid[o.payer === 'a' ? 'a' : 'b'] = amount;
    }
    return {
      id: o.id, kind: o.kind || 'expense', source: o.source || 'manual', status: o.status || 'shared',
      date: o.date, title: String(o.title || '').slice(0, 80), raw: o.raw || null, key: o.key || null,
      amount, items: o.items && o.items.length > 1 ? o.items.slice(0, 50) : null,
      notes: o.notes && o.items && o.items.length > 1 && o.notes.length === o.items.length && o.notes.some(Boolean) ? o.notes.slice(0, 50).map((n) => String(n || '').slice(0, 60)) : null,
      parts: o.parts && o.parts.length ? o.parts : null,
      payer: o.kind === 'settlement' || o.kind === 'rent' ? o.from : (o.payer || null), splitA, paid, owed, onCard: !!o.onCard, offBudget: !!o.offBudget,
      category: o.kind === 'settlement' ? null : o.kind === 'rent' ? 'Rent' : (o.category || 'Other'), dupOf: o.dupOf || null, orig: o.orig || null,
      createdAt: o.createdAt || Date.now(), updatedAt: Date.now(), by: o.by || S.me || null
    };
  }
  /* ---------- weekly rent ---------- */
  /* Rent goes on by itself each week. Every week has a fixed id, so both phones add the same entry and a week
     someone removed stays removed. It waits for live data, so a cached copy never adds a week twice. */
  const rentSent = {};
  function ensureRent() {
    if (!S.settings || !S.me || S.readOnly || S.offline || !(S.live.hh && S.live.months)) return;
    const R = cfg().rent;
    if (!R.on || !R.amount || !R.start) return;
    const byYm = {};
    L.weeklyDates(R.start, R.day, today()).forEach((d) => {
      const id = 'rent-' + d;
      if (S.byId[id] || rentSent[id]) return;
      rentSent[id] = true;
      (byYm[d.slice(0, 7)] = byYm[d.slice(0, 7)] || {})[id] = makeEntry({ id, kind: 'rent', source: 'rent', status: 'shared', date: d, title: 'Rent', amount: R.amount, from: R.from, to: other(R.from) });
    });
    Object.keys(byYm).sort().forEach((ym) => putEntries(ym, byYm[ym]));
  }
  function rebuild() {
    const byId = {};
    Object.keys(S.months).sort().forEach((ym) => {
      const ents = (S.months[ym] && S.months[ym].entries) || {};
      Object.keys(ents).forEach((id) => {
        const e = ents[id];
        const ok = e && typeof e === 'object' && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && typeof e.amount === 'number' && e.amount > 0;
        if (byId[id] && byId[id].e && !ok) return;
        byId[id] = { ym, e: ok ? Object.assign({}, e, { id }) : null };
      });
    });
    S.byId = byId;
    S.entries = Object.keys(byId).map((id) => byId[id].e).filter(Boolean);
  }
  function payerOf(e) {
    if (['a', 'b', 'both', 'mixed'].indexOf(e.payer) >= 0) return e.payer;
    const p = e.paid || {};
    if (p.a && p.b) return 'both';
    return p.a ? 'a' : 'b';
  }
  function balance() {
    const n = L.netBalances(S.entries), me = S.me || 'a', v = n[me];
    if (Math.abs(v) < 1) return { state: 'square' };
    return v < 0 ? { state: 'owe', amount: -v, from: me, to: other(me) } : { state: 'owed', amount: v, from: other(me), to: me };
  }

  /* ---------- startup ---------- */
  function boot() {
    S.factN = (Number(lsGet('hh.factN')) || 0) + 1; lsSet('hh.factN', String(S.factN));
    try { S.feed = cleanFeed(JSON.parse(lsGet('hh.deals') || 'null')); } catch (e) { S.feed = null; }
    /* A tapped notification opens Deals, or a sale day's pop-up the Calendar on that day. */
    const calHash = /^#cal=(\d{4}-\d{2}-\d{2})$/.exec(location.hash || '');
    if (location.hash === '#deals' || calHash) {
      S.view = calHash ? 'cal' : 'deals';
      if (calHash) initCal(calHash[1]);
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* fine either way */ }
    }
    setTimeout(() => loadFeed(), 1200);
    render();
    slowTimer = setTimeout(() => { if (!(S.live.hh && S.live.months)) { S.slow = true; safeRender(); } }, 10000);
    const c = window.claude;
    if (!c || typeof c.use !== 'function') { if (fbConfig()) startFirebase(); else startPreview(); return; }
    Promise.resolve(c.use('db')).then((db) => {
      if (!db) { startPreview(); return; }
      S.db = db; S.mode = 'db';
      Promise.resolve(c.use('user')).then((u) => {
        S.user = u || null;
        if (!u) return null;
        Promise.resolve(typeof u.can === 'function' ? u.can('data.write') : null)
          .then((v) => { if (v === false && !S.readOnly) { S.readOnly = 'rules'; safeRender(); } }, noop);
        return Promise.resolve(typeof u.id === 'function' ? u.id() : null).then((id) => { S.myId = id || null; }, noop);
      }, noop).then(() => { S.idResolved = true; resolveMe(); ensureRent(); safeRender(); });
      subHH(); subMonths();
    }, startPreview);
  }
  /* Hosted on its own as a PWA: Firebase keeps the shared data and each of you signs in with an email and password. */
  function fbConfig() {
    const c = window.HH_FIREBASE;
    return c && typeof c === 'object' && c.apiKey && c.projectId && !/PASTE|YOUR_/i.test(String(c.apiKey) + c.projectId) ? c : null;
  }
  function startFirebase() {
    S.mode = 'firebase';
    const fb = window.firebase;
    if (!fb || typeof fb.initializeApp !== 'function') { S.fbMissing = true; render(); return; }
    try { if (!fb.apps.length) fb.initializeApp(fbConfig()); S.auth = fb.auth(); } catch (e) { S.fbMissing = true; render(); return; }
    S.auth.onAuthStateChanged((u) => {
      S.authUser = u || null; S.authReady = true;
      if (!u) splashSet(null);
      if (u && u.emailVerified && !S.db) {
        S.db = FirebaseDB(fb.firestore()); S.myId = u.uid; S.idResolved = true;
        subHH(); subMonths();
      }
      safeRender();
    });
  }
  function startPreview() {
    if (S.mode === 'db' || S.mode === 'preview') return;
    S.mode = 'preview'; S.db = MemoryDB(); S.idResolved = true;
    subHH(); subMonths();
  }
  function markLive(which, snap) {
    if (snap && snap.metadata && snap.metadata.fromCache) return;
    S.live[which] = true;
    if (S.live.hh && S.live.months) { S.slow = false; clearTimeout(slowTimer); }
  }
  const retried = {};
  function subError(which, e, again) {
    S.hhLoaded = true; S.monthsLoaded = true;
    if (e && e.denied) { S.denied = true; safeRender(); return; }
    if (e && e.code === 'unavailable' && !retried[which]) { retried[which] = true; setTimeout(again, 3000); }
    else S.offline = true;
    safeRender();
  }
  /* Firestore can answer first from an empty local cache. Treating that as "nothing saved" would show setup again,
     so wait for the server's answer instead. */
  const waitForServer = (snap) => S.mode === 'firebase' && !!(snap && snap.metadata && snap.metadata.fromCache) && !(snap.docs && snap.docs.length);
  function subHH() {
    S.db.collection('hh').onSnapshot((snap) => {
      if (waitForServer(snap)) return;
      const got = {};
      snap.docs.forEach((d) => { if (d.exists) { got[d.id] = d.data(); knownDocs['hh/' + d.id] = true; } });
      S.settings = got.settings && typeof got.settings === 'object' ? got.settings : null;
      S.tab = got.tab && typeof got.tab === 'object' ? got.tab : null;
      S.rules = got.rules && typeof got.rules === 'object' ? got.rules : null;
      S.imp = got.import && typeof got.import === 'object' ? got.import : null;
      S.photos = got.photos && typeof got.photos === 'object' ? got.photos : null;
      S.newsDoc = got.news && typeof got.news === 'object' ? got.news : null;
      S.dealsDoc = got.deals && typeof got.deals === 'object' ? got.deals : null;
      S.pushDoc = got.push && typeof got.push === 'object' ? got.push : null;
      S.aiDoc = got.ai && typeof got.ai === 'object' ? got.ai : null;
      applyPhotos();
      parseStaged();
      S.hhLoaded = true; S.offline = false;
      markLive('hh', snap); resolveMe(); ensureRent(); ensureEditor(); pushCheck(); refreshDeals(); updateSplash(); safeRender();
    }, (e) => subError('hh', e, subHH));
  }
  function subMonths() {
    S.db.collection('months').onSnapshot((snap) => {
      if (waitForServer(snap)) return;
      const m = {};
      snap.docs.forEach((d) => { if (d.exists) { m[d.id] = d.data(); knownDocs['months/' + d.id] = true; } });
      S.months = m; S.monthsLoaded = true; S.offline = false;
      rebuild(); markLive('months', snap); ensureRent(); safeRender();
    }, (e) => subError('months', e, subMonths));
  }
  /* Staged Splitwise files carry a fingerprint of the original export; a copy that doesn't match is not used. */
  const normText = (t) => String(t).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  function parseStaged() {
    const imp = S.imp;
    if (!imp || imp.status !== 'ready' || !Array.isArray(imp.files)) { S.impParsed = null; S.impKey = null; S.impBad = false; return; }
    const key = String(imp.createdAt) + ':' + imp.files.length;
    if (key === S.impKey) {
      if (S.impParsed) { S.impParsed.rates = imp.rates && typeof imp.rates === 'object' ? imp.rates : {}; S.impParsed.rateNote = String(imp.rateNote || '').slice(0, 120); }
      return;
    }
    S.impKey = key;
    const groups = [];
    let bad = false;
    imp.files.forEach((f) => {
      const text = String((f && f.text) || '');
      if (f && f.check && L.hash(normText(text)) !== f.check) { bad = true; return; }
      const g = L.parseSplitwise(L.parseCSV(text));
      if (g.error) bad = true; else groups.push(g);
    });
    S.impBad = bad;
    S.impParsed = !bad && groups.length ? { groups, rates: imp.rates && typeof imp.rates === 'object' ? imp.rates : {}, rateNote: String(imp.rateNote || '').slice(0, 120) } : null;
  }
  function resolveMe() {
    if (!S.idResolved || !S.settings) return;
    const m = cfg().members;
    if (S.myId) {
      S.me = m.a === S.myId ? 'a' : m.b === S.myId ? 'b' : null;
    } else {
      const ls = lsGet('hh.me');
      S.me = ls === 'a' || ls === 'b' ? ls : null;
    }
  }
  function claim(slot) {
    if (slot !== 'a' && slot !== 'b') return;
    S.me = slot; lsSet('hh.me', slot);
    updateSplash();
    if (S.myId && S.settings && !S.readOnly) {
      const m = cfg().members, patch = {};
      patch[slot] = S.myId;
      if (m[other(slot)] === S.myId) patch[other(slot)] = null;
      upsert('hh/settings', { members: patch }, defaults());
    }
    ensureRent();
    if (S.view === 'custom' && S.draft) { /* keep draft */ }
    render();
  }

  /* ---------- rendering ---------- */
  function focusKey() {
    const a = document.activeElement;
    if (!a || a === document.body || !root.contains(a)) return null;
    if (a.id) return '#' + CSS.escape(a.id);
    const act = a.getAttribute('data-act');
    if (!act) return null;
    const arg = a.getAttribute('data-arg');
    return '[data-act="' + CSS.escape(act) + '"]' + (arg != null ? '[data-arg="' + CSS.escape(arg) + '"]' : '');
  }
  function buildHtml() {
    const ready = S.hhLoaded && S.monthsLoaded && S.idResolved;
    const bn = '<div data-live="banners">' + banners() + '</div>';
    if (S.mode === 'firebase') { const gate = authGate(); if (gate) return bn + gate + dialogHtml(); }
    if (!ready) return viewLoading();
    if (!S.settings) return bn + (S.readOnly ? viewNotSetUp() : viewSetup()) + dialogHtml();
    if (!S.me) { const w = welcomeFor(); return bn + (w ? viewWelcome(w, false) : viewWho()) + dialogHtml(); }
    if (S.welcomePreview) return bn + viewWelcome(other(S.me), true) + dialogHtml();
    if (!S.dialog && !S.newsShown && !S.readOnly && S.view === 'home' && S.live.hh) {
      const due = newsDue();
      if (due) { S.newsShown = true; S.dialog = { type: 'news', id: due.id }; }
    }
    const nav = ['home', 'cal', 'deals', 'insights', 'settings', 'upload', 'custom', 'profile', 'newsedit', 'recap', 'tab'].indexOf(S.view) >= 0;
    const sw = S.view === 'insights' || S.view === 'recap' ? (S.insMode === 'year' ? 'insyear' : 'recapmove') : S.view === 'cal' ? 'calmove' : '';
    return bn + '<main class="main' + (nav ? '' : ' no-nav') + '" style="' + meVars() + '"' + (sw ? ' data-swipe="' + sw + '"' : '') + '>' + viewFor(S.view) + '</main>' +
      (nav ? '<div data-live="nav">' + navBar() + '</div>' : '') + dialogHtml();
  }
  /* While someone types, refresh only the marked live regions that don't hold the field in use. */
  function patchLive(active) {
    const regions = root.querySelectorAll('[data-live]');
    if (!regions.length) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = buildHtml();
    regions.forEach((el) => {
      if (el.contains(active)) return;
      const fresh = tmp.querySelector('[data-live="' + el.getAttribute('data-live') + '"]');
      if (fresh) el.replaceWith(fresh);
    });
  }
  let shownWelcome = null;
  function render() {
    const key = focusKey();
    applyScheme();
    const html = buildHtml();
    S.pendingRender = false;
    /* An unchanged welcome page is left alone, so data arriving doesn't restart its entrance. */
    if (shownWelcome !== null && html === shownWelcome && root.querySelector('.welcome')) return;
    shownWelcome = html.indexOf('<div class="welcome') >= 0 ? html : null;
    const sk = screenKey(), now = performance.now();
    if (sk !== S.enterKey) { S.enterKey = sk; S.enterAt = now; S.enterDirNow = S.enterDir; }
    S.enterDir = 0;
    const since = now - S.enterAt, entering = sk !== 'pre' && since < 1400 && !reduceMotion();
    root.classList.toggle('enter', entering);
    root.classList.toggle('from-r', entering && S.enterDirNow > 0);
    root.classList.toggle('from-l', entering && S.enterDirNow < 0);
    root.style.setProperty('--enter', (entering ? -Math.round(since) : 0) + 'ms');
    root.innerHTML = html;
    runCounts();
    if (S.dialog && !S.dialog.focused) {
      S.dialog.focused = true;
      const f = root.querySelector('.dialog input:not([type="file"]), .dialog textarea') || root.querySelector('.dialog .btn-primary, .dialog .btn-danger');
      if (f) f.focus();
    } else if (key) {
      /* Not a drop-down: on iPhone, focusing one opens its picker again straight after you've picked. */
      const el = root.querySelector(key);
      if (el && el.tagName !== 'SELECT') el.focus({ preventScroll: true });
    }
  }
  /* ---------- motion ---------- */
  /* Each screen plays its entrance once. A redraw from syncing data keeps --enter at minus the time since the screen
     opened, so animations carry on from where they were instead of starting again. Numbers count from what you last
     saw to the new value, so coming back to Home after adding a spend shows the change. Reduced motion turns it all off. */
  const reduceMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  function screenKey() {
    if (!S.settings || !S.me || S.welcomePreview) return 'pre';
    let k = S.view === 'recap' ? 'insights' : S.view;
    if (k === 'insights') k += '|' + S.insMode + '|' + S.recapOffset + '|' + S.insYearOff;
    if (k === 'cal' && S.cal) k += '|' + S.cal.y + '-' + S.cal.m;
    return k;
  }
  let countRaf = 0;
  function runCounts() {
    cancelAnimationFrame(countRaf);
    const jobs = Array.from(root.querySelectorAll('[data-count]')).map((el) => {
      const to = Number(el.getAttribute('data-count')) || 0, key = el.getAttribute('data-ck') || '';
      return { el, to, key, from: Object.prototype.hasOwnProperty.call(S.countsShown, key) ? S.countsShown[key] : 0, fmt: el.getAttribute('data-fmt') === 'c' ? L.fmt : L.fmtRound };
    });
    if (!jobs.length) return;
    if (!root.classList.contains('enter')) { jobs.forEach((j) => { S.countsShown[j.key] = j.to; }); return; }
    const step = () => {
      const p = Math.min(1, (performance.now() - S.enterAt) / 850), k = 1 - Math.pow(1 - p, 3);
      jobs.forEach((j) => { if (j.from !== j.to && j.el.isConnected) j.el.textContent = j.fmt(Math.round(j.from + (j.to - j.from) * k)); });
      if (p < 1) countRaf = requestAnimationFrame(step);
      else jobs.forEach((j) => { S.countsShown[j.key] = j.to; });
    };
    step();
  }
  /* Swipe sideways to change month (or year) in Insights and the Calendar. Charts and fields keep their own touch. */
  let swipe = null;
  document.addEventListener('pointerdown', (ev) => {
    swipe = null;
    if (ev.pointerType !== 'touch' || !ev.target.closest) return;
    const z = ev.target.closest('[data-swipe]');
    if (!z || !root.contains(z) || ev.target.closest('.pace, .cols-plot, input, textarea, select, .dialog, .specials')) return;
    swipe = { x: ev.clientX, y: ev.clientY, t: Date.now(), act: z.getAttribute('data-swipe') };
  });
  document.addEventListener('pointerup', (ev) => {
    const s = swipe;
    swipe = null;
    if (!s || ev.pointerType !== 'touch') return;
    const dx = ev.clientX - s.x, dy = ev.clientY - s.y;
    if (Math.abs(dx) < 60 || Math.abs(dy) > 45 || Date.now() - s.t > 800) return;
    const fn = ACT[s.act];
    if (fn) fn(dx < 0 ? '1' : '-1');
  });
  document.addEventListener('pointercancel', () => { swipe = null; });

  /* Re-render for data that arrived on its own. Waits while someone is typing or pressing,
     so a live update never swaps a button out from under a tap. */
  let pointerDown = false;
  function safeRender() {
    if (pointerDown) { S.pendingRender = true; setTimeout(flushPending, 60); return; }
    const a = document.activeElement;
    if (a && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'file' && a.type !== 'date') {
      S.pendingRender = true; patchLive(a); return;
    }
    render();
  }
  function flushPending() {
    if (!S.pendingRender) return;
    if (pointerDown) { setTimeout(flushPending, 60); return; }
    safeRender();
  }
  function viewFor(v) {
    switch (v) {
      case 'cal': return viewCal();
      case 'deals': return dealsView();
      case 'add': return S.add ? viewAdd() : viewHome();
      case 'tab': return viewTab();
      case 'upload': return viewUpload();
      case 'recap':
      case 'insights': return viewInsights();
      case 'settings': return viewSettings();
      case 'profile': return viewProfile();
      case 'newsedit': return viewNewsEdit();
      case 'custom': return viewCustom();
      default: return viewHome();
    }
  }
  function banners() {
    let b = '';
    if (S.mode === 'preview') b += '<div class="banner">Preview only. Nothing here is saved. ' + (window.HH_FIREBASE ? 'Add your Firebase settings to firebase-config.js to save and share.' : 'Open the published app to save and share.') + '</div>';
    if (S.readOnly === 'rules') b += '<div class="banner ro">' + (S.mode === 'firebase' ? 'This login can look, but changes won\'t save.' : 'You can look, but changes won\'t save from this account. Ask whoever shared this to make you an Editor.') + '</div>';
    if (S.readOnly === 'off') b += '<div class="banner ro">Changes can\'t be saved right now.</div>';
    if (S.offline) b += '<div class="banner">Your data can\'t be reached right now. What you see may be out of date.</div>';
    else if (S.slow) b += '<div class="banner">Still connecting. What you see may be out of date.</div>';
    return b;
  }
  function av(p, small) {
    const cls = 'av' + (small === 'xl' ? ' xl' : small ? ' sm' : '');
    if (p === 'both' || p === 'mixed') return '<span class="' + cls + ' av-duo" aria-hidden="true"><i style="background:' + colOf('a').main + '"></i><i style="background:' + colOf('b').main + '"></i></span>';
    const c = colOf(p), ph = hasPhoto(p);
    return '<span class="' + cls + (ph ? ' ph ph-' + p : '') + '" style="background-color:' + c.main + ';color:' + c.on + '" aria-hidden="true">' + (ph ? '' : esc(initial(nm(p)))) + '</span>';
  }
  const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
  const hasPhoto = (p) => !!(S.photos && typeof S.photos[p] === 'string' && S.photos[p].length < 80000 && PHOTO_RE.test(S.photos[p]));
  let photoCss = null;
  function applyPhotos() {
    const css = ['a', 'b'].filter(hasPhoto).map((p) => '.av.ph-' + p + '{background-image:url("' + S.photos[p] + '")}').join('');
    if (css === photoCss) return;
    photoCss = css;
    let el = document.getElementById('hhPhotos');
    if (!el) { el = document.createElement('style'); el.id = 'hhPhotos'; document.head.appendChild(el); }
    el.textContent = css;
  }
  /* A square from the middle of the photo, 192px, as a small JPEG: a few KB, so it fits in the shared data. */
  function readPhoto(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type || 'image/')) { reject(new Error('type')); return; }
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h);
        if (!side) { URL.revokeObjectURL(url); reject(new Error('empty')); return; }
        const c = document.createElement('canvas');
        c.width = c.height = 192;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 192, 192);
        URL.revokeObjectURL(url);
        let q = 0.82, out = c.toDataURL('image/jpeg', q);
        while (out.length > 30000 && q > 0.4) { q -= 0.12; out = c.toDataURL('image/jpeg', q); }
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }
  function segBtn(act, val, pressed, label, person) {
    let style = '';
    if (pressed && person) { const c = colOf(person); style = ' style="background:' + c.main + ';color:' + c.on + '"'; }
    return '<button type="button" data-act="' + act + '" data-arg="' + esc(val) + '" aria-pressed="' + (pressed ? 'true' : 'false') + '"' + style + '>' + esc(label) + '</button>';
  }
  function navBar() {
    const item = (v, ic, label, extra) => '<button class="nav-i' + (S.view === v ? ' on' : '') + '" data-act="go" data-arg="' + v + '"' + (S.view === v ? ' aria-current="page"' : '') + '>' + icon(ic) + '<span>' + label + '</span>' + (extra || '') + '</button>';
    const fresh = notices().some((x) => x.kind === 'sp');
    return '<nav class="nav" aria-label="Main">' + item('home', 'home', 'Home') + item('cal', 'cal', 'Calendar') +
      (S.readOnly ? '' : snapReady() ? '<button class="nav-add" data-act="addpick" aria-label="Add a spend or capture a receipt">' + icon('plus') + '</button>'
        : '<button class="nav-add" data-act="add" aria-label="Add a spend">' + icon('plus') + '</button>') +
      item('deals', 'tag', 'Deals', fresh ? '<span class="dot-badge" aria-hidden="true"></span><span class="sr">, new specials</span>' : '') +
      item('insights', 'chart', 'Insights') + '</nav>';
  }
  /* While it opens: the other one of us rotating, or the blob before there's a photo. Each redraw picks the turn up
     where it was rather than starting it again. The picture fits a circle the box can hold, so it never pokes out as it
     goes round, and its shadow stays underneath. */
  function viewLoading() {
    const sp = splashGet();
    const pic = sp ? '<div class="twirl' + (sp.cut ? ' cut' : '') + '" aria-hidden="true"><div class="twirl-turn" style="animation-delay:-' + Math.round(performance.now() % TWIRL_MS) + 'ms">' +
      '<img class="twirl-pic" src="' + esc(sp.src) + '" alt=""></div></div>' : '<div class="blob" aria-hidden="true"></div>';
    return '<div class="loading">' + pic + '<p class="title sm">Opening your household</p>' +
      (S.slow ? '<p class="muted">This is taking a while. Check your connection.</p>' : '<p class="muted">Just a moment</p>') + '</div>';
  }
  /* ---------- the loading screen's photo ---------- */
  /* The loading screen shows the other one of us: each phone shows the other person. It shows before sign-in
     and the data, so each phone keeps the picture in its own storage: the other one's photo straight away, then a
     cut-out of just them once the phone has made one. It's kept with a fingerprint of the photo, so a new photo is
     picked up, and cleared on signing out. */
  const SPLASH = 'hh.splash', SPLASH_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, TWIRL_MS = 2200;
  function splashGet() {
    try {
      const v = JSON.parse(lsGet(SPLASH) || 'null');
      return v && (v.p === 'a' || v.p === 'b') && typeof v.src === 'string' && v.src.length < 400000 && SPLASH_RE.test(v.src) ? v : null;
    } catch (e) { return null; }
  }
  const splashSet = (v) => lsSet(SPLASH, v ? JSON.stringify(v) : '');
  /* A short fingerprint of a photo, to tell when it changes. */
  function printOf(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + s.length.toString(36);
  }
  let splashKey = '', cutting = false;
  function updateSplash() {
    if (S.mode !== 'firebase' || !S.hhLoaded || (S.me !== 'a' && S.me !== 'b')) return;
    const o = other(S.me), url = hasPhoto(o) ? S.photos[o] : '', h = url ? printOf(url) : '';
    if (o + h === splashKey) return;
    splashKey = o + h;
    if (!url) { splashSet(null); return; }
    let sp = splashGet();
    if (!sp || sp.p !== o || sp.h !== h) { sp = { p: o, h, src: url, cut: false, tries: 0, at: 0 }; splashSet(sp); }
    /* A cut-out that didn't work is tried again a day later, three times at most. Nobody found in the photo won't change, so that's it for that photo. */
    if (sp.cut || cutting || sp.tries >= 3 || Date.now() - (sp.at || 0) < 864e5) return;
    cutting = true;
    setTimeout(() => cutOut(url).then((png) => {
      const now = splashGet();
      if (now && now.h === h) splashSet({ p: o, h, src: png, cut: true });
    }, (e) => {
      const now = splashGet();
      if (now && now.h === h) splashSet(Object.assign(now, { tries: e && e.message === 'nobody' ? 3 : (now.tries || 0) + 1, at: Date.now() }));
    }).then(() => { cutting = false; }), window.HH_CUTOUT_WAIT != null ? Number(window.HH_CUTOUT_WAIT) : 3000);
  }
  /* Finds the person in a photo on this phone, so the photo never leaves it: Google's MediaPipe, fetched from a CDN only
     when a cut-out is needed (a new photo), gives how sure it is that each pixel is the person. Tests swap in window.HH_CUTOUT. */
  const MP_LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2';
  const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
  function personMask(img) {
    if (typeof window.HH_CUTOUT === 'function') return Promise.resolve().then(() => window.HH_CUTOUT(img));
    return import(MP_LIB + '/vision_bundle.mjs')
      .then((v) => v.FilesetResolver.forVisionTasks(MP_LIB + '/wasm').then((files) => v.ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: MP_MODEL, delegate: 'CPU' }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false })))
      .then((seg) => {
        try {
          /* Two masks come back, the background's then the person's. */
          const r = seg.segment(img), ms = r.confidenceMasks || [], m = ms[ms.length > 1 ? 1 : 0];
          const out = m ? { w: m.width, h: m.height, data: Float32Array.from(m.getAsFloat32Array()) } : null;
          r.close();
          return out;
        } finally { seg.close(); }
      });
  }
  /* The photo with everything but the person see-through, a soft edge, and cropped to them with a little room. */
  function cutOut(url) {
    return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('image')); img.src = url; })
      .then((img) => personMask(img).then((mk) => {
        if (!mk || !(mk.w > 0) || !(mk.h > 0) || !mk.data || mk.data.length < mk.w * mk.h) throw new Error('nobody');
        const W = img.naturalWidth, H = img.naturalHeight, c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const px = g.getImageData(0, 0, W, H), d = px.data, a = new Float32Array(W * H);
        const at = (x, y) => mk.data[Math.min(mk.h - 1, Math.floor(y * mk.h / H)) * mk.w + Math.min(mk.w - 1, Math.floor(x * mk.w / W))];
        /* In case a mask comes back the other way round: the top corners of a portrait are background. */
        const flip = (at(1, 1) + at(W - 2, 1)) / 2 > at(W >> 1, Math.round(H * 0.6));
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = flip ? 1 - at(x, y) : at(x, y); a[y * W + x] = Math.min(1, Math.max(0, (v - 0.3) / 0.4)); }
        let n = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          let t = 0, k = 0;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < W && yy < H) { t += a[yy * W + xx]; k++; } }
          const v = t / k;
          d[(y * W + x) * 4 + 3] = Math.round(v * 255);
          if (v > 0.5) n++;
          if (v > 0.1) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        }
        /* Hardly any of it a person, or nearly all of it: that's not a cut-out, so the round photo stays. */
        if (n < W * H * 0.04 || n > W * H * 0.97) throw new Error('nobody');
        g.putImageData(px, 0, 0);
        const pad = Math.round(Math.max(W, H) * 0.05);
        x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
        const o = document.createElement('canvas');
        o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
        o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
        const png = o.toDataURL('image/png');
        if (!SPLASH_RE.test(png) || png.length >= 400000) throw new Error('size');
        return png;
      }));
  }
  function viewNotSetUp() {
    return '<div class="setup"><h1>Not set up yet</h1><p class="lead">Once this is set up, your shared spends will show here.</p></div>';
  }

  /* ---------- home ---------- */
  function viewHome() {
    const C = cfg(), t = today(), p = curPeriod(), all = spendsIn(p), bt = L.budgetTotals(all, C.budgetSkip), spent = C.budget ? bt.towards : bt.all;
    const daysLeft = L.daysBetweenInclusive(t, p.end);
    let hero;
    if (C.budget) {
      const left = C.budget - spent, over = left < 0, pct = Math.min(100, Math.round(spent / C.budget * 100));
      const perDay = !over && daysLeft > 0 ? Math.floor(left / daysLeft / 100) * 100 : 0;
      hero = '<section class="hero" aria-label="Budget">' +
        '<span class="blob" aria-hidden="true"></span>' +
        '<p class="hero-k">' + (over ? 'Over budget by' : 'Left to spend') + '</p>' +
        '<p class="hero-v' + (over ? ' over' : '') + '" data-count="' + Math.abs(left) + '" data-ck="home-left">' + L.fmtRound(Math.abs(left)) + '</p>' +
        '<p class="hero-sub">Spent ' + L.fmt(spent) + ' of ' + L.fmtRound(C.budget) + (C.budgetSkip.length ? '<span class="hint" style="display:block;margin-top:2px">Not counting ' + esc(listNames(C.budgetSkip)) + '</span>' : '') +
          (bt.marked ? '<span class="hint" style="display:block;margin-top:2px">+ ' + L.fmt(bt.marked) + ' not in the budget</span>' : '') + '</p>' +
        '<div class="meter" role="img" aria-label="' + pct + ' percent of the budget spent"><span style="width:' + pct + '%"></span></div>' +
        '<div class="hero-foot"><span class="sticker' + (over ? ' coral' : '') + '">' + (over ? 'Over budget' : 'About ' + L.fmtRound(perDay) + ' a day') + '</span>' +
        '<span class="muted">' + (daysLeft === 1 ? 'Last day' : daysLeft + ' days left') + '</span></div></section>';
    } else {
      hero = '<section class="hero" aria-label="Spending">' +
        '<span class="blob" aria-hidden="true"></span>' +
        '<p class="hero-k">Spent so far</p><p class="hero-v" data-count="' + spent + '" data-ck="home-spent">' + L.fmtRound(spent) + '</p>' +
        '<p class="hero-sub">' + esc(L.periodLabel(p, t)) + ' · ' + (daysLeft === 1 ? 'last day' : daysLeft + ' days left') + '</p>' +
        '<div class="hero-foot"><button class="link" data-act="go" data-arg="custom">Set a monthly budget</button></div></section>';
    }
    let out = '<header class="top"><div><p class="eyebrow">Hi ' + esc(nm(S.me)) + '</p><h1 class="title">' + esc(L.periodLabel(p, t)) + '</h1></div>' +
      '<div class="top-right"><div class="duo" aria-hidden="true">' + av('a') + av('b') + '</div>' +
      '<button class="icon-btn" data-act="go" data-arg="settings" aria-label="Settings">' + icon('gear') + '</button></div></header>' + notices().map(noticeHtml).join('') + stagedCard() + hero;

    const items = tabItems();
    if (S.tab && S.tab.open) {
      out += '<button class="card row-card attn" data-act="go" data-arg="tab"><span class="row-lead"><span><span class="k">Day tab open</span>' +
        '<span class="row-t">' + items.length + (items.length === 1 ? ' spend' : ' spends') + ' · ' + L.fmt(sumAmt(items)) + '</span></span></span>' + icon('arrow') + '</button>';
    }
    const n = pendingAll().length;
    if (n) {
      out += '<button class="card row-card attn" data-act="go" data-arg="upload"><span class="row-lead"><span class="count">' + n + '</span>' +
        '<span><span class="row-t">' + (n === 1 ? 'spend' : 'spends') + ' to check</span><span class="k">From ' + esc(poss(nm(holder()))) + ' card</span></span></span>' + icon('arrow') + '</button>';
    }
    const waiting = isEditor() && !S.readOnly && RELEASES.length ? noteFor(RELEASES[0].id) : null;
    if (waiting && waiting.status === 'draft') {
      out += '<button class="card row-card attn" data-act="go" data-arg="newsedit"><span><span class="k">Note for ' + esc(nm(other(S.me))) + '</span><span class="row-t">Claude\'s draft for ' + esc(dateY(waiting.date)) + ' is ready</span></span>' + icon('arrow') + '</button>';
    }
    out += balanceCard();
    if (C.home.sale !== false) out += nextSaleCard();
    if (C.home.fact !== false) out += factCard();
    if (C.home.soon !== false) out += comingUpCard();
    if (C.home.deals !== false) out += onSpecialCard();
    if (C.home.week !== false) out += weekCard();
    const tiles = (C.home.goal !== false ? goalTile() : '') + (C.home.spot !== false ? spotTile() : '');
    if (tiles) out += '<div class="grid2">' + tiles + '</div>';
    if (C.home.recap !== false) {
      out += '<button class="card row-card" data-act="go" data-arg="recap"><span><span class="k">Insights</span><span class="row-t">Where ' + esc(L.periodLabel(L.shiftPeriod(p, -1), t)) + ' went</span></span>' + icon('arrow') + '</button>';
    }
    if (!S.entries.length) {
      out += '<section class="card note-card"><h2>Start with one spend</h2><p>Tap the plus to add what you spent today, or bring in ' + esc(poss(nm(holder()))) + ' card statement from Settings, under Upload.</p></section>';
    }
    return out;
  }
  function balanceCard() {
    const b = balance();
    if (b.state === 'square') return '<section class="card bal"><div><p class="k">Between you two</p><p class="v">All square</p></div></section>';
    const label = b.from === S.me ? 'You owe ' + esc(nm(b.to)) : esc(nm(b.from)) + ' owes you';
    return '<section class="card bal bold"><div><p class="k">' + label + '</p><p class="v">' + L.fmt(b.amount) + '</p></div>' +
      (S.readOnly ? '' : '<button class="btn btn-secondary btn-small" data-act="settle">Settle up</button>') + '</section>';
  }
  function weekCard() {
    const t = today(), days = [];
    for (let i = 6; i >= 0; i--) days.push(L.addDays(t, -i));
    const tot = {};
    S.entries.forEach((e) => { if (L.isSpend(e)) tot[e.date] = (tot[e.date] || 0) + e.amount; });
    const max = Math.max(1, ...days.map((d) => tot[d] || 0));
    const bars = days.map((d) => {
      const v = tot[d] || 0, h = v ? 10 + Math.round(86 * v / max) : 8;
      return '<button class="bar' + (d === t ? ' today' : '') + '" data-act="pickday" data-arg="' + d + '" aria-label="' + esc(L.fmtDayLong(d)) + ', ' + (v ? L.fmt(v) : 'nothing shared') + '">' +
        '<span class="bar-v">' + (v ? L.fmtShort(v) : '') + '</span><span class="bar-f' + (v ? '' : ' zero') + '" style="height:' + h + 'px"></span>' +
        '<span class="bar-d">' + L.DAYS[L.parseYmd(d).getDay()] + '</span></button>';
    }).join('');
    const total = days.reduce((s, d) => s + (tot[d] || 0), 0);
    return '<section class="card"><div class="card-head"><h2>Last 7 days</h2><span class="amt">' + L.fmt(total) + '</span></div><div class="bars">' + bars + '</div></section>';
  }
  function goalTile() {
    const g = cfg().goal;
    if (!g.name) return '<button class="card tile tile-empty" data-act="go" data-arg="custom"><span class="k">Our goal</span><span class="tile-t">Set a shared goal</span></button>';
    const pct = g.target ? Math.min(100, Math.round(g.saved / g.target * 100)) : 0;
    return '<section class="card tile"><p class="k">Our goal</p><p class="tile-t">' + esc(g.name) + '</p><p class="tile-s">' + L.fmtRound(g.saved) + (g.target ? ' of ' + L.fmtRound(g.target) : ' saved') + '</p>' +
      (g.target ? '<div class="meter sm" role="img" aria-label="' + pct + ' percent saved"><span style="width:' + pct + '%;background:var(--fern)"></span></div>' : '') + '</section>';
  }
  function spotTile() {
    const sp = cfg().spot, txt = String(sp.text || '').trim();
    if (!txt) return '<button class="card tile tile-empty spot" data-act="go" data-arg="custom"><span class="k">Your spot</span><span class="tile-t">Add a note or a countdown</span></button>';
    if (sp.type === 'countdown' && /^\d{4}-\d{2}-\d{2}$/.test(sp.date || '')) {
      const n = L.daysBetweenInclusive(today(), sp.date) - 1;
      if (n > 0) return '<section class="card tile spot"><p class="k">Your spot</p><p class="tile-big">' + n + '</p><p class="tile-s">' + (n === 1 ? 'day until ' : 'days until ') + esc(txt) + '</p></section>';
      return '<section class="card tile spot"><p class="k">Your spot</p><p class="tile-t">' + (n === 0 ? 'Today: ' : '') + esc(txt) + '</p>' + (n < 0 ? '<p class="tile-s">Pick a new date in Customise</p>' : '') + '</section>';
    }
    return '<section class="card tile spot"><p class="k">Your spot</p><p class="tile-t note">' + esc(txt) + '</p></section>';
  }

  /* ---------- calendar ---------- */
  function initCal(d) {
    const s = d || today(), dd = L.parseYmd(s);
    S.cal = { y: dd.getFullYear(), m: dd.getMonth(), sel: s };
  }
  function viewCal() {
    if (!S.cal) initCal();
    const c = S.cal, t = today(), ym = ymKey(c.y, c.m), H = holder();
    const info = {};
    S.entries.forEach((e) => {
      if (e.date.slice(0, 7) !== ym || e.kind === 'settlement' || e.kind === 'rent') return;
      const d = info[e.date] || (info[e.date] = { total: 0, man: false, imp: false, chk: false });
      if (e.status === 'check') d.chk = true;
      if (L.isSpend(e)) { d.total += e.amount; if (e.source === 'import') d.imp = true; else d.man = true; }
    });
    const monthTotal = Object.keys(info).reduce((s, k) => s + info[k].total, 0);
    /* Sale days sit on the calendar too: a dot, and a warm day when we're keen on it. */
    const sby = {};
    saleDays(ym + '-01', ym + '-' + L.pad(L.daysInMonth(c.y, c.m))).forEach((o) => { (sby[o.date] = sby[o.date] || []).push(o); });
    const anySale = Object.keys(sby).length > 0;
    const cells = L.monthGrid(c.y, c.m).map((d) => {
      if (!d) return '<span class="cal-day pad" aria-hidden="true"></span>';
      const i = info[d] || {}, sl = sby[d] || [], keen = sl.some((o) => o.keen);
      const cls = ['cal-day', i.total ? 'has' : '', sl.length ? 'sale' : '', keen && d >= t ? 'keen' : '', d === t ? 'today' : '', d === c.sel ? 'sel' : '', d > t ? 'future' : ''].filter(Boolean).join(' ');
      const label = L.fmtDayLong(d) + (i.total ? ', ' + L.fmt(i.total) + ' shared' : '') + (i.chk ? ', some to check' : '') + sl.map((o) => ', ' + o.sale.store + ' sale' + (o.keen ? ', keen' : '')).join('');
      return '<button class="' + cls + '" data-act="selday" data-arg="' + d + '" aria-label="' + esc(label) + '" aria-pressed="' + (d === c.sel) + '">' +
        '<span class="n">' + L.parseYmd(d).getDate() + '</span><span class="v">' + (i.total ? L.fmtShort(i.total) : '') + '</span>' +
        '<span class="dots">' + (i.man ? '<i class="dot man"></i>' : '') + (i.imp ? '<i class="dot imp"></i>' : '') + (i.chk ? '<i class="dot chk"></i>' : '') + (sl.length ? '<i class="dot ' + (keen ? 'keen' : 'sale') + '"></i>' : '') + '</span></button>';
    }).join('');
    const isThisMonth = ym === t.slice(0, 7);
    return '<header class="top"><div><p class="eyebrow">Every spend, day by day</p><h1 class="title">Calendar</h1></div>' +
      '<button class="link" data-act="go" data-arg="recap">Insights</button></header>' +
      '<section class="card cal bold"><div class="cal-head"><button class="icon-btn" data-act="calmove" data-arg="-1" aria-label="Previous month">' + icon('left') + '</button>' +
      '<h2>' + L.MONTHS_FULL[c.m] + ' ' + c.y + '</h2><button class="icon-btn" data-act="calmove" data-arg="1" aria-label="Next month">' + icon('right') + '</button></div>' +
      '<div class="cal-dow" aria-hidden="true"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>' +
      '<div class="cal-grid">' + cells + '</div>' +
      '<div class="legend"><span><i class="dot man"></i>Added by you two</span><span><i class="dot imp"></i>From ' + esc(poss(nm(H))) + ' card</span><span><i class="dot chk"></i>To check</span>' +
        (anySale ? '<span><i class="dot keen"></i>Sale day we\'re keen on</span><span><i class="dot sale"></i>Sale day</span>' : '') + '</div>' +
      '<div class="cal-foot"><span>Shared spend in ' + L.MONTHS_FULL[c.m] + '</span><span class="amt">' + L.fmt(monthTotal) + '</span></div>' +
      (isThisMonth ? '' : '<p style="margin-top:6px"><button class="link sm" data-act="caltoday">Back to this month</button></p>') + '</section>' +
      (c.sel && c.sel.slice(0, 7) === ym ? dayCard(c.sel) : '') + saleMonthCard(c);
  }
  function dayCard(d) {
    const order = { shared: 0, check: 1, dupe: 2, personal: 3 };
    const list = S.entries.filter((e) => e.date === d).sort((x, y) => (order[x.status] || 0) - (order[y.status] || 0) || (x.createdAt || 0) - (y.createdAt || 0));
    const shared = sumAmt(list.filter(L.isSpend)), sales = saleDays(d, d), t = today();
    return '<section class="card" id="dayCard"><div class="card-head"><h2>' + esc(L.fmtDayLong(d)) + '</h2><span class="amt">' + (shared ? L.fmt(shared) : '') + '</span></div>' +
      (sales.length ? '<ul class="sale-list day-sales">' + sales.map((o) => saleRow(o, t)).join('') + '</ul>' : '') +
      (L.parseYmd(d).getDay() === 3 && d >= t ? '<p class="hint">New Coles and Woolies specials start today.</p>' : '') +
      (list.length ? '<ul class="list">' + list.map((e) => entryRow(e, 'day')).join('') + '</ul>' : '<p class="muted" style="margin-bottom:14px">' + (sales.length ? 'No spends on this day yet.' : 'Nothing on this day yet.') + '</p>') +
      (S.readOnly ? '' : '<button class="btn btn-secondary btn-block" style="margin-top:12px" data-act="addon" data-arg="' + d + '">' + icon('plus') + 'Add a spend on this day</button>' +
        '<p class="dlg-extra"><button class="link sm" data-act="saleadd" data-arg="' + d + '">Add a sale day on this day</button></p>') + '</section>';
  }
  /* A spend's lines with their notes: typed lines, or a day tab's items with who paid when you both did. */
  function entryLines(e) {
    if (e.notes && e.items && e.notes.length === e.items.length) return e.items.map((a, i) => ({ amount: a, note: e.notes[i] }));
    if (e.parts && e.parts.length > 1 && e.parts.some((x) => x.label)) return e.parts.map((x) => ({ amount: x.amount, note: (x.label || '') + (e.payer === 'mixed' ? ' · ' + nm(x.payer) : '') }));
    return null;
  }
  function entryRow(e, ctx) {
    const H = holder(), id = esc(e.id), inUpload = ctx === 'upload';
    if (e.kind === 'settlement') {
      const from = e.payer === 'a' || e.payer === 'b' ? e.payer : (e.paid && e.paid.a ? 'a' : 'b');
      return '<li class="entry"><div class="e-row"><span class="av settle" aria-hidden="true">' + icon('check') + '</span><div class="e-main"><p class="e-title">' + esc(nm(from)) + ' paid ' + esc(nm(other(from))) + '</p><p class="e-meta">Settling up</p></div>' +
        '<div class="e-right"><p class="e-amt">' + L.fmt(e.amount) + '</p>' + (S.readOnly ? '' : '<button class="link sm" data-act="delentry" data-arg="' + id + '">Remove</button>') + '</div></div></li>';
    }
    if (e.kind === 'rent') {
      const from = payerOf(e) === 'a' ? 'a' : 'b';
      return '<li class="entry"><div class="e-row"><span class="av rent" aria-hidden="true">' + icon('home') + '</span><div class="e-main"><p class="e-title">' + esc(e.title || 'Rent') + '</p>' +
        '<p class="e-meta">' + esc(nm(from)) + ' to ' + esc(nm(other(from))) + ' · ' + (e.source === 'splitwise' ? 'From Splitwise' : 'Weekly rent') + '</p></div>' +
        '<div class="e-right"><p class="e-amt">' + L.fmt(e.amount) + '</p>' + (S.readOnly ? '' : '<button class="link sm" data-act="delentry" data-arg="' + id + '">Remove</button>') + '</div></div></li>';
    }
    const src = e.source === 'import' ? 'From ' + poss(nm(H)) + ' card' : e.source === 'splitwise' ? 'From Splitwise' : e.source === 'tab' ? 'Day tab' : 'Added by ' + (e.by === 'a' || e.by === 'b' ? nm(e.by) : 'one of you');
    let sub = '';
    const lines = entryLines(e);
    if (lines) sub = '<ul class="e-lines">' + lines.map((l) => '<li><span class="ln-n' + (l.note ? '' : ' muted') + '">' + esc(l.note || 'No note') + '</span><span class="ln-a">' + L.fmt(l.amount) + '</span></li>').join('') + '</ul>';
    else if (e.parts && e.parts.length) sub = '<p class="e-sub">' + esc(e.parts.map((x) => (x.label ? x.label + ' ' : '') + L.fmt(x.amount)).join(', ')) + '</p>';
    else if (e.items && e.items.length > 1) sub = '<p class="e-sub">' + e.items.map(L.fmt).join(' + ') + '</p>';
    if (e.source === 'import' && e.raw) sub += '<p class="e-sub">' + esc(e.raw) + '</p>';
    if (e.orig && e.orig.currency) sub += '<p class="e-sub">' + esc(fmtForeign(e.orig)) + '</p>';
    let tag = '', actions = '';
    if (e.status === 'check') {
      tag = inUpload ? '' : '<span class="tag chk">To check</span>';
      if (!S.readOnly) actions = '<div class="e-actions"><button class="btn btn-small btn-secondary" data-act="mark" data-arg="' + id + '|shared">Shared</button><button class="btn btn-small btn-ghost" data-act="mark" data-arg="' + id + '|personal">Just ' + esc(poss(nm(H))) + '</button></div>';
    } else if (e.status === 'personal') {
      tag = '<span class="tag">Just ' + esc(poss(nm(H))) + '</span>';
      if (!S.readOnly) actions = '<div class="e-actions"><button class="btn btn-small btn-ghost" data-act="mark" data-arg="' + id + '|shared">Make it shared</button></div>';
    } else if (e.status === 'dupe') {
      const twin = e.dupOf && S.byId[String(e.dupOf).split(':')[0]];
      tag = '<span class="tag">' + (twin && twin.e ? 'Same as ' + esc(twin.e.title || 'a spend you added') : 'Already added by hand') + '</span>';
      if (!S.readOnly) actions = '<div class="e-actions"><button class="btn btn-small btn-ghost" data-act="mark" data-arg="' + id + '|shared">Count it too</button></div>';
    } else if (e.offBudget && cfg().budget) tag = '<span class="tag">Not in budget</span>';
    const dim = e.status === 'personal' || e.status === 'dupe';
    return '<li class="entry' + (dim ? ' dim' : '') + '"><div class="e-row">' + av(payerOf(e)) + '<div class="e-main"><p class="e-title">' + esc(e.title || 'Spend') + '</p>' +
      '<p class="e-meta">' + esc(inUpload ? (e.category || 'Other') : (e.category || 'Other') + ' · ' + src) + '</p>' + sub + tag + '</div>' +
      '<div class="e-right"><p class="e-amt">' + L.fmt(e.amount) + '</p>' + (S.readOnly ? '' : '<button class="link sm" data-act="edit" data-arg="' + id + '">Edit</button>') + '</div></div>' + actions + '</li>';
  }

  /* ---------- add and edit ---------- */
  function openAdd(opts) {
    const C = cfg(), H = holder();
    S.add = {
      id: null, date: opts.date || today(), expr: '', notes: [], title: '', category: null,
      payer: H, onCard: true, budget: true, splitMode: 'even', splitA: C.splitA, locked: false, orig: null,
      from: S.view === 'add' ? 'home' : S.view
    };
    S.view = 'add'; render(); window.scrollTo(0, 0);
  }
  function openEdit(id) {
    const r = S.byId[id];
    if (!r || !r.e) return;
    const e = r.e, C = cfg();
    if (e.kind === 'settlement' || e.kind === 'rent') return;
    const payer = payerOf(e);
    S.add = {
      id, date: e.date,
      expr: e.items && e.items.length > 1 ? e.items.map(centsToStr).join(' + ') : centsToStr(e.amount),
      notes: e.notes && e.items && e.notes.length === e.items.length ? e.notes.slice() : [],
      title: e.title || '', category: e.category || 'Other', payer: payer === 'mixed' ? 'mixed' : payer,
      onCard: !!e.onCard, budget: !e.offBudget, splitMode: (e.splitA == null || e.splitA === C.splitA) ? 'even' : 'custom', splitA: e.splitA == null ? C.splitA : e.splitA,
      locked: payer === 'mixed', orig: e, from: S.view === 'add' ? 'home' : S.view
    };
    S.view = 'add'; render(); window.scrollTo(0, 0);
  }
  function addTotal(A) {
    return A.locked ? { ok: true, total: A.orig.amount, items: A.orig.items || [] } : L.parseExpr(A.expr);
  }
  function exprLine(A, r) {
    if (A.locked) return 'Paid on the day tab';
    if (!r.ok) return 'Check the amount';
    if (r.items.length > 1) return r.items.length + ' spends · a note for each below';
    if (A.expr) return 'Tap + to add another line';
    return 'Use + to add up a day of spends, line by line';
  }
  function saveLabel(A, r) {
    if (A.id) return 'Save changes';
    return r.ok && r.total > 0 ? 'Save ' + L.fmt(r.total) : 'Save';
  }
  function nudgeHtml(A, r) {
    const C = cfg(), H = holder();
    if (A.locked || A.payer === H || !r.ok || r.total <= 0) return '';
    const est = L.estimatePoints([{ date: A.date, amount: r.total, category: A.category || 'Other' }], C.card);
    const pts = est ? est.velocity : 0;
    if (pts < 1) return '';
    return '<div class="nudge">' + icon('star') + '<span>On ' + esc(poss(nm(H))) + ' ' + esc(cardLabel()) + ' this would earn about ' + pts.toLocaleString('en-AU') + ' ' + esc(programLabel()) + ' points.</span></div>';
  }
  /* The amounts typed with + are the lines of one spend. Each line can carry a note, kept in step by position. */
  const addParts = (A) => (A.locked || !A.expr ? [] : A.expr.split(' + '));
  const partCents = (t) => (t && t !== '.' && /^\d*\.?\d{0,2}$/.test(t) ? Math.round(parseFloat(t) * 100) : 0);
  function linesCard(A) {
    const parts = addParts(A);
    if (parts.length < 2) return '';
    return '<section class="card lines" id="addLines"><div class="card-head"><h2>Lines</h2><span class="k">' + parts.length + ' lines</span></div>' + parts.map((t, i) =>
      '<div class="ln-row"><span class="ln-i" aria-hidden="true">' + (i + 1) + '</span><span class="ln-amt" id="lnAmt' + i + '">' + L.fmt(partCents(t)) + '</span>' +
      '<label class="ln-field"><span class="sr">Note for line ' + (i + 1) + '</span><input class="input ln-note" id="lnNote' + i + '" data-bind="add.notes.' + i + '" placeholder="' + (i === 0 ? 'What was it? Coffee, crepes' : 'Note') + '" maxlength="60" autocomplete="off" value="' + esc((A.notes && A.notes[i]) || '') + '"></label></div>').join('') +
      '</section>';
  }
  function viewAdd() {
    const A = S.add, C = cfg(), H = holder(), r = addTotal(A);
    const cats = C.categories.concat(C.categories.indexOf('Other') >= 0 ? [] : ['Other']);
    const keypad = () => {
      const k = (v, label, cls, aria) => '<button type="button" class="key ' + (cls || '') + '" data-act="key" data-arg="' + v + '"' + (aria ? ' aria-label="' + aria + '"' : '') + '>' + label + '</button>';
      return '<div class="keypad">' + k('1', '1') + k('2', '2') + k('3', '3') + k('back', icon('del'), 'soft', 'Delete last digit') +
        k('4', '4') + k('5', '5') + k('6', '6') + k('clear', 'Clear', 'soft', 'Clear amount') +
        k('7', '7') + k('8', '8') + k('9', '9') + k('+', '+', 'plus', 'Plus, add another amount') +
        k('.', '.', '', 'Decimal point') + k('0', '0', 'zero') + '</div>';
    };
    const isImport = A.orig && A.orig.source === 'import';
    let payerBlock = '';
    if (!A.locked) {
      payerBlock = '<fieldset><legend>Who paid?</legend><div class="seg">' + segBtn('addpayer', 'a', A.payer === 'a', nm('a'), 'a') + segBtn('addpayer', 'b', A.payer === 'b', nm('b'), 'b') + segBtn('addpayer', 'both', A.payer === 'both', 'Both') + '</div></fieldset>' +
        '<label class="check-row"><input type="checkbox" id="addCard" data-bind="add.onCard"' + (A.onCard ? ' checked' : '') + '> On ' + esc(poss(nm(H))) + ' ' + esc(cardLabel()) + '</label>';
    }
    /* Whether it counts towards the monthly budget: on unless it's a one-off you'd rather keep out. A category left out in
       Customise is out anyway, so then the box says so. Only shown once there's a budget. */
    const skipCat = C.budgetSkip.indexOf(A.category || 'Other') >= 0;
    const budgetRow = !C.budget ? '' : skipCat
      ? '<label class="check-row off"><input type="checkbox" id="addBudget" disabled> Counts towards our monthly budget</label>' +
        '<p class="hint" style="margin:-10px 0 14px">' + esc(A.category || 'Other') + ' is left out of the budget in Customise.</p>'
      : '<label class="check-row"><input type="checkbox" id="addBudget" data-bind="add.budget"' + (A.budget !== false ? ' checked' : '') + '> Counts towards our monthly budget</label>';
    const usual = C.splitA + '/' + (100 - C.splitA);
    const split = '<fieldset><legend>Split</legend><div class="seg">' + segBtn('addsplit', 'even', A.splitMode === 'even', 'Our usual ' + usual) + segBtn('addsplit', 'custom', A.splitMode === 'custom', 'Custom') + '</div>' +
      (A.splitMode === 'custom' ? stepper('addstep', A.splitA) : '') + '</fieldset>';
    return '<header class="top sheet"><button class="icon-btn" data-act="closeadd" aria-label="Close">' + icon('close') + '</button>' +
      '<h1 class="title sm">' + (A.id ? 'Edit spend' : 'Add a spend') + '</h1>' +
      '<label class="date-chip"><span id="dateLbl">' + esc(L.fmtDay(A.date)) + '</span><input type="date" id="addDate" value="' + A.date + '" data-change="adddate" aria-label="Date of the spend"></label></header>' +
      (!A.id && snapReady() ? '<label class="btn btn-secondary btn-block file-btn snap-add">' + icon('camera') + 'Capture a receipt<input type="file" accept="image/*" data-change="rcpfile" aria-label="Capture a receipt"></label>' : '') +
      '<section class="amount-box" aria-live="polite"><p class="amt-total" id="amtTotal">' + L.fmt(r.ok ? r.total : 0) + '</p><p class="amt-expr" id="amtExpr">' + esc(exprLine(A, r)) + '</p></section>' +
      (A.locked ? '<p class="hint" style="text-align:center;margin:-6px 0 16px">' + esc(A.orig.parts ? A.orig.parts.map((x) => nm(x.payer) + ' ' + L.fmt(x.amount)).join(', ') : '') + '</p>' : keypad()) +
      linesCard(A) +
      '<section class="card">' + payerBlock +
      '<label class="field"><span>What was it?</span><input class="input" id="addTitle" data-bind="add.title" value="' + esc(A.title) + '" placeholder="Dinner, groceries, a gift" autocomplete="off" maxlength="60"></label>' +
      (isImport ? '<p class="hint" style="margin:-10px 0 16px">On the statement: ' + esc(A.orig.raw || '') + '</p>' : '') +
      '<fieldset><legend>Category</legend><div class="chips">' + cats.map((c) => '<button type="button" class="chip" data-act="addcat" data-arg="' + esc(c) + '" aria-pressed="' + (A.category === c) + '">' + esc(c) + '</button>').join('') + '</div>' +
      (C.categories.length ? '' : '<p class="hint">Add your own categories in Customise.</p>') + '</fieldset>' +
      budgetRow + split + '<div id="nudge">' + nudgeHtml(A, r) + '</div></section>' +
      '<p class="after-card">' + (A.id ? (isImport ? '<button class="link" data-act="markadd">Not shared? Mark it as ' + esc(poss(nm(H))) + '</button>' : '<button class="link danger" data-act="deladd">Delete this spend</button>')
        : '<button class="link" data-act="go" data-arg="tab">Out all day? Start a tab instead</button>') + '</p>' +
      '<div class="savebar"><button class="btn btn-primary btn-block" id="saveBtn" data-act="saveadd"' + (r.ok && r.total > 0 ? '' : ' disabled') + '>' + esc(saveLabel(A, r)) + '</button></div>';
  }
  function stepper(act, a) {
    return '<div class="stepper"><button type="button" class="icon-btn" data-act="' + act + '" data-arg="-5" aria-label="Less for ' + esc(nm('a')) + '"' + (a <= 0 ? ' disabled' : '') + '>' + icon('left') + '</button>' +
      '<output>' + esc(nm('a')) + ' ' + a + '% · ' + esc(nm('b')) + ' ' + (100 - a) + '%</output>' +
      '<button type="button" class="icon-btn" data-act="' + act + '" data-arg="5" aria-label="More for ' + esc(nm('a')) + '"' + (a >= 100 ? ' disabled' : '') + '>' + icon('right') + '</button></div>';
  }
  function pressKey(k) {
    const A = S.add;
    if (!A || A.locked) return;
    let x = A.expr;
    const cur = x.split(' + ').pop();
    if (k === 'clear') x = '';
    else if (k === 'back') x = x.endsWith(' + ') ? x.slice(0, -3) : x.slice(0, -1);
    else if (k === '+') { if (x && !x.endsWith(' + ') && !x.endsWith('.')) x += ' + '; else return; }
    else if (k === '.') { if (cur.indexOf('.') >= 0) return; x += cur === '' ? '0.' : '.'; }
    else if (/^\d$/.test(k)) {
      if (/\.\d\d$/.test(cur)) return;
      if (cur.indexOf('.') < 0 && cur.length >= 6) return;
      if (cur === '0') x = x.slice(0, -1);
      x += k;
    } else return;
    if (x.split(' + ').length > 40) return;
    const before = addParts(A).length;
    A.expr = x;
    const n = addParts(A).length;
    if (n !== before) { if (A.notes && A.notes.length > n) A.notes = A.notes.slice(0, n); render(); return; }
    updateAmount();
  }
  function updateAmount() {
    const A = S.add, r = addTotal(A);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('amtTotal', L.fmt(r.ok ? r.total : 0));
    set('amtExpr', exprLine(A, r));
    const b = document.getElementById('saveBtn');
    if (b) { b.textContent = saveLabel(A, r); b.disabled = !(r.ok && r.total > 0); }
    const n = document.getElementById('nudge');
    if (n) n.innerHTML = nudgeHtml(A, r);
    const parts = addParts(A);
    if (parts.length > 1) set('lnAmt' + (parts.length - 1), L.fmt(partCents(parts[parts.length - 1])));
  }
  function saveAdd() {
    const A = S.add, C = cfg(), r = addTotal(A);
    if (!r.ok || r.total <= 0) { toast('Enter an amount first.'); return; }
    const base = A.orig || {};
    const splitA = A.splitMode === 'even' ? C.splitA : A.splitA;
    const kept = addParts(A).map((t, i) => ({ c: partCents(t), note: String((A.notes && A.notes[i]) || '').trim().slice(0, 60) })).filter((x) => x.c > 0);
    const notes = kept.length > 1 && kept.length === r.items.length ? kept.map((x) => x.note) : null;
    const title = String(A.title || '').trim() || (r.items.length > 1 && !A.locked ? L.DAYS_FULL[L.parseYmd(A.date).getDay()] + ' spends' : A.category && A.category !== 'Other' ? A.category : 'Spend');
    let e;
    if (A.locked) {
      e = Object.assign(clone(base), { date: A.date, title, category: A.category || 'Other', splitA, owed: L.splitOwed(base.amount, splitA, base.id), offBudget: A.budget === false, updatedAt: Date.now() });
    } else {
      e = makeEntry({
        id: A.id || uid('m'), kind: 'expense', source: base.source || 'manual', status: base.status || 'shared',
        date: A.date, title, raw: base.raw, key: base.key, amount: r.total, items: r.items, notes,
        parts: base.parts && base.amount === r.total ? base.parts : null, payer: A.payer, onCard: A.onCard, offBudget: A.budget === false, splitA,
        category: A.category || 'Other', dupOf: base.dupOf, orig: base.orig && base.amount === r.total ? base.orig : null, createdAt: base.createdAt, by: base.by
      });
    }
    const newYm = e.date.slice(0, 7), old = A.id && S.byId[A.id], oldYm = old ? old.ym : null;
    const done = (oldYm && oldYm !== newYm)
      ? putEntries(newYm, { [e.id]: e }).then((ok) => (ok ? putEntries(oldYm, { [e.id]: null }) : false))
      : putEntries(newYm, { [e.id]: e });
    if (base.source === 'import' && base.key && C.remember && A.category && A.category !== base.category && C.categories.indexOf(A.category) >= 0) saveRule(base.key, null, A.category);
    done.then((ok) => { if (!ok) return; toast((A.id ? 'Updated ' : 'Saved ') + L.fmt(e.amount) + ' on ' + L.fmtDay(e.date)); if (!A.id) spendPop([e], e.title); });
    const back = A.from || 'home';
    S.add = null;
    if (back === 'cal') initCal(e.date);
    S.view = back; render(); window.scrollTo(0, 0);
  }

  /* ---------- day tab ---------- */
  function tabItems() {
    const it = (S.tab && S.tab.open && S.tab.items && typeof S.tab.items === 'object') ? S.tab.items : {};
    return Object.keys(it).map((k) => (it[k] && typeof it[k] === 'object' && it[k].amount > 0 ? Object.assign({ id: k }, it[k]) : null))
      .filter(Boolean).sort((a, b) => (a.at || 0) - (b.at || 0));
  }
  function viewTab() {
    const H = holder(), open = S.tab && S.tab.open;
    let out = '<header class="top"><div><p class="eyebrow">For days out</p><h1 class="title">Day tab</h1></div></header>';
    if (!open) {
      return out + '<section class="card bold tab-hero"><span class="sticker">Out all day?</span><h2>Start a tab</h2>' +
        '<p>Add each spend as you go. You can both add to it from your phones. Close it at the end of the day and it saves as one spend with the total.</p>' +
        (S.readOnly ? '' : '<button class="btn btn-primary" data-act="tabstart">Start a tab for today</button>') + '</section>';
    }
    const items = tabItems(), total = sumAmt(items), F = S.tabForm, payer = F.payer || H;
    const date = S.tab.date || today();
    out += '<section class="hero" aria-label="Tab total" data-live="tabhero"><span class="blob" aria-hidden="true"></span><p class="hero-k">Tab for ' + esc(L.fmtDayLong(date)) + '</p>' +
      '<p class="tab-total">' + L.fmt(total) + '</p><p class="hero-sub">' + items.length + (items.length === 1 ? ' spend' : ' spends') + ' so far</p>' +
      (items.length ? '<ul class="list" style="margin-top:6px">' + items.map((i) => '<li class="entry">' + av(i.payer === 'a' ? 'a' : 'b', true) +
        '<div class="e-main"><p class="e-title">' + esc(i.label || 'Spend') + '</p></div><div class="e-right"><p class="e-amt">' + L.fmt(i.amount) + '</p>' +
        (S.readOnly ? '' : '<button class="link sm" data-act="tabdel" data-arg="' + esc(i.id) + '" aria-label="Remove ' + esc(i.label || 'spend') + ' ' + L.fmt(i.amount) + '">Remove</button>') + '</div></li>').join('') + '</ul>' : '') + '</section>';
    if (!S.readOnly) {
      out += '<section class="card"><h2 style="font-size:20px;margin-bottom:12px">Add to the tab</h2>' +
        '<div class="add-row"><label><span class="sr">Amount</span><div class="money"><input class="input" id="tabAmt" inputmode="decimal" placeholder="0.00" autocomplete="off" data-bind="tabForm.amount" data-enter="tabadd" value="' + esc(F.amount) + '"></div></label>' +
        '<label><span class="sr">What was it?</span><input class="input" id="tabLabel" placeholder="Coffee, lunch, Uber" maxlength="40" autocomplete="off" data-bind="tabForm.label" data-enter="tabadd" value="' + esc(F.label) + '"></label></div>' +
        '<fieldset style="margin-bottom:14px"><legend class="sr">Who paid?</legend><div class="seg">' + segBtn('tabpayer', 'a', payer === 'a', nm('a') + ' paid', 'a') + segBtn('tabpayer', 'b', payer === 'b', nm('b') + ' paid', 'b') + '</div></fieldset>' +
        '<button class="btn btn-secondary btn-block" data-act="tabadd">' + icon('plus') + 'Add to tab</button></section>' +
        '<div class="savebar above-nav" data-live="tabbar"><button class="btn btn-primary btn-block" data-act="tabclose"' + (items.length ? '' : ' disabled') + '>Close the tab and save ' + L.fmt(total) + '</button>' +
        '<button class="link danger" data-act="tabdiscard">Discard this tab</button></div>';
    }
    return out;
  }
  /* Show a tab change straight away; the shared copy confirms it a moment later. */
  function localTabItem(id, item) {
    const t = S.tab && typeof S.tab === 'object' ? S.tab : { open: true, date: today(), items: {} };
    const items = Object.assign({}, t.items || {});
    items[id] = item;
    S.tab = Object.assign({}, t, { items });
  }
  function closeTab(title, category, budget) {
    const items = tabItems();
    if (!items.length || !S.tab) return;
    const C = cfg(), H = holder(), total = sumAmt(items), paid = { a: 0, b: 0 };
    items.forEach((i) => { paid[i.payer === 'a' ? 'a' : 'b'] += i.amount; });
    const payers = ['a', 'b'].filter((k) => paid[k] > 0);
    const payer = payers.length === 1 ? payers[0] : 'mixed';
    const date = S.tab.date || today();
    const e = makeEntry({
      id: uid('t'), source: 'tab', date, title: String(title || '').trim() || 'Day out', amount: total,
      items: items.map((i) => i.amount), parts: items.map((i) => ({ amount: i.amount, label: i.label || '', payer: i.payer === 'a' ? 'a' : 'b' })),
      payer, paid, onCard: payer === H, offBudget: budget === false, splitA: C.splitA, category: category || 'Other'
    });
    putEntries(date.slice(0, 7), { [e.id]: e }).then((ok) => {
      if (!ok) return;
      enqueue('hh/tab', (ref) => doSet(ref, { open: false, date: null, startedAt: null, items: {} }));
      toast('Saved the tab: ' + L.fmt(total) + ' on ' + L.fmtDay(date));
      spendPop([e], e.title);
    });
    S.dialog = null; S.tabForm = { amount: '', label: '', payer: null };
    initCal(date); S.view = 'cal'; render(); window.scrollTo(0, 0);
  }

  /* ---------- receipts ---------- */
  /* Snap a receipt: Gemini reads the shop, date, total and each item, through Firebase AI Logic on Google's free tier.
     You check it, mark anything that's just one person's, and it saves the spends. The photo isn't kept anywhere, and
     nothing else in the app goes to Gemini. Things that are just the payer's own are left out, since they aren't shared;
     things that are just the other person's are saved as a spend they owe in full. */
  const AI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
  let aiLoad = null;
  /* Firebase AI Logic only answers apps that pass App Check, with a fresh one-use token for each request (so it works
     whether or not replay protection is on). The check is Google's invisible reCAPTCHA, except that iPhones block it in
     home screen apps. So once the household has saved an App Check token (made in the Firebase console, kept in hh/ai,
     which only the two of you can read, and never in this public code), the app uses that instead. */
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const aiToken = () => { const t = S.aiDoc && S.aiDoc.appCheckDebug; return typeof t === 'string' && UUID.test(t) ? t : ''; };
  const noProviderToken = () => Promise.reject(new Error('This household uses its saved App Check token.'));
  function aiModel(name, schema) {
    const key = window.HH_APPCHECK, tok = aiToken();
    aiLoad = aiLoad || Promise.all([import('./firebase-app.js'), import('./firebase-ai.js'), key || tok ? import('./firebase-app-check.js') : null]).then((m) => {
      const A = m[0], AI = m[1], AC = m[2], app = A.getApps().filter((x) => x.name === 'hh-ai')[0] || A.initializeApp(window.HH_FIREBASE, 'hh-ai');
      if (AC) {
        if (tok) self.FIREBASE_APPCHECK_DEBUG_TOKEN = tok;
        AC.initializeAppCheck(app, { provider: tok ? new AC.CustomProvider({ getToken: noProviderToken }) : new AC.ReCaptchaEnterpriseProvider(key), isTokenAutoRefreshEnabled: false });
      }
      S.aiCheck = AC ? (tok ? 'token' : 'recaptcha') : 'none';
      return { AI, ai: AI.getAI(app, { backend: new AI.GoogleAIBackend(), useLimitedUseAppCheckTokens: !!AC }) };
    }, (e) => { aiLoad = null; throw e; });
    return aiLoad.then((x) => x.AI.getGenerativeModel(x.ai, { model: name, generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0 } }));
  }
  const RECEIPT_PROMPT = 'This is a photo of a shop receipt from Australia. Read it. Give the shop, the date, the total paid, the best category from the list, and every item bought with what it finally cost. ' +
    'Leave out subtotals, GST, savings, payment, card and change lines. If it is not a receipt, give a total of 0 and no items.';
  function receiptSchema() {
    const C = cfg(), cats = C.categories.concat(C.categories.indexOf('Other') >= 0 ? [] : ['Other']);
    return { type: 'object', properties: {
      shop: { type: 'string', description: 'The shop, as on the receipt, with the suburb if it is printed. For example: Coles Artarmon.' },
      date: { type: 'string', description: 'The date of the purchase as YYYY-MM-DD, or empty if it is not printed.' },
      total: { type: 'number', description: 'The total paid, in dollars.' },
      category: { type: 'string', enum: cats },
      items: { type: 'array', items: { type: 'object', properties: {
        name: { type: 'string', description: 'What it is, shortened the way a person would say it.' },
        price: { type: 'number', description: 'What this line cost in dollars, after any discount printed under it.' } }, required: ['name', 'price'] } }
    }, required: ['shop', 'date', 'total', 'category', 'items'] };
  }
  function readReceipt(data) { return aiRead(RECEIPT_PROMPT, receiptSchema(), data, 'image/jpeg'); }
  /* Tries the newest small model, and the one before it if that one isn't there. */
  function aiRead(prompt, schema, data, mime) {
    const go = (i) => aiModel(AI_MODELS[i], schema).then((model) => model.generateContent([prompt, { inlineData: { mimeType: mime, data } }]))
      .then((r) => JSON.parse(r.response.text()), (e) => {
        const st = e && e.customErrorData && e.customErrorData.status;
        const m = String((e && e.message) || '');
        if (i + 1 < AI_MODELS.length && !/genai config/i.test(m) && (st === 404 || /not found|is not supported/i.test(m))) return go(i + 1);
        throw e;
      });
    return go(0);
  }
  function receiptError(e) {
    const code = String((e && e.code) || ''), st = e && e.customErrorData && e.customErrorData.status, msg = String((e && e.message) || '');
    const offline = 'Couldn\'t reach Gemini. Check your connection and try again.';
    const notUs = S.aiCheck === 'token' ? 'Google turned down the App Check token. Check it\'s still listed under Manage debug tokens in the Firebase console, or save a new one.'
      : 'Google couldn\'t confirm this is our app. iPhones often block that check in home screen apps, so set up receipt reading with a token instead. It\'s a one-off, for both phones.';
    if (code === 'api-not-enabled' || /api-not-enabled|has not been used|is disabled|genai config not found/i.test(msg)) return 'Receipt reading isn\'t set up yet. In the Firebase console, open AI Logic, tap Get started, choose the Gemini Developer API and finish every step. If you just did, give it 10 minutes.';
    if (/enforce Firebase App Check|has been deactivated/i.test(msg)) return 'Gemini is switched off for this project until App Check is enforced. In the Firebase console, open Security, App Check, APIs, and set Firebase AI Logic to Enforced.';
    if (/^appCheck\//.test(code) || /\(appCheck\//.test(msg)) return navigator.onLine === false ? offline : notUs;
    if (st === 401 || /app ?check|attestation/i.test(msg)) return window.HH_APPCHECK ? notUs : 'Gemini needs App Check before it will answer. Set up receipt reading with a token, once for both phones.';
    if (/are blocked|API_KEY_SERVICE_BLOCKED/i.test(msg)) return 'The app\'s Firebase key isn\'t allowed to use Gemini yet. In the Google Cloud console, open Credentials, edit the Browser key, and add the Firebase AI Logic API.';
    if (st === 429 || /quota|exhausted/i.test(msg)) return 'Gemini\'s free limit is used up for now. Type this one in, or try again later.';
    if (e && e.photo) return 'That photo couldn\'t be opened. Try another one.';
    if ((code === 'fetch-error' && !st) || navigator.onLine === false || /failed to fetch|networkerror|load failed|importing a module/i.test(msg)) return offline;
    return 'Couldn\'t read that receipt. Try a clearer photo, or type it in.';
  }
  /* The technical reason, in small print under the friendly one, so a screenshot says exactly what went wrong. */
  function errDetail(e) {
    const st = (e && e.customData && e.customData.httpStatus) || (e && e.customErrorData && e.customErrorData.status) || '';
    let m = String((e && e.message) || '').replace(/https?:\/\/\S+/g, '').replace(/Error fetching from\s*:?/i, '').replace(/\s+/g, ' ').trim();
    if (e && e.code && m.indexOf(e.code) < 0) m = e.code + (m ? ': ' + m : '');
    if (st && m.indexOf(String(st)) < 0) m += ' (HTTP ' + st + ')';
    return m.slice(0, 220);
  }
  /* What the + opens: capture a receipt (straight to the camera) or add a spend by hand. */
  function addPickDialog() {
    return '<div class="dlg-head"><h2 id="dlgT">Add</h2><button class="icon-btn" data-act="dlgclose" aria-label="Close">' + icon('close') + '</button></div>' +
      '<div class="pick-grid">' +
      '<label class="pick file-btn"><span class="pick-ic" aria-hidden="true">' + icon('camera') + '</span><span class="pick-t">Capture a receipt</span><span class="pick-s">Gemini reads the shop, total and items</span>' +
      '<input type="file" accept="image/*" capture="environment" data-change="rcpfile" aria-label="Capture a receipt with the camera"></label>' +
      '<button class="pick" data-act="pickadd"><span class="pick-ic" aria-hidden="true">' + icon('plus') + '</span><span class="pick-t">Add a spend</span><span class="pick-s">Type in what we spent</span></button>' +
      '</div>' +
      '<label class="link sm file-btn pick-photos">' + icon('image') + 'Or choose a receipt from your photos<input type="file" accept="image/*" data-change="rcpfile" aria-label="Choose a photo of a receipt"></label>';
  }
  function aiTokenDialog(d) {
    const has = !!aiToken();
    return '<div class="dlg-head"><h2 id="dlgT">Receipt reading setup</h2><button class="icon-btn" data-act="dlgclose" aria-label="Close">' + icon('close') + '</button></div>' +
      '<p class="muted">Gemini only answers our app once Google has checked it\'s really us. iPhones block Google\'s usual check in home screen apps, so we use an App Check token instead. Make it once and it works on both phones.</p>' +
      '<ol class="setup-steps"><li>In the Firebase console, open <strong>App Check</strong>, then <strong>Apps</strong>.</li><li>Tap <strong>⋮</strong> on the web app, then <strong>Manage debug tokens</strong>.</li>' +
      '<li><strong>Add debug token</strong>, then <strong>Generate token</strong>. Name it Household and save.</li><li>Copy the token and paste it here.</li></ol>' +
      (has ? '<p class="hint">A token is saved. Paste a new one to replace it.</p>' : '') +
      '<label class="sr" for="aiTokIn">App Check token</label><input class="input" id="aiTokIn" placeholder="Paste the token" autocomplete="off" autocapitalize="off" spellcheck="false" data-bind="aiTokNew" data-enter="aitoksave" value="' + esc(S.aiTokNew) + '">' +
      (d.err ? '<p class="err-text" role="alert">' + esc(d.err) + '</p>' : '') +
      '<p class="hint">It\'s saved privately for the two of you, never in the app\'s public code. Google makes these tokens for testing, so if it ever gets out, delete it in the Firebase console and make a new one.</p>' +
      '<div class="dialog-actions">' + (has ? '<button class="btn btn-secondary" data-act="aitokdel">Remove it</button>' : '<button class="btn btn-secondary" data-act="dlgclose">Not now</button>') +
      '<button class="btn btn-primary" data-act="aitoksave">Save</button></div>';
  }
  /* A smaller JPEG is plenty for reading a receipt, and quicker to send. A screenshot of specials keeps its width (up to
     1400px across) so the small print stays sharp, and a long scrolling one stays under what an iPhone can draw. */
  function shrinkPhoto(file, shot) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image(), fail = () => { URL.revokeObjectURL(url); const e = new Error('photo'); e.photo = true; rej(e); };
      img.onload = () => {
        const W = img.naturalWidth || 1, H = img.naturalHeight || 1, k = shot ? Math.min(1, 1400 / Math.min(W, H), Math.sqrt(15e6 / (W * H))) : Math.min(1, 1600 / Math.max(W, H));
        const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        try { c.getContext('2d').drawImage(img, 0, 0, w, h); } catch (e) { fail(); return; }
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', shot ? 0.86 : 0.82).split(',')[1]);
      };
      img.onerror = fail;
      img.src = url;
    });
  }
  function receiptForm(j) {
    const C = cfg(), t = today(), cents = (v) => Math.round((typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/[^0-9.-]/g, ''))) * 100) || 0;
    const items = (Array.isArray(j && j.items) ? j.items : []).slice(0, 60).map((x) => ({ name: String((x && x.name) || '').trim().replace(/\s+/g, ' ').slice(0, 60) || 'Item', c: cents(x && x.price), who: 'shared' })).filter((x) => x.c > 0);
    const total = cents(j && j.total) || items.reduce((a, x) => a + x.c, 0);
    if (total <= 0) return null;
    const d = String((j && j.date) || ''), cats = C.categories.concat(C.categories.indexOf('Other') >= 0 ? [] : ['Other']);
    const cat = cats.indexOf(j && j.category) >= 0 ? j.category : cats.indexOf('Groceries') >= 0 ? 'Groceries' : 'Other';
    return { shop: String((j && j.shop) || '').trim().replace(/\s+/g, ' ').slice(0, 60) || 'Receipt', date: ISO_DAY.test(d) && d <= t && d >= L.addDays(t, -400) ? d : t,
      total: (total / 100).toFixed(2), category: cat, payer: S.me === 'b' ? 'b' : 'a', onCard: (S.me === 'b' ? 'b' : 'a') === holder(), budget: true, items };
  }
  function startReceipt(file) {
    if (!file) return;
    const tok = uid('r');
    S.dialog = { type: 'receipt', tok, busy: true, err: null, form: null, error: null };
    render();
    const mine = () => S.dialog && S.dialog.tok === tok;
    shrinkPhoto(file).then(readReceipt).then((j) => {
      if (!mine()) return;
      const f = receiptForm(j);
      S.dialog.busy = false;
      if (f) S.dialog.form = f; else S.dialog.err = 'That doesn\'t look like a receipt. Try another photo, or type it in.';
      render();
    }, (e) => {
      if (!mine()) return;
      S.dialog.busy = false; S.dialog.err = receiptError(e); S.dialog.why = e && !e.photo ? errDetail(e) : '';
      S.dialog.fix = !S.readOnly && /appCheck\/|app ?check|attestation/i.test(String((e && e.code) || '') + ' ' + String((e && e.message) || '')) ? 'aitoken' : '';
      render();
    });
  }
  function receiptSums(f) {
    const total = Math.round(parseFloat(String(f.total || '').replace(/[^0-9.]/g, '')) * 100) || 0, payer = f.payer, other = payer === 'a' ? 'b' : 'a';
    const sum = (who) => f.items.filter((x) => x.who === who).reduce((a, x) => a + x.c, 0);
    const mine = sum(payer), theirs = sum(other);
    return { total, payer, other, mine, theirs, shared: total - mine - theirs };
  }
  function receiptSumHtml(f) {
    const s = receiptSums(f), C = cfg();
    if (s.total <= 0) return '<p class="rcp-sum-t">Enter the total.</p>';
    if (s.shared < 0) return '<p class="rcp-sum-t">The things marked as one person\'s add up to more than the total.</p>';
    const parts = [];
    if (s.shared) parts.push('Shared ' + L.fmt(s.shared));
    if (s.theirs) parts.push('Just ' + nm(s.other) + ' ' + L.fmt(s.theirs));
    if (s.mine) parts.push('Just ' + nm(s.payer) + ' ' + L.fmt(s.mine) + ', left out');
    const owes = (s.shared ? L.splitOwed(s.shared, C.splitA, 'r')[s.other] : 0) + s.theirs;
    return '<p class="rcp-sum-t">' + esc(parts.join(' · ')) + '</p>' + (owes ? '<p class="muted">So ' + esc(nm(s.other)) + ' owes ' + esc(nm(s.payer)) + ' ' + L.fmt(owes) + ' for this one</p>' : '');
  }
  const RECEIPT_SLIP = '<svg class="rcp-slip" viewBox="0 0 62 84" aria-hidden="true"><path d="M4 2h54v76l-6.75-4-6.75 4-6.75-4-6.75 4-6.75-4-6.75 4-6.75-4L4 78z" fill="#fff" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M12 14h30M12 24h38M12 32h24M12 40h34M12 48h20M12 60h38" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".35"/></svg>';
  function receiptDialog(d) {
    const head = '<div class="dlg-head"><h2 id="dlgT">Check the receipt</h2><button class="icon-btn" data-act="dlgclose" aria-label="Close">' + icon('close') + '</button></div>';
    if (d.busy) return head + '<div class="rcp-busy" role="status"><span class="spin" aria-hidden="true"></span><p><strong>Reading the receipt</strong></p><p class="muted">Gemini is reading the shop, the total and each item. It takes a few seconds.</p></div>';
    if (d.err) {
      if (d.fix === 'aitoken') {
        return head + '<p class="err-text" role="alert">' + esc(d.err) + '</p>' + (d.why ? '<p class="hint err-why">Details: ' + esc(d.why) + '</p>' : '') + '<div class="dialog-actions">' +
          '<button class="btn btn-secondary" data-act="rcptype">Type it in</button><button class="btn btn-primary" data-act="aitoken">Set it up</button></div>';
      }
      return head + '<p class="err-text" role="alert">' + esc(d.err) + '</p>' + (d.why ? '<p class="hint err-why">Details: ' + esc(d.why) + '</p>' : '') + '<div class="dialog-actions">' +
        '<label class="btn btn-secondary file-btn">Another photo<input type="file" accept="image/*" data-change="rcpfile" aria-label="Choose another photo of the receipt"></label>' +
        '<button class="btn btn-primary" data-act="rcptype">Type it in</button></div>';
    }
    const f = d.form, s = receiptSums(f), C = cfg(), H = holder(), cats = C.categories.concat(C.categories.indexOf('Other') >= 0 ? [] : ['Other']);
    const who = (x) => (x === 'shared' ? 'Shared' : 'Just ' + nm(x));
    const rows = f.items.map((x, i) => '<li class="rcp-row"><span class="rcp-n">' + esc(x.name) + '</span><span class="rcp-p">' + L.fmt(x.c) + '</span>' +
      '<button class="rcp-who' + (x.who !== 'shared' ? ' own' : '') + '" data-act="rcpitem" data-arg="' + i + '" aria-label="' + esc(x.name) + ': ' + esc(who(x.who)) + '. Tap to change">' + esc(who(x.who)) + '</button></li>').join('');
    const n = (s.shared > 0 ? 1 : 0) + (s.theirs > 0 ? 1 : 0);
    return head + '<div class="rcp-top">' + RECEIPT_SLIP + '<div><p class="k">Read from your photo</p><p class="rcp-total">' + L.fmt(s.total) + '</p><p class="k">' + f.items.length + (f.items.length === 1 ? ' item' : ' items') + '</p></div></div>' +
      '<div class="row2"><label class="field"><span>Shop</span><input class="input" id="rcpShop" maxlength="60" autocomplete="off" data-bind="dialog.form.shop" value="' + esc(f.shop) + '"></label>' +
      '<label class="field"><span>Date</span><input class="input" id="rcpDate" type="date" data-bind="dialog.form.date" value="' + esc(f.date) + '"></label></div>' +
      '<div class="row2"><label class="field"><span>Total</span><input class="input" id="rcpTotal" inputmode="decimal" autocomplete="off" data-bind="dialog.form.total" data-input="rcpsum" value="' + esc(f.total) + '"></label>' +
      '<label class="field"><span>Category</span><select class="input" id="rcpCat" data-bind="dialog.form.category">' + cats.map((c) => '<option' + (c === f.category ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></label></div>' +
      '<div class="seg" role="group" aria-label="Who paid">' + segBtn('rcppaid', 'a', f.payer === 'a', nm('a') + ' paid', 'a') + segBtn('rcppaid', 'b', f.payer === 'b', nm('b') + ' paid', 'b') + '</div>' +
      '<label class="check-row"><input type="checkbox" id="rcpCard" data-bind="dialog.form.onCard"' + (f.onCard ? ' checked' : '') + '> On ' + esc(poss(nm(H))) + ' ' + esc(cardLabel()) + '</label>' +
      (C.budget ? '<label class="check-row"><input type="checkbox" id="rcpBudget" data-bind="dialog.form.budget"' + (f.budget !== false ? ' checked' : '') + '> Counts towards our monthly budget</label>' : '') +
      (rows ? '<p class="k rcp-k">Tap anything that\'s just one person\'s</p><ul class="rcp-list">' + rows + '</ul>' : '') +
      '<div class="rcp-sum" id="rcpSum" aria-live="polite">' + receiptSumHtml(f) + '</div>' +
      (d.error ? '<p class="err-text" role="alert">' + esc(d.error) + '</p>' : '') +
      '<div class="dialog-actions"><button class="btn btn-primary" data-act="rcpsave">' + (n === 2 ? 'Add 2 spends' : 'Add the spend') + '</button></div>';
  }
  function saveReceipt() {
    const d = S.dialog, f = d && d.form;
    if (!f) return;
    const s = receiptSums(f), C = cfg(), shop = String(f.shop || '').trim().replace(/\s+/g, ' ').slice(0, 60) || 'Receipt';
    const stop = (m) => { d.error = m; render(); };
    if (s.total <= 0) return stop('Enter the total.');
    if (!ISO_DAY.test(f.date || '')) return stop('Pick the date.');
    if (s.shared < 0) return stop('The things marked as one person\'s add up to more than the total.');
    if (s.shared <= 0 && s.theirs <= 0) return stop('Everything here is just ' + poss(nm(s.payer)) + ', so there\'s nothing to share.');
    const made = [], mk = (amount, list, title, splitA) => {
      const fits = list.length > 1 && list.reduce((a, x) => a + x.c, 0) === amount;
      made.push(makeEntry({ id: uid('m'), kind: 'expense', source: 'manual', status: 'shared', date: f.date, title, amount, items: fits ? list.map((x) => x.c) : null,
        notes: fits ? list.map((x) => x.name) : null, payer: s.payer, onCard: !!f.onCard, offBudget: f.budget === false, splitA, category: f.category || 'Other' }));
    };
    if (s.shared > 0) mk(s.shared, f.items.filter((x) => x.who === 'shared'), shop, C.splitA);
    if (s.theirs > 0) mk(s.theirs, f.items.filter((x) => x.who === s.other), (shop + ', just ' + nm(s.other)).slice(0, 80), s.other === 'a' ? 100 : 0);
    const map = {};
    made.forEach((e) => { map[e.id] = e; });
    putEntries(f.date.slice(0, 7), map).then((ok) => {
      if (!ok) return;
      toast(made.length === 1 ? 'Saved ' + L.fmt(made[0].amount) + ' from ' + shop : 'Saved ' + made.length + ' spends from ' + shop);
      spendPop(made, shop);
    });
    S.dialog = null;
    if (S.view === 'add') { const back = (S.add && S.add.from) || 'home'; S.add = null; S.view = back; }
    render();
  }
  const snapReady = () => !S.readOnly && S.mode === 'firebase';
  function snapCard() {
    if (!snapReady()) return '';
    return '<section class="card bold snap"><div class="snap-head"><span class="news-ic" aria-hidden="true">' + icon('camera') + '</span><h2>Capture a receipt</h2></div>' +
      '<p class="muted">The app reads the shop, date, total and every item. You check it, mark anything that\'s just one person\'s, and it adds the spends.</p>' +
      '<label class="btn btn-primary btn-block file-btn">' + icon('camera') + 'Take a photo<input type="file" accept="image/*" capture="environment" data-change="rcpfile" aria-label="Take a photo of a receipt"></label>' +
      '<label class="btn btn-secondary btn-block file-btn" style="margin-top:12px">' + icon('image') + 'Choose from photos<input type="file" accept="image/*" data-change="rcpfile" aria-label="Choose a photo of a receipt"></label>' +
      '<p class="hint" style="margin-top:12px">Receipt photos go to Google\'s Gemini to be read. The app doesn\'t keep them, and nothing else in the app goes to Gemini.' +
      (window.HH_APPCHECK && !aiToken() ? ' An invisible Google reCAPTCHA check confirms it\'s our app, and Google\'s <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Privacy Policy</a> and <a href="https://policies.google.com/terms" target="_blank" rel="noopener">Terms</a> apply.' : '') + '</p>' +
      (S.readOnly ? '' : '<button class="link sm" data-act="aitoken">' + (aiToken() ? 'Receipt reading setup: token saved' : 'Receipt reading setup') + '</button>') + '</section>';
  }

  /* ---------- upload: statements, Splitwise files, and spends to check ---------- */
  function viewUpload() {
    const H = holder(), C = cfg(), hn = nm(H);
    const pend = pendingAll().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt || 0) - (b.createdAt || 0)));
    const groups = {};
    pend.forEach((e) => { (groups[e.date] = groups[e.date] || []).push(e); });
    let out = '<header class="top"><div><button class="back-link" data-act="go" data-arg="settings">' + icon('left') + 'Settings</button><p class="eyebrow">' + esc(poss(hn)) + ' ' + esc(cardLabel()) + '</p><h1 class="title">Upload</h1></div></header>' + snapCard();
    if (!S.readOnly) {
      out += '<section class="card bold"><h2 style="font-size:21px;margin-bottom:6px">Bring in ' + esc(poss(hn)) + ' card spends</h2>' +
        '<p class="muted" style="margin-bottom:14px">Export a CSV from Westpac, then choose the file here. Anything you\'ve already brought in is skipped, so overlapping dates are fine.</p>' +
        '<label class="btn btn-primary btn-block file-btn">' + (S.importing ? 'Bringing them in' : 'Choose CSV file') +
        '<input type="file" accept=".csv,text/csv,text/plain,application/vnd.ms-excel" data-change="importfile" aria-label="Choose a CSV file from Westpac"' + (S.importing ? ' disabled' : '') + '></label>' +
        '<details><summary>How to export from Westpac</summary><ol>' +
        '<li>Sign in to Westpac Online Banking in a web browser. The app may not offer exports.</li>' +
        '<li>Go to Overview, then Exports and reports.</li>' +
        '<li>Choose Export CSV, pick the ' + esc(cardLabel()) + ' account and the dates.</li>' +
        '<li>Save the file, then choose it here. On a phone it will be in Files or Downloads.</li></ol></details></section>';
    }
    if (!S.readOnly) {
      out += stagedCard() || swHistoryCard() || ('<section class="card"><h2 style="font-size:19px;margin-bottom:6px">Moving from Splitwise?</h2>' +
        (S.impBad ? '<p class="err-text" style="margin:0 0 8px">The prepared copy of your Splitwise files didn\'t match the originals, so it wasn\'t used. Choose the files here instead.</p>' : '') +
        '<p class="muted" style="margin-bottom:12px">Bring in your Splitwise export and your balance carries over. You can pick more than one file, one per group.</p>' +
        '<label class="btn btn-secondary btn-block file-btn">Choose Splitwise CSV<input type="file" multiple accept=".csv,text/csv,text/plain" data-change="swfiles" aria-label="Choose Splitwise CSV files"></label></section>');
    }
    out += importResultCard();
    if (!S.readOnly) {
      out += '<section class="card"><label class="switch-row"><span>Remember our choice for each shop<span class="hint" style="display:block;font-weight:600">Next import sorts those shops for you</span></span>' +
        '<input type="checkbox" class="switch" role="switch" data-change="remember"' + (C.remember ? ' checked' : '') + '></label></section>';
    }
    const days = Object.keys(groups);
    if (!days.length) {
      out += '<section class="card empty"><h2>Nothing to check</h2><p>When you bring in ' + esc(poss(hn)) + ' statement, new spends land here so you can mark them shared or ' + esc(poss(hn)) + ' own.</p></section>';
      return out;
    }
    out += '<p class="k" style="margin:4px 4px 10px">' + pend.length + ' to check. Shared spends count towards your budget and the balance.</p>';
    days.forEach((d) => {
      const list = groups[d];
      out += '<section class="card"><div class="group-head"><h2>' + esc(L.fmtDay(d)) + ' <span class="muted" style="font-family:var(--body);font-size:16px">' + L.fmt(sumAmt(list)) + '</span></h2>' +
        (S.readOnly || list.length < 2 ? '' : '<button class="btn btn-small btn-secondary" data-act="shareday" data-arg="' + d + '">Share whole day</button>') + '</div>' +
        '<ul class="list">' + list.map((e) => entryRow(e, 'upload')).join('') + '</ul></section>';
    });
    return out;
  }
  function importResultCard() {
    const r = S.importResult;
    if (!r) return '';
    if (r.error) return '<section class="card note-card err" role="alert"><h2>Couldn\'t read that file</h2><p>' + esc(r.error) + '</p><button class="link sm" data-act="dismissimport">Dismiss</button></section>';
    const lines = [];
    lines.push(r.added ? 'Brought in ' + r.added + (r.added === 1 ? ' spend' : ' spends') + (r.from ? ', ' + L.fmtDay(r.from) + (r.to !== r.from ? ' to ' + L.fmtDay(r.to) : '') : '') + '.' : 'No new spends in that file.');
    if (r.auto) lines.push(r.auto + ' sorted by the choices you remembered.');
    if (r.dupes) lines.push(r.dupes + (r.dupes === 1 ? ' looks like a spend' : ' look like spends') + ' you already added by hand, so ' + (r.dupes === 1 ? 'it won\'t' : 'they won\'t') + ' count twice.');
    if (r.dup) lines.push(r.dup + ' already here, skipped.');
    if (r.early) lines.push(r.early + (r.early === 1 ? ' spend' : ' spends') + ' from before ' + L.fmtDay(r.cut) + ' left out' + (r.why === 'splitwise' ? ': your Splitwise history already has them.' : ', as set in Customise.'));
    if (r.skipped) lines.push(r.skipped + (r.skipped === 1 ? ' payment or refund' : ' payments or refunds') + ' left out.');
    if (!r.ok) lines.push('Some spends didn\'t save. Try the same file again.');
    return '<section class="card note-card" role="status"><h2>' + (r.ok ? 'Done' : 'Partly done') + '</h2><ul>' + lines.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul><button class="link sm" data-act="dismissimport">Dismiss</button></section>';
  }
  function readFileText(file) {
    if (file.text) return file.text();
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result || '')); fr.onerror = rej; fr.readAsText(file); });
  }
  function importFile(file) {
    if (!file || S.importing) return;
    if (file.size > 5 * 1024 * 1024) { S.importResult = { error: 'That file is bigger than a statement export should be. Export a shorter date range and try again.' }; render(); return; }
    S.importing = true; render();
    readFileText(file).then((text) => {
      const rows = L.parseCSV(text);
      if (L.isSplitwise(rows)) {
        S.importing = false;
        const g = L.parseSplitwise(rows);
        if (g.error) { S.importResult = { error: g.error }; render(); } else openSplitwise([g], {});
        return;
      }
      const res = L.rowsToSpends(rows);
      if (res.error) { S.importing = false; S.importResult = { error: res.error }; render(); return; }
      const C = cfg(), H = holder(), ids = L.importIds(res.spends);
      const rules = S.rules || {}, rmap = rules.map || {}, rcats = rules.cats || {};
      const pool = matchPool();
      const byYm = {};
      let added = 0, auto = 0, dup = 0, dupes = 0, early = 0, from = null, to = null;
      const cut = C.cardFrom;
      res.spends.map((sp, i) => ({ sp, id: ids[i] })).sort((x, y) => (x.sp.date < y.sp.date ? -1 : 1)).forEach(({ sp, id }) => {
        if (S.byId[id]) { dup++; return; }
        if (cut && sp.date < cut) { early++; return; }
        const key = L.merchantKey(sp.desc);
        const rule = C.remember ? rmap[key] : null;
        let status = rule === 'shared' || rule === 'personal' ? rule : 'check';
        let dupOf = null;
        const twin = findTwin(pool, sp);
        if (twin) { status = 'dupe'; dupOf = twin.ref; dupes++; }
        else if (status !== 'check') auto++;
        const cat = C.remember && rcats[key] && C.categories.indexOf(rcats[key]) >= 0 ? rcats[key] : L.guessCategory(sp.desc, C.categories);
        const e = makeEntry({ id, kind: 'expense', source: 'import', status, date: sp.date, title: L.cleanTitle(sp.desc), raw: sp.desc, key, amount: sp.amount, payer: H, onCard: true, splitA: C.splitA, category: cat, dupOf });
        const ym = sp.date.slice(0, 7);
        (byYm[ym] = byYm[ym] || {})[id] = e;
        added++;
        if (!from || sp.date < from) from = sp.date;
        if (!to || sp.date > to) to = sp.date;
      });
      const months = Object.keys(byYm);
      return Promise.all(months.map((ym) => putEntries(ym, byYm[ym]))).then((oks) => {
        S.importing = false;
        S.importResult = { added, auto, dup, dupes, early, cut, why: C.cardFromWhy, skipped: res.skipped || 0, from, to, ok: oks.every(Boolean) };
        render();
      });
    }).catch(() => {
      S.importing = false; S.importResult = { error: "That file couldn't be opened. Export it again as CSV and try once more." }; render();
    });
  }
  /* Hand-added spends paid on the card, so an import of the same spend isn't counted twice. */
  function matchPool() {
    const H = holder(), used = {}, pool = [];
    S.entries.forEach((e) => { if (e.source === 'import' && e.dupOf) used[e.dupOf] = true; });
    S.entries.forEach((e) => {
      if (e.kind !== 'expense' || e.source === 'import' || e.status !== 'shared') return;
      if (e.parts && e.parts.length) {
        e.parts.forEach((p, i) => { if (p.payer === H) pool.push({ ref: e.id + ':' + i, amount: p.amount, date: e.date }); });
      } else if (e.onCard) {
        const amts = e.items && e.items.length > 1 ? e.items : [e.amount];
        amts.forEach((a, i) => pool.push({ ref: e.id + ':' + i, amount: a, date: e.date }));
      }
    });
    return pool.filter((p) => !used[p.ref] && p.amount >= 100);
  }
  function findTwin(pool, sp) {
    let best = null, bestGap = 99;
    pool.forEach((p) => {
      if (p.taken || p.amount !== sp.amount) return;
      const gap = Math.abs(L.daysBetweenInclusive(p.date, sp.date) - 1);
      if (sp.date >= p.date && gap <= 4 && gap < bestGap) { best = p; bestGap = gap; }
    });
    if (best) best.taken = true;
    return best;
  }
  function saveRule(key, status, cat) {
    const patch = {};
    if (status) patch.map = { [key]: status };
    if (cat) patch.cats = { [key]: cat };
    return upsert('hh/rules', patch, { map: {}, cats: {} });
  }
  function markEntries(ids, status, learn) {
    const C = cfg(), H = holder(), byYm = {};
    const add = (id) => { const r = S.byId[id]; if (r && r.e) (byYm[r.ym] = byYm[r.ym] || {})[id] = { status, updatedAt: Date.now() }; };
    ids.forEach(add);
    let msg = status === 'shared' ? 'Marked shared' : 'Kept as ' + poss(nm(H));
    if (learn && ids.length === 1) {
      const e = S.byId[ids[0]] && S.byId[ids[0]].e;
      if (e && e.source === 'import' && e.key && C.remember && (e.status === 'check' || e.status === 'personal' || e.status === 'shared')) {
        let more = 0;
        pendingAll().forEach((o) => { if (o.id !== e.id && o.key === e.key) { add(o.id); more++; } });
        saveRule(e.key, status, null);
        const shop = (e.title || '').split(' ')[0] || 'This shop';
        msg = status === 'shared' ? shop + ' will be marked shared from now on' : shop + ' will go to ' + poss(nm(H)) + ' from now on';
        if (more) msg += ' (' + more + ' more done now)';
      }
    }
    const months = Object.keys(byYm);
    if (!months.length) return;
    Promise.all(months.map((ym) => putEntries(ym, byYm[ym]))).then((oks) => { if (oks.every(Boolean)) toast(msg); });
  }

  /* ---------- recap ---------- */
  /* ---------- insights ---------- */
  /* Month: how one budget period went, with its pace against the budget. Year: the months side by side, where the
     money goes and which days are big. One chart look throughout: thin columns with rounded tops on a hairline
     baseline, the picked one darker with its value on a tag, a dashed line for the budget, numbers in a table below. */
  const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const monIdx = (ds) => (L.parseYmd(ds).getDay() + 6) % 7;
  const pIndex = (p) => p.y * 12 + p.m;
  const shortDay = (ds) => { const d = L.parseYmd(ds); return d.getDate() + ' ' + L.MONTHS[d.getMonth()]; };
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const byCat = (list) => { const o = {}; list.forEach((e) => { const c = e.category || 'Other'; o[c] = (o[c] || 0) + e.amount; }); return o; };
  const kpi = (label, value, sub, cents, key) => '<div class="kpi"><p class="k">' + esc(label) + '</p><p class="kpi-v"' + (cents != null ? ' data-count="' + cents + '" data-ck="' + esc(key) + '"' : '') + '>' + esc(value) + '</p>' + (sub ? '<p class="kpi-s">' + esc(sub) + '</p>' : '') + '</div>';

  function viewInsights() {
    S.pace = null; S.paceOn = false;
    return '<header class="top"><div><p class="eyebrow">How you two spend</p><h1 class="title">Insights</h1></div></header>' +
      '<div class="seg ins-mode" role="group" aria-label="Show">' + segBtn('insmode', 'month', S.insMode !== 'year', 'Month') + segBtn('insmode', 'year', S.insMode === 'year', 'Year') + '</div>' +
      (S.insMode === 'year' ? insYearView() : insMonthView());
  }

  function insMonthView() {
    const C = cfg(), t = today(), cur = curPeriod(), p = L.shiftPeriod(cur, S.recapOffset), list = spendsIn(p), total = sumAmt(list), budgetTotal = sumAmt(counted(list));
    const isCurrent = S.recapOffset === 0;
    let out = '<div class="period-nav"><button class="icon-btn" data-act="recapmove" data-arg="-1" aria-label="Previous month">' + icon('left') + '</button>' +
      '<h2>' + esc(L.periodLabel(p, t)) + (isCurrent ? ' so far' : '') + '</h2>' +
      '<button class="icon-btn" data-act="recapmove" data-arg="1" aria-label="Next month"' + (isCurrent ? ' disabled' : '') + '>' + icon('right') + '</button></div>';
    let sticker = '';
    if (C.budget) {
      const diff = C.budget - budgetTotal;
      sticker = diff >= 0 ? '<span class="sticker fern">Under by ' + L.fmtRound(diff) + '</span>' : '<span class="sticker coral">Over by ' + L.fmtRound(-diff) + '</span>';
    }
    out += '<section class="hero"><span class="blob" aria-hidden="true"></span><p class="hero-k">Shared spend</p><p class="hero-v" data-count="' + total + '" data-ck="insm-' + p.start + '">' + L.fmtRound(total) + '</p>' +
      '<p class="hero-sub">' + (C.budget ? (C.budgetSkip.length || budgetTotal !== total ? L.fmtRound(budgetTotal) + ' counts towards the ' + L.fmtRound(C.budget) + ' budget · ' : 'of ' + L.fmtRound(C.budget) + ' budget · ') : '') + list.length + (list.length === 1 ? ' spend' : ' spends') + '</p>' + (sticker ? '<div class="hero-foot">' + sticker + '</div>' : '') + '</section>';
    if (!list.length) return out + '<section class="card empty"><h2>Nothing shared yet</h2><p>Spends you add or mark shared for ' + esc(L.periodLabel(p, t)) + ' will show up here.</p></section>';

    // a month in progress is compared with the same stretch of the month before
    const days = L.daysBetweenInclusive(p.start, p.end), elapsed = isCurrent ? Math.min(days, L.daysBetweenInclusive(p.start, t)) : days;
    const prevP = L.shiftPeriod(p, -1), cutEnd = L.addDays(prevP.start, elapsed - 1);
    const prevList = spendsIn({ start: prevP.start, end: isCurrent && cutEnd < prevP.end ? cutEnd : prevP.end }), prevTotal = sumAmt(prevList);
    const prevName = L.periodLabel(prevP, t), ref = isCurrent ? 'this point in ' + prevName : prevName;
    let vs = 'New', vsSub = 'nothing in ' + prevName;
    if (prevTotal) {
      const pct = Math.round((total - prevTotal) / prevTotal * 100);
      vs = pct === 0 ? 'Same' : (pct > 0 ? '+' : '−') + Math.abs(pct) + '%';
      vsSub = 'vs ' + ref;
    }
    out += '<div class="kpis">' + kpi('Per day', L.fmtRound(Math.round(total / elapsed)), isCurrent ? 'so far' : 'on average', Math.round(total / elapsed), 'k-pd-' + p.start) +
      kpi('Spends', String(list.length), 'biggest ' + L.fmtRound(Math.max.apply(null, list.map((e) => e.amount)))) + kpi('Change', vs, vsSub) + '</div>';
    out += paceCard(p, C.budget ? counted(list) : list, isCurrent, C.budget, days, elapsed);

    if (C.budget && C.goal.name && !S.readOnly) {
      const left = C.budget - budgetTotal, moved = C.moves[p.start];
      if (typeof moved === 'number') out += '<section class="card note-card"><h2>Moved ' + L.fmtRound(moved) + ' to ' + esc(C.goal.name) + '</h2><p>Nice work, you two.</p></section>';
      else if (left > 0 && !isCurrent) out += '<section class="card note-card"><h2>You came in ' + L.fmtRound(left) + ' under</h2><p style="margin-bottom:12px">Put it towards ' + esc(C.goal.name) + '?</p><button class="btn btn-primary" data-act="move">Move ' + L.fmtRound(left) + ' to ' + esc(C.goal.name) + '</button></section>';
      else if (left > 0) out += '<p class="k" style="margin:0 4px 16px">When ' + esc(L.periodLabel(p, t)) + ' ends you can move what\'s left to ' + esc(C.goal.name) + '.</p>';
    }
    const prevCats = byCat(prevList);
    out += catCard(list, (c, v) => {
      const pv = prevCats[c] || 0;
      if (!pv) return isCurrent ? 'none by this point in ' + prevName : 'none in ' + prevName;
      const d = v - pv;
      if (Math.abs(d) < Math.max(1000, pv * 0.05)) return 'about the same as ' + ref;
      return L.fmtRound(Math.abs(d)) + (d > 0 ? ' more than ' : ' less than ') + ref;
    });
    out += whoPaidCard(list) + placesCard(list) + rentSummary(p) + pointsCard(list);
    const byDay = {};
    list.forEach((e) => { byDay[e.date] = (byDay[e.date] || 0) + e.amount; });
    const top = Object.keys(byDay).sort((a, b) => byDay[b] - byDay[a])[0];
    if (top) out += '<button class="card row-card" data-act="pickday" data-arg="' + top + '"><span><span class="k">Biggest day</span><span class="row-t">' + esc(L.fmtDay(top)) + ', ' + L.fmt(byDay[top]) + '</span></span>' + icon('arrow') + '</button>';
    return out;
  }

  /* Running total through the period against an even pace to the budget, with where today's pace ends up. */
  function paceCard(p, list, isCurrent, budget, days, elapsed) {
    const byDay = new Array(days).fill(0);
    list.forEach((e) => { const i = L.daysBetweenInclusive(p.start, e.date) - 1; if (i >= 0 && i < days) byDay[i] += e.amount; });
    const cum = [], dates = [];
    let s = 0;
    for (let i = 0; i < elapsed; i++) { s += byDay[i]; cum.push(s); dates.push(L.addDays(p.start, i)); }
    const proj = isCurrent && elapsed >= 3 && elapsed < days ? Math.round(s / elapsed * days) : null;
    const W = 320, Hh = 176, x0 = 4, x1 = 316, yb = 150, yt = 24;
    const yMax = Math.max(budget || 0, s, proj || 0, 100) * 1.1;
    const X = (k) => x0 + k / days * (x1 - x0), Y = (v) => yb - v / yMax * (yb - yt), f = (n) => n.toFixed(1);
    const px = cum.map((v, i) => X(i + 1)), py = cum.map((v) => Y(v)), lx = px[px.length - 1], ly = py[py.length - 1];
    let def;
    if (isCurrent) {
      def = '<strong>' + L.fmt(s) + '</strong> so far';
      if (proj != null) def += ', on track for about ' + L.fmtRound(proj) + (budget ? (proj > budget ? ', ' + L.fmtRound(proj - budget) + ' over budget' : ', inside the budget') : '');
    } else {
      def = 'Finished at <strong>' + L.fmt(s) + '</strong>' + (budget ? ', ' + (s <= budget ? L.fmtRound(budget - s) + ' under budget' : L.fmtRound(s - budget) + ' over budget') : '');
    }
    S.pace = { W, x0, x1, days, px, py, cum, byDay: byDay.slice(0, elapsed), dates, def };
    const line = 'M' + f(X(0)) + ' ' + yb + px.map((x, i) => ' L' + f(x) + ' ' + f(py[i])).join('');
    let svg = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" aria-hidden="true"><line class="pc-base" x1="' + x0 + '" y1="' + yb + '" x2="' + x1 + '" y2="' + yb + '"/>';
    if (budget) {
      svg += '<line class="pc-budget" x1="' + f(X(0)) + '" y1="' + yb + '" x2="' + f(X(days)) + '" y2="' + f(Y(budget)) + '"/>';
    }
    svg += '<path class="pc-area" d="' + line + ' L' + f(lx) + ' ' + yb + ' Z"/><path class="pc-line" pathLength="1" d="' + line + '"/>';
    if (proj != null) svg += '<line class="pc-proj" x1="' + f(lx) + '" y1="' + f(ly) + '" x2="' + f(X(days)) + '" y2="' + f(Y(proj)) + '"/>';
    svg += '<circle class="pc-dot" cx="' + f(lx) + '" cy="' + f(ly) + '" r="4.5"/>' +
      '<line class="pc-hair" id="pcHair" x1="0" y1="' + (yt - 8) + '" x2="0" y2="' + yb + '" visibility="hidden"/><circle class="pc-dot" id="pcHairDot" cx="0" cy="0" r="4.5" visibility="hidden"/>' +
      '<text class="pc-t" x="' + x0 + '" y="' + (Hh - 6) + '">' + esc(shortDay(p.start)) + '</text><text class="pc-t" x="' + x1 + '" y="' + (Hh - 6) + '" text-anchor="end">' + esc(shortDay(p.end)) + '</text></svg>';
    const rows = [];
    for (let i = 0; i < elapsed; i++) if (byDay[i]) rows.push([L.fmtDay(dates[i]), L.fmt(byDay[i]), L.fmt(cum[i])]);
    return '<section class="card"><div class="card-head"><h2>' + (isCurrent ? 'Pace' : 'How it built up') + '</h2></div>' +
      '<p class="pc-read" id="paceRead">' + def + '</p><div class="pace">' + svg + '</div>' +
      ((budget || proj != null) ? '<div class="keys">' + (budget ? '<p class="cols-key"><span class="cols-key-l" aria-hidden="true"></span>Even pace to the ' + esc(L.fmtRound(budget)) + ' budget</p>' : '') +
        (proj != null ? '<p class="cols-key"><span class="cols-key-d" aria-hidden="true"></span>Where this pace ends up</p>' : '') + '</div>' : '') +
      '<p class="hint">Touch the chart to see any day.</p>' +
      tableView(['Day', 'Spent', 'Running total'], rows) + '</section>';
  }
  function paceAt(ev) {
    const P = S.pace, box = P && ev.target && ev.target.closest ? ev.target.closest('.pace') : null;
    if (!box) return false;
    const svg = box.querySelector('svg'), r = svg && svg.getBoundingClientRect();
    if (!r || !r.width || !P.cum.length) return false;
    const fx = (ev.clientX - r.left) / r.width * P.W;
    const k = Math.max(1, Math.min(P.cum.length, Math.round((fx - P.x0) / (P.x1 - P.x0) * P.days)));
    const hair = document.getElementById('pcHair'), dot = document.getElementById('pcHairDot'), read = document.getElementById('paceRead');
    if (!hair || !dot || !read) return false;
    const x = P.px[k - 1].toFixed(1);
    hair.setAttribute('x1', x); hair.setAttribute('x2', x); hair.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', x); dot.setAttribute('cy', P.py[k - 1].toFixed(1)); dot.setAttribute('visibility', 'visible');
    read.innerHTML = '<strong>' + L.fmt(P.cum[k - 1]) + '</strong> by ' + esc(L.fmtDay(P.dates[k - 1])) + ' · ' + (P.byDay[k - 1] ? L.fmt(P.byDay[k - 1]) + ' that day' : 'nothing that day');
    return true;
  }
  function paceReset() {
    S.paceOn = false;
    if (!S.pace) return;
    ['pcHair', 'pcHairDot'].forEach((id) => { const el = document.getElementById(id); if (el) el.setAttribute('visibility', 'hidden'); });
    const read = document.getElementById('paceRead');
    if (read) read.innerHTML = S.pace.def;
  }

  function insYearData() {
    const t = today(), y = Number(t.slice(0, 4)) + S.insYearOff;
    let p0 = L.periodFor(y + '-01-01', cfg().resetDay);
    if (p0.start < y + '-01-01') p0 = L.shiftPeriod(p0, 1);
    const ps = [];
    for (let i = 0; i < 12; i++) ps.push(L.shiftPeriod(p0, i));
    const months = ps.map((p, i) => {
      const future = p.start > t, list = future ? [] : spendsIn(p);
      return { i, p, future, current: L.inPeriod(t, p), total: sumAmt(list), towards: sumAmt(counted(list)), n: list.length };
    });
    const range = { start: ps[0].start, end: ps[11].end };
    return { y, ps, months, range, list: spendsIn(range) };
  }
  function insSelMonth(Y) {
    const m = S.insSel != null ? Y.months[S.insSel] : null;
    if (m && !m.future) return m.i;
    const cur = Y.months.filter((x) => x.current)[0];
    if (cur) return cur.i;
    for (let i = 11; i >= 0; i--) if (!Y.months[i].future && Y.months[i].n) return i;
    return 0;
  }
  function insYearView() {
    const C = cfg(), t = today(), Y = insYearData(), curYear = S.insYearOff === 0;
    const firstDate = S.entries.reduce((m, e) => (e.date < m ? e.date : m), t);
    let out = '<div class="period-nav"><button class="icon-btn" data-act="insyear" data-arg="-1" aria-label="Previous year"' + (Y.y > Number(firstDate.slice(0, 4)) ? '' : ' disabled') + '>' + icon('left') + '</button>' +
      '<h2>' + Y.y + (curYear ? ' so far' : '') + '</h2>' +
      '<button class="icon-btn" data-act="insyear" data-arg="1" aria-label="Next year"' + (curYear ? ' disabled' : '') + '>' + icon('right') + '</button></div>';
    const list = Y.list, total = sumAmt(list), started = Y.months.filter((m) => !m.future), done = started.filter((m) => !m.current);
    out += '<section class="hero"><span class="blob" aria-hidden="true"></span><p class="hero-k">Shared spend</p><p class="hero-v" data-count="' + total + '" data-ck="insy-' + Y.y + '">' + L.fmtRound(total) + '</p>' +
      '<p class="hero-sub">' + list.length + (list.length === 1 ? ' spend' : ' spends') + ' in ' + Y.y + (curYear ? ' so far' : '') + '</p></section>';
    if (!list.length) return out + '<section class="card empty"><h2>Nothing shared yet</h2><p>Spends from ' + Y.y + ' will show up here.</p></section>';
    const basis = done.length ? done : started, avgM = Math.round(basis.reduce((a, m) => a + m.total, 0) / basis.length), useB = C.budget > 0;
    let k2;
    if (useB && done.length) {
      const under = done.filter((m) => m.towards <= C.budget).length;
      k2 = kpi('Under budget', under + ' of ' + done.length, done.length === 1 ? 'month' : 'months');
    } else {
      const bm = started.slice().sort((a, b) => b.total - a.total)[0];
      k2 = kpi('Biggest month', L.fmtRound(bm.total), L.MONTHS_FULL[bm.p.m]);
    }
    out += '<div class="kpis">' + kpi('Per month', L.fmtRound(avgM), done.length ? 'on average' : 'so far', avgM, 'k-pm-' + Y.y) + k2 + kpi('Typical spend', L.fmtRound(Math.round(total / list.length)), 'on average', Math.round(total / list.length), 'k-ts-' + Y.y) + '</div>';
    const markedY = useB && L.budgetTotals(list, C.budgetSkip).markedN > 0;
    const rows = started.map((m) => [L.periodLabel(m.p, t) + (m.current ? ' so far' : ''), L.fmt(m.total),
      useB ? (C.budget - m.towards >= 0 ? L.fmtRound(C.budget - m.towards) + ' under' : L.fmtRound(m.towards - C.budget) + ' over') : String(m.n)]);
    out += '<section class="card"><div class="card-head"><h2>Month by month</h2></div>' +
      (useB && (C.budgetSkip.length || markedY) ? '<p class="hint" style="margin:-6px 0 0">Bars show what counts towards the budget, so they leave out ' +
        esc(listNames(C.budgetSkip.concat(markedY ? ['spends marked not in it'] : []))) + '.</p>' : '') +
      monthsChart(Y) + tableView(['Month', 'Shared spend', useB ? 'Vs budget' : 'Spends'], rows) + '</section>';
    out += catCard(list, (c, v) => L.fmtRound(Math.round(v / started.length)) + ' a month on average');
    const w = weekdayStats(list, Y.range), all = w.days ? sumAmt(list) / w.days : 0, top = w.avg.indexOf(Math.max.apply(null, w.avg));
    const lead = all && w.avg[top] >= all * 1.25 ? WEEK[top] + 's are your big day, at about ' + (Math.round(w.avg[top] / all * 10) / 10) + ' times an average day.' : 'Spending is spread fairly evenly across the week.';
    out += '<section class="card"><div class="card-head"><h2>Days of the week</h2></div><p class="muted">' + esc(lead) + '</p>' + daysChart(list, Y.range) +
      tableView(['Day', 'Average', 'Total'], WEEK.map((d, i) => [d, L.fmt(w.avg[i]), L.fmt(w.tot[i])])) + '</section>';
    return out + whoPaidCard(list) + placesCard(list) + rentSummary(Y.range) + pointsCard(list);
  }

  /* Columns: one series, the picked column darker with its value on a tag, an optional dashed reference line. */
  function colsHtml(o) {
    const n = o.items.length, H = (v) => Math.max(0, Math.min(100, v / o.yMax * 100)).toFixed(1);
    let h = '<div class="cols" id="' + o.id + '" style="--n:' + n + '"><div class="cols-plot" role="group" aria-label="' + esc(o.label) + '">';
    if (o.ref) h += '<span class="cols-ref" style="bottom:' + H(o.ref) + '%" aria-hidden="true"></span>';
    o.items.forEach((it, i) => {
      if (it.off) { h += '<span class="col off" aria-hidden="true"></span>'; return; }
      const on = i === o.sel, hh = H(it.v);
      h += '<button type="button" class="col' + (on ? ' on' : '') + '" style="--ci:' + i + '" data-act="' + o.act + '" data-arg="' + i + '" aria-pressed="' + on + '" aria-label="' + esc(it.aria || it.name + ', ' + L.fmt(it.v)) + '">' +
        '<span class="col-fill" style="height:' + hh + '%"></span>' +
        (on ? '<span class="col-tip' + (i === 0 ? ' l' : i === n - 1 ? ' r' : '') + '" style="bottom:' + hh + '%">' + esc(L.fmtRound(it.v)) + '</span>' : '') + '</button>';
    });
    h += '</div><div class="cols-x" aria-hidden="true">' + o.items.map((it, i) => '<span' + (i === o.sel ? ' class="on"' : '') + '>' + esc(it.x) + '</span>').join('') + '</div>';
    if (o.ref) h += '<p class="cols-key"><span class="cols-key-l" aria-hidden="true"></span>' + esc(o.refLabel) + '</p>';
    return h + '<p class="cols-cap">' + o.cap + '</p></div>';
  }
  function monthsChart(Y) {
    const C = cfg(), t = today(), useB = C.budget > 0, sel = insSelMonth(Y), m = Y.months[sel], v = (x) => (useB ? x.towards : x.total);
    const started = Y.months.filter((x) => !x.future), avg = started.length ? Math.round(started.reduce((a, x) => a + v(x), 0) / started.length) : 0;
    const ref = useB ? C.budget : avg, yMax = Math.max.apply(null, [ref, 100].concat(Y.months.map(v))) * 1.12;
    let cap = '<strong>' + esc(L.periodLabel(m.p, t) + (m.current ? ' so far' : '')) + '</strong>: ' + L.fmt(m.total) + ' across ' + m.n + (m.n === 1 ? ' spend' : ' spends');
    if (useB) { const d = C.budget - m.towards; cap += ', ' + (d >= 0 ? L.fmtRound(d) + (m.current ? ' left' : ' under budget') : L.fmtRound(-d) + ' over budget'); }
    cap += '. <button class="link sm" data-act="insopen" data-arg="' + sel + '">Open ' + esc(m.p.r === 1 ? L.MONTHS_FULL[m.p.m] : 'this month') + '</button>';
    return colsHtml({ id: 'insMonths', act: 'insbar', label: 'Shared spend by month', sel, yMax, ref, refLabel: (useB ? 'Budget ' : 'Average ') + L.fmtRound(ref), cap,
      items: Y.months.map((x) => ({ x: L.MONTHS[x.p.m].charAt(0), name: L.periodLabel(x.p, t), v: v(x), off: x.future })) });
  }
  function weekdayStats(list, range) {
    const t = today(), first = list.reduce((m, e) => (e.date < m ? e.date : m), range.end);
    const from = first > range.start ? first : range.start, to = range.end < t ? range.end : t;
    const occ = [0, 0, 0, 0, 0, 0, 0], tot = [0, 0, 0, 0, 0, 0, 0];
    for (let d = from, g = 0; d <= to && g < 400; d = L.addDays(d, 1), g++) occ[monIdx(d)]++;
    list.forEach((e) => { tot[monIdx(e.date)] += e.amount; });
    return { occ, tot, avg: tot.map((v, i) => (occ[i] ? Math.round(v / occ[i]) : 0)), days: occ.reduce((a, b) => a + b, 0) };
  }
  function daysChart(list, range) {
    const w = weekdayStats(list, range), all = w.days ? Math.round(sumAmt(list) / w.days) : 0;
    const top = w.avg.indexOf(Math.max.apply(null, w.avg)), sel = S.insDay != null ? S.insDay : top;
    const cap = '<strong>' + WEEK[sel] + 's</strong>: ' + L.fmt(w.avg[sel]) + ' on average, ' + L.fmt(w.tot[sel]) + ' over ' + w.occ[sel] + ' ' + WEEK[sel] + (w.occ[sel] === 1 ? '' : 's') + '.';
    return colsHtml({ id: 'insDays', act: 'insday', label: 'Average spend by day of the week', sel, yMax: Math.max.apply(null, [all, 100].concat(w.avg)) * 1.15, ref: all, refLabel: 'Average day ' + L.fmtRound(all), cap,
      items: WEEK.map((d, i) => ({ x: d.charAt(0), aria: d + ', ' + L.fmt(w.avg[i]) + ' on average', v: w.avg[i] })) });
  }
  /* Picking a column redraws just that chart, keeping focus on the column for keyboard use. */
  function insPick(kind, i) {
    const id = kind === 'm' ? 'insMonths' : 'insDays', box = document.getElementById(id);
    if ((kind === 'm' ? S.insSel : S.insDay) === i && box && box.querySelector('.col.on[data-arg="' + i + '"]')) return;
    if (kind === 'm') S.insSel = i; else S.insDay = i;
    if (!box) return;
    const had = box.contains(document.activeElement), Y = insYearData();
    box.outerHTML = kind === 'm' ? monthsChart(Y) : daysChart(Y.list, Y.range);
    if (had) { const b = document.querySelector('#' + id + ' [data-arg="' + i + '"]'); if (b) b.focus({ preventScroll: true }); }
  }
  function tableView(head, rows) {
    return '<details class="tv"><summary>Show the numbers</summary><table><thead><tr>' + head.map((h, i) => '<th scope="col"' + (i ? ' class="n"' : '') + '>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map((r) => '<tr>' + r.map((c, i) => (i ? '<td class="n">' + esc(c) + '</td>' : '<th scope="row">' + esc(c) + '</th>')).join('') + '</tr>').join('') + '</tbody></table></details>';
  }
  function catCard(list, noteFn) {
    const total = sumAmt(list) || 1, cats = byCat(list), keys = Object.keys(cats).sort((a, b) => cats[b] - cats[a]), cmax = cats[keys[0]] || 1;
    return '<section class="card"><div class="card-head"><h2>Where it went</h2></div><p class="hint" style="margin:-8px 0 10px">Tap one to see what\'s in it.</p>' + keys.map((c) => {
      const note = noteFn ? noteFn(c, cats[c]) : '';
      return '<button type="button" class="hbar hbar-btn" data-act="inscat" data-arg="' + esc(c) + '"><span class="hbar-top"><span>' + esc(c) + '</span><span>' + L.fmt(cats[c]) + ' <span class="muted">' + Math.round(cats[c] / total * 100) + '%</span>' + icon('right') + '</span></span>' +
        '<span class="hbar-track" aria-hidden="true"><span class="hbar-fill" style="width:' + Math.max(2, Math.round(cats[c] / cmax * 100)) + '%"></span></span>' +
        (note ? '<span class="hbar-note">' + esc(note) + '</span>' : '') + '</button>';
    }).join('') + '</section>';
  }
  /* What the Insights screen is showing right now: this month, another month, or a year. */
  function insContext() {
    const t = today();
    if (S.insMode === 'year') { const Y = insYearData(); return { label: Y.y + (S.insYearOff === 0 ? ' so far' : ''), list: Y.list }; }
    const p = L.shiftPeriod(curPeriod(), S.recapOffset);
    return { label: L.periodLabel(p, t) + (S.recapOffset === 0 ? ' so far' : ''), list: spendsIn(p) };
  }
  function insCatDialog(d) {
    const ctx = insContext(), C = cfg();
    const items = ctx.list.filter((e) => (e.category || 'Other') === d.cat).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.amount - a.amount));
    const total = sumAmt(items), g = {};
    items.forEach((e) => { const k = String(e.title || 'Spend').trim().toLowerCase().replace(/\s+/g, ' '); const x = g[k] || (g[k] = { name: cap1(String(e.title || 'Spend').trim()), n: 0, total: 0 }); x.n++; x.total += e.amount; });
    const groups = Object.keys(g).map((k) => g[k]).sort((a, b) => b.total - a.total).slice(0, 5);
    const cats = C.categories.concat(C.categories.indexOf('Other') >= 0 ? [] : ['Other']).filter((c) => c !== d.cat);
    let h = '<p class="eyebrow">' + esc(ctx.label) + '</p><h2 id="dlgT">' + esc(d.cat) + '</h2>' +
      '<p class="muted">' + L.fmt(total) + ' across ' + items.length + (items.length === 1 ? ' spend' : ' spends') + '.</p>';
    if (!items.length) return h + '<div class="dialog-actions"><button class="btn btn-primary" data-act="dlgclose">Done</button></div>';
    if (groups.length > 1) {
      h += '<h3 class="sub-h">Most of it</h3><ul class="places">' + groups.map((x) => '<li class="place"><span class="place-n">' + esc(x.name) + '</span><span class="place-c">' + (x.n === 1 ? 'once' : x.n + ' times') + '</span><span class="place-t">' + L.fmt(x.total) + '</span></li>').join('') + '</ul>';
    }
    h += '<h3 class="sub-h">Every spend</h3>' + (S.readOnly ? '' : '<p class="hint" style="margin:-4px 0 6px">Tap one to move it to another category.</p>') + '<ul class="cat-list">' + items.slice(0, 300).map((e) =>
      '<li><button type="button" class="cat-row" data-act="inscatopen" data-arg="' + esc(e.id) + '"' + (S.readOnly ? ' disabled' : '') + ' aria-expanded="' + (d.open === e.id) + '"><span class="cr-d">' + esc(shortDay(e.date)) + '</span><span class="cr-t">' + esc(e.title || 'Spend') + (e.offBudget && C.budget ? '<span class="cr-nb">Not in budget</span>' : '') + '</span><span class="cr-a">' + L.fmt(e.amount) + '</span></button>' +
      (d.open === e.id ? '<div class="chips cat-move">' + cats.map((c) => '<button type="button" class="chip" data-act="inscatset" data-arg="' + esc(e.id + '|' + c) + '">' + esc(c) + '</button>').join('') + '</div>' : '') + '</li>').join('') + '</ul>' +
      '<div class="dialog-actions"><button class="btn btn-primary" data-act="dlgclose">Done</button></div>';
    return h;
  }
  function whoPaidCard(list) {
    const C = cfg(), paid = { a: 0, b: 0 };
    list.forEach((e) => { paid.a += (e.paid && e.paid.a) || 0; paid.b += (e.paid && e.paid.b) || 0; });
    const pmax = Math.max(1, paid.a, paid.b), sum = paid.a + paid.b || 1;
    return '<section class="card"><div class="card-head"><h2>Who paid</h2></div>' + ['a', 'b'].map((x) => '<div class="hbar"><div class="hbar-top"><span>' + esc(nm(x)) + '</span><span>' + L.fmt(paid[x]) + ' <span class="muted">' + Math.round(paid[x] / sum * 100) + '%</span></span></div>' +
      '<div class="hbar-track" aria-hidden="true"><span class="hbar-fill" style="width:' + Math.max(paid[x] ? 2 : 0, Math.round(paid[x] / pmax * 100)) + '%;background:' + colOf(x).main + '"></span></div></div>').join('') +
      '<p class="hint">Each of you owes ' + C.splitA + '/' + (100 - C.splitA) + ' unless you set a custom split. The balance on Home keeps track.</p></section>';
  }
  /* Places you keep going back to: names seen at least twice, most visits first. */
  function placesCard(list) {
    const g = {};
    list.forEach((e) => {
      const name = String(e.title || '').trim();
      if (!name) return;
      const k = name.toLowerCase().replace(/\s+/g, ' '), x = g[k] || (g[k] = { name, count: 0, total: 0, last: '' });
      x.count++; x.total += e.amount;
      if (e.date >= x.last) { x.last = e.date; x.name = name; }
    });
    const top = Object.keys(g).map((k) => g[k]).filter((x) => x.count >= 2).sort((a, b) => b.count - a.count || b.total - a.total).slice(0, 5);
    if (!top.length) return '';
    return '<section class="card"><div class="card-head"><h2>Where you go most</h2></div><ul class="places">' + top.map((x) =>
      '<li class="place"><span class="place-n">' + esc(cap1(x.name)) + '</span><span class="place-c">' + x.count + ' times</span><span class="place-t">' + L.fmt(x.total) + '</span></li>').join('') + '</ul></section>';
  }
  function rentSummary(range) {
    const rentIn = S.entries.filter((e) => e.kind === 'rent' && L.inPeriod(e.date, range));
    if (!rentIn.length) return '';
    const rf = payerOf(rentIn[rentIn.length - 1]) === 'a' ? 'a' : 'b';
    return '<section class="card"><div class="card-head"><h2>Rent</h2><span class="amt">' + L.fmt(sumAmt(rentIn)) + '</span></div><p class="muted">' + esc(nm(rf)) + ' to ' + esc(nm(other(rf))) + '. It\'s in the balance on Home, not in shared spend.</p></section>';
  }
  function pointsCard(list) {
    const C = cfg(), H = holder(), cardList = list.filter((e) => e.onCard), onCard = sumAmt(cardList), est = L.estimatePoints(cardList, C.card);
    let out = '<section class="card"><div class="card-head"><h2>' + esc(programLabel()) + ' points</h2></div>';
    if (C.card.pointsBal != null && C.card.pointsAsOf) {
      // every card spend earns, shared or not, so the running balance counts all of them since the statement date
      const since = S.entries.filter((e) => e.kind === 'expense' && e.onCard && e.date > C.card.pointsAsOf && e.date <= today());
      const e2 = L.estimatePoints(since, C.card), add = e2 ? e2.velocity : 0;
      out += '<div class="stat"><span class="muted" style="font-weight:700">Balance now, about</span><span class="big">' + (C.card.pointsBal + add).toLocaleString('en-AU') + '</span></div>' +
        '<p class="hint" style="margin-bottom:14px">' + C.card.pointsBal.toLocaleString('en-AU') + ' on ' + esc(dateY(C.card.pointsAsOf)) +
        (e2 ? (add ? ', plus about ' + add.toLocaleString('en-AU') + ' from ' + since.length + (since.length === 1 ? ' card spend' : ' card spends') + ' since.' : '. No card spends brought in since then yet.') : '. Pick how the card earns in Customise to keep it going.') + '</p>';
    }
    if (est) {
      const kinds = [];
      if (est.byType.everyday) kinds.push(L.fmt(est.byType.everyday) + ' at supermarkets, petrol and utilities');
      if (est.byType.other) kinds.push(L.fmt(est.byType.other) + ' on everything else');
      if (est.byType.intl) kinds.push(L.fmt(est.byType.intl) + ' overseas');
      out += '<div class="stat"><span class="muted" style="font-weight:700">' + L.fmt(onCard) + ' on ' + esc(poss(nm(H))) + ' card</span><span class="big">' + est.velocity.toLocaleString('en-AU') + '</span></div>' +
        (C.card.earns === 'altitude' ? '<p class="hint">From ' + est.points.toLocaleString('en-AU') + ' Altitude Points, at ' + est.ratio + ' to 1 Velocity Point.</p>' : '') +
        (kinds.length ? '<p class="hint">' + esc(listNames(kinds)) + '.</p>' : '') +
        '<p class="hint">An estimate from Westpac\'s published rates. Only spends marked as on the card count, so Splitwise history isn\'t included.</p>';
    } else {
      out += '<p class="muted" style="margin-bottom:8px">' + L.fmt(onCard) + ' of shared spend went on ' + esc(poss(nm(H))) + ' ' + esc(cardLabel()) + '.</p>' +
        '<button class="link" data-act="go" data-arg="custom">Pick how the card earns points</button>';
    }
    return out + '</section>';
  }

  /* ---------- fun fact ---------- */
  /* A different fact each time the app opens, worked out from this year's shared spends. A fact only makes the
     list when there's enough behind it, and they're all told kindly: nothing that reads as a dig at either of you. */
  const DAY_BATCH = /(^|\s)(expenses?|spends?)$/i;
  function funFacts() {
    const t = today(), y = t.slice(0, 4), list = S.entries.filter((e) => L.isSpend(e) && e.date.slice(0, 4) === y && e.date <= t);
    if (list.length < 10) return [];
    const out = [], total = sumAmt(list), by = {};
    list.forEach((e) => { const k = String(e.title || '').trim().toLowerCase().replace(/\s+/g, ' '); if (!k || DAY_BATCH.test(k)) return; const x = by[k] || (by[k] = { name: cap1(String(e.title).trim()), n: 0, sum: 0, cats: {} }); x.n++; x.sum += e.amount; x.cats[e.category || 'Other'] = 1; });
    const named = Object.keys(by).map((k) => by[k]);
    const place = named.slice().sort((a, b) => b.n - a.n || b.sum - a.sum)[0];
    if (place && place.n >= 3) out.push(place.name + ' is your most visited spot this year: ' + place.n + ' trips, about ' + L.fmtRound(Math.round(place.sum / place.n)) + ' a go.');
    const treat = named.filter((x) => x.cats['Dining out'] || x.cats['Eating out']).sort((a, b) => b.n - a.n || b.sum - a.sum)[0];
    if (treat && treat.n >= 3 && treat !== place) out.push(treat.name + ' is your go-to treat: ' + treat.n + ' times this year.');
    const range = { start: y + '-01-01', end: y + '-12-31' }, w = weekdayStats(list, range), all = w.days ? total / w.days : 0;
    const top = w.avg.indexOf(Math.max.apply(null, w.avg)), low = w.avg.indexOf(Math.min.apply(null, w.avg));
    if (all && w.avg[top] >= all * 1.3) out.push(WEEK[top] + 's are your big day: about ' + (Math.round(w.avg[top] / all * 10) / 10) + ' times an average day.');
    if (all && low !== top) out.push(WEEK[low] + 's are your quietest day, at about ' + L.fmtRound(w.avg[low]) + ' on average.');
    const weekend = list.filter((e) => monIdx(e.date) >= 5).reduce((a, e) => a + e.amount, 0), share = Math.round(weekend / total * 100);
    if (share >= 35) out.push(share + '% of your shared spending happens on weekends.');
    const sorted = list.map((e) => e.amount).sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
    out.push('Your typical shared spend is about ' + L.fmtRound(median) + '.');
    const months = {};
    list.forEach((e) => { const m = e.date.slice(0, 7); if (m < t.slice(0, 7)) months[m] = (months[m] || 0) + e.amount; });
    const mk = Object.keys(months).sort((a, b) => months[b] - months[a]);
    if (mk.length >= 3) out.push(L.MONTHS_FULL[Number(mk[0].slice(5)) - 1] + ' was your biggest month so far this year, at ' + L.fmtRound(months[mk[0]]) + '.');
    const days = {}; list.forEach((e) => { days[e.date] = 1; });
    const first = list.reduce((m, e) => (e.date < m ? e.date : m), t);
    let run = 0, best = 0, bestEnd = '';
    for (let d = first, g = 0; d <= t && g < 400; d = L.addDays(d, 1), g++) { if (days[d]) run = 0; else { run++; if (run > best) { best = run; bestEnd = d; } } }
    if (best >= 4) out.push('Your longest stretch without a shared spend this year was ' + best + ' days, up to ' + L.fmtDay(bestEnd) + '.');
    const weeks = Math.max(1, daysTo(first, t) / 7);
    out.push("You've shared " + list.length + ' spends together this year, about ' + Math.max(1, Math.round(list.length / weeks)) + ' a week.');
    const catN = {}; list.forEach((e) => { const c = e.category || 'Other'; if (c !== 'Other') catN[c] = (catN[c] || 0) + 1; });
    const ck = Object.keys(catN).sort((a, b) => catN[b] - catN[a])[0];
    if (ck && catN[ck] >= 5) out.push(ck + ' has come up ' + catN[ck] + ' times this year, about once every ' + Math.max(1, Math.round(daysTo(first, t) / catN[ck])) + ' days.');
    const p = curPeriod(), prev = L.shiftPeriod(p, -1), el = L.daysBetweenInclusive(p.start, t), cut = L.addDays(prev.start, el - 1);
    const now = sumAmt(spendsIn({ start: p.start, end: t })), then = sumAmt(spendsIn({ start: prev.start, end: cut < prev.end ? cut : prev.end }));
    if (then > 0 && now > 0) {
      const pct = Math.round((now - then) / then * 100), pn = L.periodLabel(prev, t);
      if (pct <= -5) out.push("So far this month you're " + Math.abs(pct) + '% under where you were at this point in ' + pn + '. Nice work.');
      else if (pct >= 5) out.push('This month is running ' + pct + '% ahead of ' + pn + ' at the same point.');
    }
    return out;
  }
  function factCard(i, fresh) {
    const facts = funFacts();
    if (!facts.length) return '';
    const n = i == null ? S.factN : i, text = facts[((n % facts.length) + facts.length) % facts.length];
    return '<section class="card fact" id="factCard"><div class="fact-top"><span class="news-ic" aria-hidden="true">' + icon('star') + '</span><p class="k">Fun fact</p>' +
      (facts.length > 1 ? '<button class="link sm" data-act="factnext">Another</button>' : '') + '</div><p class="fact-t' + (fresh ? ' fact-in' : '') + '" aria-live="polite">' + esc(text) + '</p></section>';
  }

  /* ---------- coming up ---------- */
  /* The next rent, bills that come round again in your history (same name, steady gaps), and regular bills you add.
     Groceries and eating out repeat as well, so they're left out; anything else can be dismissed with "Not a bill". */
  const BILL_CATS = /^(water|insurance|heat\/gas|tv\/phone\/internet|electricity|energy|utilities|bills?|rates|council|strata|phone|internet|gas|rego)$/i;
  const BILL_WORDS = /\b(water|council|strata|insurance|rego|registration|gas|electricity|energy|internet|nbn|phone|mobile|rates|levy|power)\b/i;
  const NOT_BILLS = /^(groceries|dining out|eating out|liquor|takeaway|coffee)$/i;
  const daysTo = (from, to) => L.daysBetweenInclusive(from, to) - 1;
  const everyFor = (d) => (d < 10 ? 'week' : d < 21 ? 'fortnight' : d < 50 ? 'month' : d < 135 ? 'quarter' : d < 270 ? 'half' : 'year');
  function detectBills() {
    const C = cfg(), g = {};
    S.entries.forEach((e) => {
      if (!L.isSpend(e) || !e.title || NOT_BILLS.test(e.category || 'Other')) return;
      const k = String(e.title).trim().toLowerCase().replace(/\s+/g, ' ');
      if (k) (g[k] = g[k] || []).push(e);
    });
    const out = [];
    Object.keys(g).forEach((k) => {
      if (C.billsHide.indexOf(k) >= 0 || g[k].length < 2) return;
      const list = g[k].slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)), gaps = [];
      for (let i = 1; i < list.length; i++) gaps.push(daysTo(list[i - 1].date, list[i].date));
      const sorted = gaps.slice().sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
      if (med < 25 || med > 400 || sorted[sorted.length - 1] > sorted[0] * 1.6) return;
      const last = list[list.length - 1], avg = Math.round(sumAmt(list) / list.length);
      if (!(BILL_CATS.test(last.category || '') || BILL_WORDS.test(k) || (avg >= 15000 && med >= 60))) return;
      out.push({ key: k, name: cap1(String(last.title).trim()), amount: avg, gap: med, last: last.date });
    });
    return out;
  }
  /* The next due date of a bill you added: its first due date moved on by its schedule until it's from 3 days ago on. */
  function billNext(b, t) {
    let d = b.from;
    const back = L.addDays(t, -3);
    for (let i = 0; d < back && i < 800; i++) {
      if (b.every === 'week' || b.every === 'fortnight') d = L.addDays(d, EVERY_DAYS[b.every]);
      else {
        const x = L.parseYmd(b.from), n = { month: 1, quarter: 3, half: 6, year: 12 }[b.every] * (i + 1);
        const m = L.addMonths(x.getFullYear(), x.getMonth(), n), dim = L.daysInMonth(m[0], m[1]);
        d = L.ymd(new Date(m[0], m[1], Math.min(x.getDate(), dim)));
      }
    }
    return d;
  }
  function nextWeekday(t, day) { const d = L.parseYmd(t), add = (Number(day) - d.getDay() + 7) % 7; return L.addDays(t, add); }
  const whenLabel = (ds, t) => { const n = daysTo(t, ds); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : L.fmtDay(ds); };
  function comingUpRows() {
    const C = cfg(), t = today(), rows = [];
    if (C.rent.on && C.rent.amount) rows.push({ when: nextWeekday(t, C.rent.day), name: 'Rent', sub: nm(C.rent.from) + ' to ' + nm(other(C.rent.from)), amount: C.rent.amount, rent: true });
    detectBills().forEach((b) => {
      const next = L.addDays(b.last, b.gap), d = daysTo(t, next);
      if (d > 45 || d < -60) return;
      rows.push({ when: d < 0 ? t : next, due: d < 0, name: b.name, sub: 'about ' + EVERY_LABEL[everyFor(b.gap)] + ' · last ' + shortDay(b.last), amount: b.amount, approx: true, key: b.key });
    });
    C.bills.forEach((b) => {
      const next = billNext(b, t), d = daysTo(t, next);
      if (d <= 45) rows.push({ when: next, due: d < 0, name: b.name, sub: EVERY_LABEL[b.every], amount: b.amount });
    });
    return rows.sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : (b.due ? 1 : 0) - (a.due ? 1 : 0)));
  }
  function comingUpCard() {
    const t = today(), rows = comingUpRows();
    const add = S.readOnly ? '' : '<button class="link sm" data-act="billsopen">Add a bill</button>';
    if (!rows.length) {
      return '<section class="card soon"><div class="card-head"><h2>Coming up</h2>' + add + '</div><p class="muted">Bills that repeat in your spends show up here before they\'re due. Add ones you pay on a schedule, like strata or insurance.</p></section>';
    }
    const month = rows.filter((r) => !r.rent && daysTo(t, r.when) <= 30).reduce((a, r) => a + r.amount, 0);
    return '<section class="card soon"><div class="card-head"><h2>Coming up</h2>' + add + '</div>' +
      (month ? '<p class="muted soon-sum">About ' + L.fmtRound(month) + ' in bills over the next 30 days.</p>' : '') +
      '<ul class="soon-list">' + rows.map((r) => '<li class="soon-row"><span class="soon-when' + (r.due ? ' due' : '') + '">' + esc(r.due ? 'Looks due' : whenLabel(r.when, t)) + '</span>' +
        '<span class="soon-main"><span class="soon-n">' + esc(r.name) + '</span><span class="k">' + esc(r.sub) + '</span>' +
        (r.key && !S.readOnly ? '<button class="link sm soon-x" data-act="billhide" data-arg="' + esc(r.key) + '">Not a bill</button>' : '') + '</span>' +
        '<span class="soon-a">' + (r.approx ? '<span class="sr">about </span><span aria-hidden="true">~</span>' : '') + L.fmtRound(r.amount) + '</span></li>').join('') + '</ul></section>';
  }
  function billsDialog(d) {
    const C = cfg(), t = today(), F = d.form;
    const opt = (v) => '<option value="' + v + '"' + (F.every === v ? ' selected' : '') + '>' + cap1(EVERY_LABEL[v]) + '</option>';
    return '<h2 id="dlgT">Regular bills</h2><p class="muted">Add bills you pay on a schedule, like strata or insurance. They show on Home in the six weeks before they\'re due.</p>' +
      (C.bills.length ? '<ul class="bill-list">' + C.bills.map((b) => '<li><span class="soon-main"><span class="soon-n">' + esc(b.name) + '</span><span class="k">' + esc(cap1(EVERY_LABEL[b.every])) + ' · next ' + esc(L.fmtDay(billNext(b, t))) + '</span></span>' +
        '<span class="soon-a">' + L.fmtRound(b.amount) + '</span><button class="link sm danger" data-act="billdel" data-arg="' + esc(b.id) + '">Remove</button></li>').join('') + '</ul>' : '') +
      '<div class="bill-form"><label class="field"><span>Bill</span><input class="input" id="billName" maxlength="40" placeholder="Strata" autocomplete="off" data-bind="dialog.form.name" value="' + esc(F.name) + '"></label>' +
      '<div class="row2"><label class="field"><span>About</span><div class="money"><input class="input" id="billAmt" inputmode="decimal" placeholder="0" data-bind="dialog.form.amount" value="' + esc(F.amount) + '"></div></label>' +
      '<label class="field"><span>How often</span><select class="input" id="billEvery" data-bind="dialog.form.every">' + ['month', 'quarter', 'half', 'year', 'week', 'fortnight'].map(opt).join('') + '</select></label></div>' +
      '<label class="field"><span>Next due</span><input class="input" id="billFrom" type="date" data-bind="dialog.form.from" value="' + esc(F.from) + '"></label>' +
      (d.error ? '<p class="err-text" role="alert">' + esc(d.error) + '</p>' : '') +
      '<button class="btn btn-secondary btn-block" data-act="billadd">' + icon('plus') + 'Add this bill</button></div>' +
      '<div class="dialog-actions"><button class="btn btn-primary" data-act="dlgclose">Done</button></div>';
  }

  /* ---------- deals ---------- */
  /* Sale days (a shop's regular sale, like a monthly 20% off Saturday) and this week's supermarket specials.
     Sale days, the watch list and what you're keen on live in hh/deals with the rest of your data. Specials come from
     deals.json, which a free GitHub job builds every morning from public sources. Each phone filters it, so nothing about
     the two of you goes into that file. */
  const SALE_IDEAS = [
    { key: 'luckymart', store: 'Lucky Mart', offer: 'Up to 20% off', where: 'Shop 2, 2 Wilkes Ave, Artarmon', rule: { k: 'nth', n: 2, dow: 6 },
      link: 'https://www.sushifactory.com.au/our-group/', note: 'Japanese grocer by Artarmon station. Its sale is the 2nd Saturday of every month.' }
  ];
  const DEALS_BASE = { sales: [], watch: [], keen: {}, list: [] };
  const centsOk = (v) => (typeof v === 'number' && isFinite(v) && v > 0 && v < 1e7 ? Math.round(v) : 0);
  const LINK_OK = /^https:\/\/(www\.)?(ozbargain\.com\.au|coles\.com\.au|woolworths\.com\.au|harrisfarm\.com\.au|umall\.com\.au|meatemporium\.com\.au|sushifactory\.com\.au)\/[^\s"'<>]*$/;
  const linkOk = (u) => (LINK_OK.test(String(u || '')) ? String(u).slice(0, 300) : '');
  const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
  /* Specials read from our screenshots (see the reader further down): their categories match the shops' own, so they land in the right aisle. */
  const SNAP_CATS = ['Fruit & Veg', 'Meat & Seafood', 'Deli', 'Dairy, Eggs & Fridge', 'Bakery', 'Pantry', 'Freezer', 'Snacks & Confectionery', 'Drinks', 'Liquor',
    'Household', 'Health & Beauty', 'Baby', 'Pet', 'Other'];
  const SNAP_MAX = 400, SNAP_FILES = 12;
  const flat = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const shopLabel = (s) => (s === 'Woolworths' ? 'Woolies' : s);
  function saleRule(r) {
    if (!r || typeof r !== 'object') return null;
    if (r.k === 'once') return ISO_DAY.test(r.date || '') ? { k: 'once', date: r.date } : null;
    if (r.k === 'weekly') return { k: 'weekly', dow: L.clamp(r.dow, 0, 6) };
    if (r.k === 'monthly') return { k: 'monthly', day: L.clamp(r.day, 1, 31) };
    if (r.k === 'nth') return { k: 'nth', n: L.clamp(r.n, 1, 5), dow: L.clamp(r.dow, 0, 6) };
    return null;
  }
  function dealsCfg() {
    const d = S.dealsDoc && typeof S.dealsDoc === 'object' ? S.dealsDoc : {};
    const days = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && ISO_DAY.test(x)).slice(-60) : []);
    return {
      sales: (Array.isArray(d.sales) ? d.sales : []).filter((x) => x && typeof x.id === 'string' && typeof x.store === 'string' && x.store.trim() && saleRule(x.rule)).slice(0, 30).map((x) => ({
        id: x.id.slice(0, 24), key: typeof x.key === 'string' ? x.key.slice(0, 24) : '', store: x.store.trim().slice(0, 40), offer: String(x.offer || '').slice(0, 60),
        where: String(x.where || '').slice(0, 80), note: String(x.note || '').slice(0, 160), link: linkOk(x.link), rule: saleRule(x.rule),
        keen: x.keen !== false, skip: days(x.skip), on: days(x.on)
      })),
      watch: (Array.isArray(d.watch) ? d.watch : []).filter((w) => typeof w === 'string' && w.trim()).map((w) => w.trim().slice(0, 30)).slice(0, 30),
      list: (Array.isArray(d.list) ? d.list : []).filter((x) => x && typeof x.id === 'string' && typeof x.n === 'string' && x.n.trim()).slice(0, 80).map((x) => ({
        id: x.id.slice(0, 24), n: x.n.trim().replace(/\s+/g, ' ').slice(0, 80), s: typeof x.s === 'string' ? x.s.trim().slice(0, 30) : '',
        p: centsOk(x.p), w: centsOk(x.w), link: linkOk(x.link), to: ISO_DAY.test(x.to || '') ? x.to : '', done: x.done === true
      })),
      snaps: (Array.isArray(d.snaps) ? d.snaps : []).filter((x) => x && typeof x.n === 'string' && x.n.trim() && centsOk(x.now) && ISO_DAY.test(x.to || '')).slice(-SNAP_MAX).map((x) => ({
        id: typeof x.id === 'string' ? x.id.slice(0, 24) : '', s: L.storeName(String(x.s || '').trim().replace(/\s+/g, ' ').slice(0, 40)) || 'Specials',
        n: x.n.trim().replace(/\s+/g, ' ').slice(0, 120), now: centsOk(x.now), was: centsOk(x.was), promo: String(x.promo || '').trim().replace(/\s+/g, ' ').slice(0, 30),
        cat: SNAP_CATS.indexOf(x.cat) >= 0 ? x.cat : 'Other', to: x.to, by: x.by === 'b' ? 'b' : 'a'
      }))
    };
  }
  /* Saved right away on this phone too, so a tap shows straight away instead of after the round trip. */
  function saveDeals(patch) {
    S.dealsDoc = Object.assign({}, S.dealsDoc || DEALS_BASE, clone(patch));
    return upsert('hh/deals', patch, DEALS_BASE);
  }
  /* Every sale day from one date to another, and whether you're keen on that one. */
  function saleDays(from, to) {
    const out = [];
    dealsCfg().sales.forEach((s) => {
      L.saleDates(s.rule, from, to).forEach((d) => out.push({ sale: s, date: d, keen: s.keen ? s.skip.indexOf(d) < 0 : s.on.indexOf(d) >= 0 }));
    });
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sale.store.localeCompare(b.sale.store)));
  }
  const nextSale = (s, t) => L.saleDates(s.rule, t, L.addDays(t, 400))[0] || '';
  function saleIdeas() {
    const D = dealsCfg();
    return SALE_IDEAS.filter((x) => !D.sales.some((s) => s.key === x.key || s.store.toLowerCase() === x.store.toLowerCase()));
  }

  /* This week's specials file. On GitHub Pages it's next door on the repo's "deals" branch. Straight after a refresh,
     GitHub's API has the new file within a minute, where the plain link can take five. */
  function dealsUrl(fresh) {
    if (window.HH_DEALS_URL) return String(window.HH_DEALS_URL);
    const m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname || ''), repo = (location.pathname || '').split('/').filter(Boolean)[0];
    if (!m || !repo) return '';
    return fresh ? 'https://api.github.com/repos/' + m[1] + '/' + repo + '/contents/deals.json?ref=deals' : 'https://raw.githubusercontent.com/' + m[1] + '/' + repo + '/deals/deals.json';
  }
  /* Only what the app expects gets through: plain text, whole cents, real dates, links to the stores and OzBargain. */
  /* Product photos from Harris Farm, Umall and Meat Emporium's Shopify stores: only plain image files on Shopify's image CDN, asked for
     at the size they're shown (three times over, for the iPhone's screen). */
  const IMG_OK = /^https:\/\/cdn\.shopify\.com\/s\/files\/[A-Za-z0-9_./%-]+\.(?:jpe?g|png|webp)(?:\?v=\d+)?$/i;
  const imgOk = (u) => (typeof u === 'string' && u.length <= 300 && IMG_OK.test(u) ? u : '');
  const thumb = (x, px) => (x && x.img ? '<img class="sp-img" src="' + esc(x.img + (x.img.indexOf('?') >= 0 ? '&' : '?') + 'width=' + px * 3) + '" alt="" width="' + px + '" height="' + px + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '');
  function cleanFeed(j) {
    if (!j || typeof j !== 'object' || j.v !== 1) return null;
    const str = (x, n) => String(x == null ? '' : x).slice(0, n), int = (x) => (typeof x === 'number' && isFinite(x) ? Math.round(x) : 0), day = (x) => (ISO_DAY.test(x || '') ? x : '');
    const src = (x) => (x && typeof x === 'object' ? { ok: x.ok === true, stale: x.stale === true, from: day(x.from), to: day(x.to), link: linkOk(x.link), n: int(x.n) } : { ok: false });
    const so = j.sources && typeof j.sources === 'object' ? j.sources : {};
    return {
      updated: str(j.updated, 40),
      sources: { ozb: src(so.ozb), report: src(so.report), harris: src(so.harris), umall: src(so.umall), meat: src(so.meat) },
      specials: (Array.isArray(j.specials) ? j.specials : []).slice(0, 1500).filter((x) => x && typeof x.n === 'string' && x.n.trim() && int(x.now) > 0).map((x) => ({
        s: L.storeName(str(x.s, 40)), n: str(x.n, 120), was: int(x.was), now: int(x.now), off: L.clamp(int(x.off), 0, 99), cat: str(x.cat, 40), last: str(x.last, 40),
        link: linkOk(x.link), img: imgOk(x.img), src: x.src === 'hf' || x.src === 'um' || x.src === 'me' ? x.src : 'hp', to: day(x.to)
      })),
      deals: (Array.isArray(j.deals) ? j.deals : []).slice(0, 150).filter((x) => x && typeof x.t === 'string' && x.t.trim()).map((x) => ({
        id: str(x.id, 12), t: str(x.t, 160), s: str(x.s, 40), link: linkOk(x.link), from: day(x.from), to: day(x.to), votes: int(x.votes), hp: x.hp === true
      }))
    };
  }
  function loadFeed(force) {
    const url = dealsUrl();
    if (!url || S.feedBusy || (!force && S.feedAt && Date.now() - S.feedAt < 30 * 60000)) return;
    S.feedBusy = true;
    fetch(url, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : Promise.reject(r.status === 404 ? 'none' : 'net')))
      .then((j) => { const f = cleanFeed(j); if (!f) throw 'bad'; S.feed = f; S.feedErr = null; lsSet('hh.deals', JSON.stringify(j)); },
        (e) => { S.feedErr = e === 'none' ? 'none' : 'net'; })
      .catch(() => { S.feedErr = 'bad'; })
      .then(() => { S.feedBusy = false; S.feedAt = Date.now(); refreshDeals(); if (S.settings && S.me) safeRender(); });
  }
  /* Which list a special belongs to: Harris Farm's and Meat Emporium's run for the specials week, Umall's carry their own end day. */
  const feedKey = (x) => (x.src === 'hf' ? 'harris' : x.src === 'me' ? 'meat' : 'report');
  /* Specials from our screenshots that haven't ended, shaped like the lists' own. */
  let snapMemo = { doc: undefined, day: '', list: [] };
  function snapSpecials() {
    const t = today();
    if (snapMemo.doc === S.dealsDoc && snapMemo.day === t) return snapMemo.list;
    const list = dealsCfg().snaps.filter((x) => x.to >= t).map((x) => ({ s: x.s, n: x.n, was: x.was > x.now ? x.was : 0, now: x.now,
      off: x.was > x.now ? L.clamp(Math.round((1 - x.now / x.was) * 100), 0, 99) : 0, cat: x.cat, last: '', link: '', img: '', src: 'snap', to: x.to, promo: x.promo, id: x.id, by: x.by }));
    snapMemo = { doc: S.dealsDoc, day: t, list };
    return list;
  }
  /* Specials whose week hasn't ended, then ours from screenshots, leaving out any the lists already have. */
  function specialsNow() {
    const F = S.feed, t = today(), snaps = snapSpecials();
    const live = (k) => { const s = F.sources[k]; return !!(s && s.to && s.to >= t); };
    const list = F ? F.specials.filter((x) => (x.src === 'um' ? !!x.to && x.to >= t : live(feedKey(x)))) : [];
    if (!snaps.length) return list;
    const have = new Set(list.map((x) => x.s + '|' + flat(x.n)));
    return list.concat(snaps.filter((x) => !have.has(x.s + '|' + flat(x.n))));
  }
  /* GitHub often runs the morning refresh hours late. When a list here has run out (Umall's picks end on Tuesdays and
     Fridays, the rest on Tuesdays), the app starts the refresh itself with the token kept for instant pop-ups, at most
     every two hours from each phone, and looks for the new lists over the next few minutes. The refresh then sends
     any pop-ups that are due, like the week's top specials. */
  const DUE_NAMES = { report: 'Coles and Woolies', harris: 'Harris Farm', umall: 'Umall', meat: 'Meat Emporium' };
  function dealsDue() {
    const F = S.feed, t = today();
    return F ? Object.keys(DUE_NAMES).filter((k) => { const s = F.sources[k]; return !!(s && s.ok && s.to && s.to < t); }) : [];
  }
  function refreshDeals() {
    const tok = ghToken(), last = Number(lsGet('hh.dealsKick') || 0);
    if (!tok || S.dealsFetch || !dealsDue().length || Date.now() - last < 2 * 3600e3) return;
    lsSet('hh.dealsKick', String(Date.now()));
    startJob(tok, 'deals.yml').then((st) => {
      if (st === -1) lsSet('hh.dealsKick', '');
      if (!jobOk(st)) return;
      const polls = window.HH_FEED_POLLS || [90, 180, 300, 480];
      S.dealsFetch = dealsDue();
      polls.forEach((sec, i) => setTimeout(() => pollFeed(i === polls.length - 1), sec * 1000));
      if (S.settings && S.me) safeRender();
    });
  }
  function pollFeed(lastTry) {
    if (!S.dealsFetch) return;
    fetch(dealsUrl(true), { cache: 'no-store', headers: window.HH_DEALS_URL ? {} : { Accept: 'application/vnd.github.raw' } })
      .then((r) => (r.ok ? r.json() : null)).then((j) => {
        const f = j && cleanFeed(j);
        if (f) { S.feed = f; S.feedErr = null; S.feedAt = Date.now(); lsSet('hh.deals', JSON.stringify(j)); }
      }, () => {})
      .then(() => {
        if (lastTry || !dealsDue().length) S.dealsFetch = null;
        if (S.settings && S.me) safeRender();
      });
  }
  /* Shops you actually go to, from this past year of shared spends: Coles 19 trips and so on. */
  function shopVisits() {
    const since = L.addDays(today(), -365), n = {};
    S.entries.forEach((e) => {
      if (!L.isSpend(e) || e.date < since) return;
      const raw = String(e.title || '').trim(), s = L.storeName(raw);
      if (s && s !== raw) n[s] = (n[s] || 0) + 1;
      else if (/^(coles|woolworths|aldi|costco|iga)$/i.test(raw)) n[L.storeName(raw)] = (n[L.storeName(raw)] || 0) + 1;
    });
    return n;
  }
  /* How rare this price is: the half-price list notes when each item was last half price. */
  function rareWeeks(x) {
    const s = String(x.last || '').trim();
    if (!s || x.src === 'hf') return 0;
    if (/never|first/i.test(s)) return 99;
    return L.weeksSince(s) || 0;
  }
  const rareLabel = (w) => (w >= 99 ? 'First time at half price' : 'First time in ' + w + ' weeks');
  /* Aisles, from the categories on the half-price list. Everything from Harris Farm counts as fresh. */
  const AISLES = [['pantry', 'Pantry', /^(pantry|bakery|deli|dairy, eggs & fridge)$/i], ['fresh', 'Fresh', /^fruit & veg$/i],
    ['meat', 'Meat and seafood', /^(poultry, meat & seafood|meat & seafood)$/i],
    ['snacks', 'Snacks', /^snacks & confectionery$/i], ['drinks', 'Drinks', /^(drinks|beer, wine & spirits|liquor)$/i], ['freezer', 'Freezer', /^freezer$/i],
    ['cleaning', 'Cleaning', /^(cleaning & maintenance|household|home & lifestyle|pet)$/i], ['health', 'Health and beauty', /^(health & beauty|personal care|baby)$/i]];
  function aisleOf(x) {
    if (x.src === 'hf') return 'fresh';
    for (let i = 0; i < AISLES.length; i++) if (AISLES[i][2] && AISLES[i][2].test(x.cat || '')) return AISLES[i][0];
    return 'other';
  }
  /* Specials after the shop, watch-list and search filters, before the aisle one. */
  function spBase() {
    const D = dealsCfg(), q = String(S.spQuery || '').trim().toLowerCase();
    let list = specialsNow();
    if (S.spStore !== 'all') list = list.filter((x) => x.s === S.spStore);
    if (S.spWatch) list = list.filter((x) => L.watchHits(x.n, D.watch).length);
    if (q) list = list.filter((x) => (x.n + ' ' + x.cat).toLowerCase().indexOf(q) >= 0);
    return list;
  }
  function spFiltered() {
    const list = S.spAisle === 'all' ? spBase() : spBase().filter((x) => aisleOf(x) === S.spAisle);
    return spSorted(L.sortSpecials(list, dealsCfg().watch));
  }
  /* The sort button beside the filters. Best for us is the usual order: our watch list first, then the biggest
     discounts. The others keep that order for ties. Harris Farm only gives its special price, so it has no saving. */
  const SP_SORTS = [['best', 'Best for us'], ['save', 'Biggest saving'], ['off', 'Biggest % off'], ['low', 'Lowest price'], ['az', 'A to Z']];
  const sortName = (k) => (SP_SORTS.filter((o) => o[0] === k)[0] || SP_SORTS[0])[1];
  function spSorted(list) {
    const k = S.spSort, num = { save: (x) => (x.was > x.now ? x.was - x.now : 0), off: (x) => x.off || 0, low: (x) => -x.now }[k];
    if (num) return list.slice().sort((a, b) => num(b) - num(a));
    if (k === 'az') return list.slice().sort((a, b) => a.n.localeCompare(b.n, 'en-AU', { sensitivity: 'base' }));
    return list;
  }
  /* ---------- the weekend shopping list ---------- */
  /* Kept with the watch list in hh/deals, so both phones share it. Specials carry their price and when the special ends. */
  const spKey = (x) => (x.src || '') + '|' + x.s + '|' + x.n;
  const findSpecial = (k) => specialsNow().filter((x) => spKey(x) === k)[0] || null;
  const listKey = (i) => (i.s || '') + '|' + String(i.n).toLowerCase();
  let listMemo = { doc: undefined, keys: null };
  function onList(x) {
    if (listMemo.doc !== S.dealsDoc) listMemo = { doc: S.dealsDoc, keys: new Set(dealsCfg().list.filter((i) => !i.done).map(listKey)) };
    return listMemo.keys.has(listKey(x));
  }
  function specialEnd(x) {
    if (x.src === 'um' || x.src === 'snap') return x.to || '';
    const F = S.feed, src = F && F.sources[feedKey(x)];
    return (src && ISO_DAY.test(src.to || '') && src.to) || '';
  }
  /* When a special's list starts, if that's after today: next week's half-price list is sometimes all there is. */
  function specialStart(x) {
    if (x.src === 'um' || x.src === 'snap') return '';
    const F = S.feed, src = F && F.sources[feedKey(x)], f = src && ISO_DAY.test(src.from || '') ? src.from : '';
    return f > today() ? f : '';
  }
  /* A starting word for the watch list from a product name: the first few words, without the size. */
  function watchWord(n) {
    const w = String(n || '').replace(/\b\d+(\.\d+)?\s*(g|kg|ml|l|lt|pk|pack|ea|each)\b/gi, ' ').replace(/\b\d+\s*x\s*\d+\w*/gi, ' ').replace(/[^\w'&-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    return w.slice(0, 3).join(' ').slice(0, 30);
  }
  function saveList(list) { saveDeals({ list: list.slice(-80) }); }
  function addToList(it) {
    const D = dealsCfg(), k = listKey(it);
    if (D.list.some((i) => !i.done && listKey(i) === k)) return false;
    saveList(D.list.filter((i) => listKey(i) !== k).concat([Object.assign({ id: uid('l'), s: '', p: 0, w: 0, link: '', to: '', done: false }, it)]));
    return true;
  }
  const addBtn = (x) => (S.readOnly ? '' : '<button class="sp-add' + (onList(x) ? ' on' : '') + '" data-act="spitem" data-arg="' + esc(spKey(x)) + '" aria-label="' +
    esc((onList(x) ? 'On the weekend list: ' : 'Add to a list: ') + x.n) + '">' + icon(onList(x) ? 'check' : 'plus') + '</button>');
  function spItemDialog(d) {
    const x = findSpecial(d.key), head = (t) => '<div class="dlg-head"><h2 id="dlgT">' + esc(t) + '</h2><button class="icon-btn" data-act="dlgclose" aria-label="Close">' + icon('close') + '</button></div>';
    if (!x) return head('That special has finished') + '<p class="muted">The specials have moved on since. Have a look at this week\'s.</p><div class="dialog-actions"><button class="btn btn-primary" data-act="dlgclose">Done</button></div>';
    const k = esc(spKey(x)), on = onList(x), words = L.watchHits(x.n, dealsCfg().watch), end = specialEnd(x);
    const line = '<p class="muted">' + esc([shopLabel(x.s), L.fmt(x.now) + (x.was > x.now ? ', was ' + L.fmt(x.was) : ''), x.promo || '', end ? 'special till ' + L.fmtDay(end) : ''].filter(Boolean).join(' · ')) + '</p>' +
      (x.src === 'snap' ? '<p class="hint">Read from ' + esc(poss(nm(x.by))) + ' screenshot.' + (S.readOnly ? '' : ' <button class="link sm" data-act="snapdel" data-arg="' + esc(x.id) + '">Got it wrong? Take it off</button>') + '</p>' : '');
    return head(x.n) + (x.img ? '<div class="sp-item-head">' + thumb(x, 88) + line + '</div>' : line) +
      '<div class="item-acts">' +
      (on ? '<button class="btn btn-secondary btn-block" data-act="listoff" data-arg="' + k + '">' + icon('check') + 'On the weekend list. Take it off</button>'
        : '<button class="btn btn-primary btn-block" data-act="listadd" data-arg="' + k + '">' + icon('cart') + 'Add to our weekend list</button>') +
      (words.length ? '<p class="hint">On the watch list as ' + esc(listNames(words)) + '.</p>'
        : '<button class="btn btn-secondary btn-block" data-act="watchfor" data-arg="' + k + '">' + icon('bell') + 'Put it on the watch list</button>') +
      (x.link ? '<a class="link sm" href="' + esc(x.link) + '" target="_blank" rel="noopener">See it at ' + esc(shopLabel(x.s)) + '</a>' : '') + '</div>';
  }
  /* Two links under each item still to get: the same thing searched for at Coles and at Woolies, to see what it costs on the shelf. */
  function checkPrice(i) {
    const u = i.done ? null : L.priceLinks(i.n);
    return u ? '<span class="sl-chk"><span>Check price</span><a href="' + esc(u.coles) + '" target="_blank" rel="noopener" aria-label="Search for ' + esc(i.n) + ' at Coles">Coles</a>' +
      '<a href="' + esc(u.woolies) + '" target="_blank" rel="noopener" aria-label="Search for ' + esc(i.n) + ' at Woolies">Woolies</a></span>' : '';
  }
  function shopListDialog() {
    const D = dealsCfg(), t = today(), list = D.list, left = list.filter((i) => !i.done), ticked = list.length - left.length, sum = left.reduce((a, i) => a + i.p, 0);
    const groups = {};
    list.forEach((i) => { (groups[i.s] = groups[i.s] || []).push(i); });
    const order = Object.keys(groups).sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
    const row = (i) => '<li class="sl-row' + (i.done ? ' done' : '') + '">' +
      '<button class="sl-tick" role="checkbox" aria-checked="' + i.done + '" data-act="listtick" data-arg="' + esc(i.id) + '" aria-label="' + esc(i.n) + '">' + (i.done ? icon('check') : '') + '</button>' +
      '<span class="sl-main"><span class="sl-n">' + esc(i.n) + '</span>' +
      (i.w > i.p || i.to ? '<span class="k">' + esc([i.w > i.p ? 'was ' + L.fmt(i.w) : '', i.to ? (i.to < t ? 'special has finished' : 'special till ' + L.fmtDay(i.to)) : ''].filter(Boolean).join(' · ')) + '</span>' : '') + '</span>' +
      (i.p ? '<span class="sl-p">' + L.fmt(i.p) + '</span>' : '<span></span>') +
      (S.readOnly ? '' : '<button class="sl-del" data-act="listdel" data-arg="' + esc(i.id) + '" aria-label="Take ' + esc(i.n) + ' off the list">' + icon('close') + '</button>') + checkPrice(i) + '</li>';
    return '<div class="dlg-head"><h2 id="dlgT">Weekend shopping list</h2><button class="icon-btn" data-act="dlgclose" aria-label="Close">' + icon('close') + '</button></div>' +
      '<p class="muted">' + (list.length ? (left.length ? left.length + ' to get' + (sum ? ', about <strong>' + L.fmt(sum) + '</strong> at the special prices' : '') + '.' : 'All ticked off.')
        : 'Nothing on it yet. Tap + on any special in Deals to add it, or add your own below.') + '</p>' +
      order.map((g) => '<p class="sp-sec">' + esc(g ? shopLabel(g) : 'Anywhere') + '</p><ul class="sl-list">' + groups[g].map(row).join('') + '</ul>').join('') +
      (S.readOnly ? '' : '<div class="watch-add"><label class="sr" for="listIn">Add to the list</label><input class="input" id="listIn" maxlength="60" placeholder="Add something else, like bread" autocomplete="off" enterkeyhint="done" data-bind="listNew" data-enter="listnew" value="' + esc(S.listNew) + '">' +
        '<button class="btn btn-secondary btn-small" data-act="listnew">Add</button></div>') +
      '<div class="dialog-actions">' + (ticked && !S.readOnly ? '<button class="btn btn-secondary" data-act="listclear">Clear ' + ticked + ' ticked</button>' : '') + '<button class="btn btn-primary" data-act="dlgclose">Done</button></div>';
  }
  /* ---------- specials from screenshots ---------- */
  /* Coles and Liquorland don't let other sites read their specials, so we bring them in ourselves: screenshots of a shop's
     specials page (or Safari's full-page PDF of it) go to Gemini, which reads each product and price the way it reads
     receipts. They're kept in hh/deals for both phones until their last day, and join the watch list and pop-ups. */
  const SPECIALS_PROMPT = 'These are screenshots, or a saved page, of the specials in an Australian shop\'s app or website, such as Coles, Woolworths, ALDI or Liquorland. ' +
    'Read every product on special that is shown in full: its name with the brand and size, the special price, the usual price, any deal words, and the best category. ' +
    'Give the shop, and the last day of the specials if it is shown. Leave out ads, banners, recipes, and products that are cut off or not on special. If there are no specials, give no items.';
  function specialsSchema() {
    return { type: 'object', properties: {
      shop: { type: 'string', description: 'The shop these specials are from, such as Coles or Liquorland. Empty if it is not shown.' },
      ends: { type: 'string', description: 'The last day of these specials as YYYY-MM-DD, or empty if it is not shown.' },
      items: { type: 'array', items: { type: 'object', properties: {
        name: { type: 'string', description: 'The product with its brand and size, as written. For example: Coles Australian Pork Loin Chops 1kg.' },
        price: { type: 'number', description: 'The special price for one, in dollars.' },
        was: { type: 'number', description: 'The usual price for one in dollars, as shown, or the special price plus the saving when it says Save $3. Otherwise 0.' },
        deal: { type: 'string', description: 'Deal words shown on it, such as Half price, 2 for $10 or Save $3. Empty if there are none.' },
        category: { type: 'string', enum: SNAP_CATS } }, required: ['name', 'price', 'was', 'deal', 'category'] } }
    }, required: ['shop', 'ends', 'items'] };
  }
  const isPdf = (f) => /pdf/i.test(f.type || '') || /\.pdf$/i.test(f.name || '');
  /* A screenshot keeps its full size, so small print stays readable. A PDF goes as it is, up to Gemini's limit. */
  function shotData(file) {
    if (!isPdf(file)) return shrinkPhoto(file, true).then((data) => ({ data, mime: 'image/jpeg' }));
    if (file.size > 14e6) { const e = new Error('too big'); e.big = true; return Promise.reject(e); }
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res({ data: String(r.result || '').split(',')[1] || '', mime: 'application/pdf' });
      r.onerror = () => { const e = new Error('photo'); e.photo = true; rej(e); };
      r.readAsDataURL(file);
    });
  }
  function snapError(e) {
    if (e && e.big) return 'That PDF is too big to send. Take screenshots of the page instead.';
    if (e && e.photo) return 'That screenshot couldn\'t be opened. Try another one.';
    const m = receiptError(e);
    return /^Couldn't read that receipt/.test(m) ? 'Couldn\'t read those specials. Try a clearer screenshot.' : m.replace(' Type this one in, or try again later.', ' Try again later.');
  }
  /* What Gemini read, tidied: whole cents, a known category, and each product once (screenshots overlap as you scroll). */
  function snapItems(j, seen) {
    const cents = (v) => Math.round((typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/[^0-9.-]/g, ''))) * 100) || 0;
    return (Array.isArray(j && j.items) ? j.items : []).slice(0, 150).map((x) => {
      const n = String((x && x.name) || '').trim().replace(/\s+/g, ' ').slice(0, 120), now = cents(x && x.price), was = cents(x && x.was);
      return { n, now, was: was > now ? was : 0, promo: String((x && x.deal) || '').trim().replace(/\s+/g, ' ').slice(0, 30), cat: SNAP_CATS.indexOf(x && x.category) >= 0 ? x.category : 'Other', on: true };
    }).filter((x) => {
      const k = flat(x.n);
      if (!k || x.now <= 0 || x.now >= 1e6 || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  /* Reads each file in turn, so a long scroll of screenshots shows how far it's got. A file that can't be read is skipped;
     if Gemini itself says no (not set up, App Check, its limit), the rest would fail the same way, so it stops. */
  function startSnaps(files) {
    const list = files.filter(Boolean).slice(0, SNAP_FILES);
    if (!list.length) return;
    const d = { type: 'snaps', tok: uid('s'), busy: true, n: list.length, at: 1, form: null, fails: 0, last: null, err: null, why: '', fix: '', error: null };
    const t = today(), seen = new Set(), form = { shop: '', to: '', items: [] }, skipped = files.length - list.length;
    S.dialog = d;
    render();
    const mine = () => S.dialog === d;
    const done = () => {
      d.busy = false;
      if (form.items.length) {
        if (!form.to) form.to = L.specialsWeek(t).to;
        d.form = form; d.skipped = skipped;
      } else {
        const e = d.last;
        d.err = e ? snapError(e) : 'No specials in ' + (list.length > 1 ? 'those' : 'that') + '. Screenshot the shop\'s specials page, with the prices showing.';
        d.why = e && !e.photo && !e.big ? errDetail(e) : '';
        d.fix = e && !S.readOnly && /appCheck\/|app ?check|attestation/i.test(String(e.code || '') + ' ' + String(e.message || '')) ? 'aitoken' : '';
      }
      render();
    };
    const next = (i) => {
      if (!mine()) return;
      if (i >= list.length) { done(); return; }
      if (d.at !== i + 1) { d.at = i + 1; render(); }
      shotData(list[i]).then((x) => aiRead(SPECIALS_PROMPT, specialsSchema(), x.data, x.mime)).then((j) => {
        const shop = L.storeName(String((j && j.shop) || '').trim().replace(/\s+/g, ' ').slice(0, 40)), ends = String((j && j.ends) || '');
        if (!form.shop && shop) form.shop = shop;
        if (!form.to && ISO_DAY.test(ends) && ends >= t && ends <= L.addDays(t, 60)) form.to = ends;
        form.items = form.items.concat(snapItems(j, seen));
        next(i + 1);
      }, (e) => {
        d.fails++; d.last = e;
        next(e && (e.photo || e.big) ? i + 1 : list.length);
      });
    };
    next(0);
  }
  const snapLabel = (n) => (n ? 'Add ' + n + (n === 1 ? ' special' : ' specials') : 'Tick the ones to add');
  function snapsDialog(d) {
    const head = '<div class="dlg-head"><h2 id="dlgT">' + (d.form ? 'Check the specials' : 'Reading the specials') + '</h2><button class="icon-btn" data-act="dlgclose" aria-label="Close">' + icon('close') + '</button></div>';
    if (d.busy) {
      return head + '<div class="rcp-busy" role="status"><span class="spin" aria-hidden="true"></span><p><strong>' + (d.n > 1 ? 'Reading ' + d.at + ' of ' + d.n : 'Reading the screenshot') + '</strong></p>' +
        '<p class="muted">Gemini is reading each product and its price. It takes a few seconds for each one.</p></div>';
    }
    const again = (t) => '<label class="btn btn-secondary file-btn">' + t + '<input type="file" accept="image/*,application/pdf" multiple data-change="snapfile" aria-label="Choose screenshots of a shop\'s specials"></label>';
    if (d.err) {
      return head + '<p class="err-text" role="alert">' + esc(d.err) + '</p>' + (d.why ? '<p class="hint err-why">Details: ' + esc(d.why) + '</p>' : '') + '<div class="dialog-actions">' +
        (d.fix === 'aitoken' ? '<button class="btn btn-secondary" data-act="dlgclose">Not now</button><button class="btn btn-primary" data-act="aitoken">Set it up</button>' : again('Try other screenshots')) + '</div>';
    }
    const f = d.form, n = f.items.filter((x) => x.on).length, t = today();
    const rows = f.items.map((x, i) => '<li><label class="snap-row"><input type="checkbox" data-bind="dialog.form.items.' + i + '.on" data-change="snapcount"' + (x.on ? ' checked' : '') + '>' +
      '<span class="snap-main"><span class="snap-n">' + esc(x.n) + '</span><span class="k">' + esc([x.cat, x.promo].filter(Boolean).join(' · ')) + '</span></span>' +
      '<span class="sp-price"><span class="sp-now">' + L.fmt(x.now) + '</span>' + (x.was > x.now ? '<s class="sp-was"><span class="sr">was </span>' + L.fmt(x.was) + '</s>' : '') + '</span></label></li>').join('');
    const missed = d.fails ? (d.fails === 1 ? ' One file couldn\'t be read.' : ' ' + d.fails + ' files couldn\'t be read.') : '';
    return head + '<p class="muted">Gemini found ' + f.items.length + (f.items.length === 1 ? ' special' : ' specials') + '. Untick any it got wrong.' + esc(missed) +
      (d.skipped ? ' It read the first ' + SNAP_FILES + ' files. Add the rest after.' : '') + '</p>' +
      '<div class="row2"><label class="field"><span>Shop</span><input class="input" id="snapShop" maxlength="40" autocomplete="off" placeholder="Coles" data-bind="dialog.form.shop" value="' + esc(f.shop) + '"></label>' +
      '<label class="field"><span>On special till</span><input class="input" id="snapTo" type="date" min="' + t + '" max="' + L.addDays(t, 60) + '" data-bind="dialog.form.to" value="' + esc(f.to) + '"></label></div>' +
      '<ul class="snap-list">' + rows + '</ul>' +
      (d.error ? '<p class="err-text" role="alert">' + esc(d.error) + '</p>' : '') +
      '<div class="dialog-actions"><button class="btn btn-primary" id="snapGo" data-act="snapsave">' + snapLabel(n) + '</button></div>';
  }
  /* Saved with the rest of hh/deals. The same product from the same shop replaces the one before, and finished ones go. */
  function saveSnaps() {
    const d = S.dialog, f = d && d.form;
    if (!f) return;
    const t = today(), shop = L.storeName(String(f.shop || '').trim().replace(/\s+/g, ' ').slice(0, 40)), to = String(f.to || ''), pick = f.items.filter((x) => x.on);
    const stop = (m) => { d.error = m; render(); };
    if (!shop) return stop('Enter the shop.');
    if (!ISO_DAY.test(to) || to < t) return stop('Pick the last day of these specials.');
    if (!pick.length) return stop('Tick at least one special.');
    const key = (x) => x.s + '|' + flat(x.n), by = S.me === 'b' ? 'b' : 'a';
    const add = pick.map((x) => ({ id: uid('s'), s: shop, n: x.n, now: x.now, was: x.was > x.now ? x.was : 0, promo: x.promo, cat: x.cat, to, by }));
    const fresh = new Set(add.map(key));
    saveDeals({ snaps: dealsCfg().snaps.filter((x) => x.to >= t && !fresh.has(key(x))).concat(add).slice(-SNAP_MAX) });
    Object.assign(S, { dialog: null, spStore: shop, spAisle: 'all', spWatch: false, spQuery: '', spAll: false });
    toast('Added ' + add.length + (add.length === 1 ? ' special' : ' specials') + ' from ' + shopLabel(shop));
    render();
  }
  function snapAdd() {
    if (!snapReady()) return '';
    return '<div class="sp-snap"><label class="btn btn-secondary btn-block file-btn">' + icon('image') + 'Add specials from screenshots' +
      '<input type="file" accept="image/*,application/pdf" multiple data-change="snapfile" aria-label="Choose screenshots of a shop\'s specials"></label>' +
      '<p class="hint">For Coles fresh food, Liquorland or any shop not here: screenshot their specials page and Gemini reads in each product and price.</p></div>';
  }
  function spRow(x, words) {
    const hit = L.watchHits(x.n, words).length > 0, w = rareWeeks(x), st = specialStart(x);
    const name = x.link ? '<a class="sp-n" href="' + esc(x.link) + '" target="_blank" rel="noopener">' + esc(x.n) + '</a>' : '<span class="sp-n">' + esc(x.n) + '</span>';
    return '<li class="sp-row' + (hit ? ' hit' : '') + (S.readOnly ? '' : ' has-add') + (x.img ? ' has-img' : '') + '">' + thumb(x, 48) + '<span class="sp-main">' + name + '<span class="k">' + esc([shopLabel(x.s), x.cat, st ? 'from ' + L.fmtDay(st) : ''].filter(Boolean).join(' · ')) + '</span>' +
      (hit || w >= 8 || x.src === 'snap' ? '<span class="sp-tags">' + (hit ? '<span class="tag hit">On our list</span>' : '') + (w >= 8 ? '<span class="tag rare">' + esc(rareLabel(w)) + '</span>' : '') +
        (x.src === 'snap' ? '<span class="tag snap">From a screenshot</span>' : '') + '</span>' : '') + '</span>' +
      '<span class="sp-price"><span class="sp-now">' + L.fmt(x.now) + '</span>' + (x.was > x.now ? '<s class="sp-was"><span class="sr">was </span>' + L.fmt(x.was) + '</s>' : '') +
      (x.off ? '<span class="sp-off">' + x.off + '% off</span>' : x.src === 'hf' ? '<span class="sp-off">Special</span>' : x.promo ? '<span class="sp-off">' + esc(x.promo) + '</span>' : '') + '</span>' + addBtn(x) + '</li>';
  }
  /* With no filter on, a few rarely-cheap picks and a button for the lot; otherwise the list itself. */
  function spListHtml() {
    const D = dealsCfg(), list = spFiltered(), q = String(S.spQuery || '').trim();
    if (!list.length) return '<p class="muted sp-none">' + (q ? 'Nothing on special matches that this week.' : 'Nothing here this week.') + '</p>';
    if (!S.spAll && !q && S.spAisle === 'all' && !S.spWatch && S.spSort === 'best') {
      const rare = list.filter((x) => rareWeeks(x) >= 8).sort((a, b) => rareWeeks(b) - rareWeeks(a) || b.off - a.off).slice(0, 3), rest = list.filter((x) => rare.indexOf(x) < 0).slice(0, 8);
      return (rare.length ? '<div class="sp-rare"><p class="sp-sec">Rarely this cheap <span>Not half price for months</span></p><ul class="sp-list">' + rare.map((x) => spRow(x, D.watch)).join('') + '</ul></div>' : '') +
        (rest.length ? '<p class="sp-sec">Top specials <span>' + (D.watch.length ? 'Our list first, then the biggest discounts' : 'Biggest discounts first') + '</span></p><ul class="sp-list">' + rest.map((x) => spRow(x, D.watch)).join('') + '</ul>' : '') +
        (list.length > rare.length + rest.length ? '<button class="btn btn-secondary btn-block sp-more" data-act="spmore">See all ' + list.length + ' specials</button>' : '');
    }
    const shown = S.spAll ? list.slice(0, 500) : list.slice(0, 40);
    return (S.spSort !== 'best' ? '<p class="sp-sec">' + esc(sortName(S.spSort)) + ' first <button class="link sm" data-act="spsortbest">Back to best for us</button></p>' : '') + '<ul class="sp-list">' + shown.map((x) => spRow(x, D.watch)).join('') + '</ul>' +
      (list.length > shown.length ? '<button class="btn btn-secondary btn-block sp-more" data-act="spmore">Show all ' + list.length + '</button>'
        : S.spAll && !q && S.spAisle === 'all' && !S.spWatch ? '<button class="btn btn-secondary btn-block sp-more" data-act="spmore">Show fewer</button>' : '');
  }
  function agoLabel(iso) {
    const t = Date.parse(iso || '');
    if (!t) return '';
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 60) return mins <= 1 ? 'just now' : mins + ' minutes ago';
    const d = new Date(t), day = L.ymd(d), hm = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '').toLowerCase();
    return day === today() ? 'at ' + hm + ' today' : day === L.addDays(today(), -1) ? 'yesterday at ' + hm : 'on ' + L.fmtDay(day);
  }
  function feedWhy() {
    return !dealsUrl() ? 'Specials show here in the app on your phones.' : S.feedBusy || !S.feedAt ? 'Getting this week\'s specials.'
      : S.feedErr === 'none' ? 'The deals job hasn\'t run yet. It runs every morning, and the specials change on Wednesdays.' : 'This week\'s specials couldn\'t be reached. Check your connection.';
  }
  /* Everything on special this week, with shop and aisle filters and a search. */
  function everythingCard() {
    const F = S.feed, all = specialsNow();
    const head = (n) => '<div class="card-head"><h2>Everything on special</h2>' + (n ? '<span class="k">' + n + ' this week</span>' : '') + '</div>';
    if (!F && !all.length) {
      return '<section class="card bold specials" id="spCard">' + head(0) + '<p class="muted">' + esc(feedWhy()) + '</p>' +
        (S.feedErr === 'net' || S.feedErr === 'bad' ? '<button class="link sm" data-act="feedretry">Try again</button>' : '') + snapAdd() + '</section>';
    }
    const fetching = S.dealsFetch && S.dealsFetch.length ? '<p class="hint sp-fetch" role="status">Getting the new lists from ' + esc(listNames(S.dealsFetch.map((k) => DUE_NAMES[k]))) + '. They\'ll show here in a minute or two.</p>' : '';
    if (!all.length) return '<section class="card bold specials" id="spCard">' + head(0) + (fetching || '<p class="muted">This week\'s specials haven\'t come through yet. The new ones come in on Wednesday mornings.</p>') + snapAdd() + '</section>';
    const counts = {};
    all.forEach((x) => { counts[x.s] = (counts[x.s] || 0) + 1; });
    const visits = shopVisits(), stores = Object.keys(counts).sort((a, b) => (visits[b] || 0) - (visits[a] || 0) || counts[b] - counts[a]);
    if (S.spStore !== 'all' && !counts[S.spStore]) S.spStore = 'all';
    /* Search, then two drop-downs, the shop and the category (with our watch list as one of them), and the sort button.
       Unfiltered, each shows its name, which fits beside the sort button on a phone. */
    const D = dealsCfg(), q = String(S.spQuery || '').trim().toLowerCase();
    const pre = all.filter((x) => (S.spStore === 'all' || x.s === S.spStore) && (!q || (x.n + ' ' + x.cat).toLowerCase().indexOf(q) >= 0)), ac = {};
    pre.forEach((x) => { const a = aisleOf(x); ac[a] = (ac[a] || 0) + 1; });
    const wn = D.watch.length ? pre.filter((x) => L.watchHits(x.n, D.watch).length).length : 0;
    if (S.spAisle !== 'all' && !ac[S.spAisle]) S.spAisle = 'all';
    const aisles = AISLES.map((a) => [a[0], a[1]]).concat([['other', 'Other']]).filter((a) => ac[a[0]]);
    const opt = (v, label, n, on) => '<option value="' + esc(v) + '"' + (on ? ' selected' : '') + '>' + esc(label) + (n == null ? '' : ' · ' + n) + '</option>';
    /* A drop-down that shows its own short label, with the phone's picker over it: the list can say All categories
       while the closed one says Categories, which fits beside the sort button. */
    const pick = (id, act, name, shown, options) => '<label class="sp-pick" for="' + id + '"><span class="sp-pick-t">' + esc(shown) + '</span>' +
      '<select id="' + id + '" data-change="' + act + '" aria-label="' + esc(name) + '">' + options + '</select></label>';
    const cat = S.spWatch ? 'watch' : S.spAisle;
    return '<section class="card bold specials" id="spCard">' + head(all.length) + fetching +
      '<label class="sr" for="spQ">Search specials</label><input class="input sp-search" id="spQ" type="search" placeholder="Search ' + all.length + (all.length === 1 ? ' special' : ' specials') + '" autocomplete="off" enterkeyhint="search" data-bind="spQuery" data-input="spsearch" value="' + esc(S.spQuery) + '">' +
      '<div class="sp-filters">' +
      pick('spShop', 'spshopsel', 'Shop', S.spStore === 'all' ? 'Shops' : shopLabel(S.spStore) + ' · ' + counts[S.spStore],
        opt('all', 'All shops', null, S.spStore === 'all') + stores.map((x) => opt(x, shopLabel(x), counts[x], S.spStore === x)).join('')) +
      pick('spCat', 'spcatsel', 'Category', cat === 'all' ? 'Categories' : cat === 'watch' ? 'Our watch list · ' + wn : ((aisles.filter((a) => a[0] === cat)[0] || [0, 'Categories'])[1] + ' · ' + ac[cat]),
        opt('all', 'All categories', null, cat === 'all') + (D.watch.length ? opt('watch', 'Our watch list', wn, cat === 'watch') : '') + aisles.map((a) => opt(a[0], a[1], ac[a[0]], cat === a[0])).join('')) +
      '<label class="sp-sort' + (S.spSort !== 'best' ? ' on' : '') + '" for="spSort">' + icon('sort') + '<span class="sr">Sort by</span>' +
        '<select id="spSort" data-change="spsortsel" aria-label="Sort by, now ' + esc(sortName(S.spSort)) + '">' + SP_SORTS.map((o) => opt(o[0], o[1], null, S.spSort === o[0])).join('') + '</select></label>' +
      '</div>' +
      '<div id="spList">' + spListHtml() + '</div>' + snapAdd() + '</section>';
  }
  /* For each word on the watch list, what matches it this week: specials first, best first, then OzBargain posts. */
  function watchByWord() {
    const D = dealsCfg(), F = S.feed, t = today();
    if (!F) return [];
    const sp = specialsNow(), deals = F.deals.filter((d) => !d.hp && (!d.to || d.to >= t));
    return D.watch.map((w) => {
      const hits = L.sortSpecials(sp.filter((x) => L.watchHits(x.n, [w]).length), [w]);
      const dh = deals.filter((d) => L.watchHits(d.t + ' ' + d.s, [w]).length).map((d) => ({ n: d.t, s: L.storeName(d.s), link: d.link, deal: true, now: 0, was: 0 }));
      return { w, hits: hits.concat(dh), sp: hits.length };
    });
  }
  const thingsLine = (on) => (on.length === 1 ? cap1(on[0].w) + ' is on special' : on.length + ' things we buy are on special');
  /* The watch list's best deal for each word. */
  function matchesCard() {
    const D = dealsCfg();
    if (!D.watch.length) {
      return '<section class="card matches"><p class="k">Our watch list</p><h2>Tell it what we buy</h2><p class="muted">Add things like coffee or Weet-Bix. When one is on special it shows here, goes to the top of the specials, and our phones pop up when the new specials come in.</p>' +
        (S.readOnly ? '' : '<button class="btn btn-secondary btn-block" style="margin-top:14px" data-act="watchopen">Add to the watch list</button>') + '</section>';
    }
    if (!S.feed) return '';
    const by = watchByWord(), on = by.filter((x) => x.hits.length), none = by.filter((x) => !x.hits.length);
    const m = on.reduce((a, x) => a + x.sp, 0), save = on.reduce((a, x) => a + (x.hits[0].was > x.hits[0].now ? x.hits[0].was - x.hits[0].now : 0), 0);
    const rows = on.map((x) => {
      const h = x.hits[0], name = h.link ? '<a class="match-n" href="' + esc(h.link) + '" target="_blank" rel="noopener">' + esc(h.n) + '</a>' : '<span class="match-n">' + esc(h.n) + '</span>';
      return '<li class="match-row' + (h.deal || S.readOnly ? '' : ' has-add') + (h.img ? ' has-img' : '') + '">' + thumb(h, 48) + '<span class="match-main">' + name + '<span class="match-meta"><span class="wpill">' + esc(x.w) + ' <span class="n">' + x.hits.length + '</span></span>' +
        '<span>' + esc([shopLabel(h.s), h.was > h.now ? 'was ' + L.fmt(h.was) : ''].filter(Boolean).join(' · ')) + '</span></span></span>' +
        '<span class="sp-price">' + (h.now ? '<span class="sp-now">' + L.fmt(h.now) + '</span>' : '') + '<span class="sp-off">' + (h.deal ? 'Deal' : h.off ? h.off + '% off' : 'Special') + '</span></span>' + (h.deal ? '' : addBtn(h)) + '</li>';
    }).join('');
    return '<section class="card matches" id="matchCard"><div class="match-head"><span class="news-ic" aria-hidden="true">' + icon('tag') + '</span><p class="k">On our watch list this week</p></div>' +
      '<h2>' + esc(on.length ? thingsLine(on) : 'Nothing we buy is on special this week') + '</h2>' +
      '<p class="muted">' + (on.length ? m + (m === 1 ? ' match' : ' matches') + (save ? '. The top pick of each saves <strong>' + L.fmt(save) + '</strong> on the usual price.' : '.') : 'New specials come in on Wednesday.') + '</p>' +
      (rows ? '<ul class="match-list">' + rows + '</ul>' : '') +
      (none.length && on.length ? '<p class="hint match-none">Nothing on special for ' + esc(listNames(none.map((x) => x.w))) + '.</p>' : '') +
      '<div class="match-btns">' + (m ? '<button class="btn btn-secondary" data-act="spwatch">See all ' + m + (m === 1 ? ' match' : ' matches') + '</button>' : '') +
      (S.readOnly ? '' : '<button class="btn btn-secondary" data-act="watchopen">' + icon('pencil') + 'Edit list</button>') + '</div></section>';
  }
  function watchDialog() {
    const D = dealsCfg(), count = {};
    watchByWord().forEach((x) => { count[x.w] = x.hits.length; });
    return '<div class="dlg-head"><h2 id="dlgT">Our watch list</h2><button class="icon-btn" data-act="dlgclose" aria-label="Close">' + icon('close') + '</button></div>' +
      '<p class="muted">Things we buy. When one is on special it goes to the top of Deals, and our phones pop up when the new specials come in.' + (S.feed ? ' The number is this week\'s matches.' : '') + '</p>' +
      '<div class="watch">' + (D.watch.length ? '<div class="chips">' + D.watch.map((w) => '<button class="chip sm' + (count[w] ? ' hit' : '') + '" data-act="watchdel" data-arg="' + esc(w) + '">' + esc(w) +
        (count[w] ? ' <span class="n">' + count[w] + '</span>' : '') + '<span aria-hidden="true">' + icon('close') + '</span><span class="sr">, remove</span></button>').join('') + '</div>'
        : '<p class="hint">Nothing on it yet. Add things you buy, like coffee or Weet-Bix.</p>') +
      (S.readOnly ? '' : '<div class="watch-add"><label class="sr" for="watchIn">Add to the watch list</label><input class="input" id="watchIn" maxlength="30" placeholder="Add something we buy" autocomplete="off" enterkeyhint="done" data-bind="watchNew" data-enter="watchadd" value="' + esc(S.watchNew) + '">' +
        '<button class="btn btn-secondary btn-small" data-act="watchadd">Add</button></div>') + '</div>' +
      '<div class="dialog-actions"><button class="btn btn-primary" data-act="dlgclose">Done</button></div>';
  }
  function dealsFoot() {
    const F = S.feed;
    if (!F) return '';
    const rep = F.sources.report, hf = F.sources.harris, srcs = [];
    if (rep.ok || rep.stale) srcs.push('Coles and Woolies from the weekly half-price list posted on ' + (rep.link ? '<a href="' + esc(rep.link) + '" target="_blank" rel="noopener">OzBargain</a>' : 'OzBargain'));
    if (hf.ok || hf.stale) srcs.push('Harris Farm from its online specials');
    if (F.sources.umall.ok || F.sources.umall.stale) srcs.push('Umall, Sydney\'s online Asian supermarket, from its half-price and weekly specials (delivery only)');
    if (F.sources.meat.ok || F.sources.meat.stale) srcs.push('Meat Emporium, Sydney\'s big meat market, from what its online shop has marked down');
    return srcs.length ? '<p class="hint sp-src">' + srcs.join('. ') + '. Updated ' + esc(agoLabel(F.updated)) + '. Prices can differ by store.</p>' : '';
  }
  /* OzBargain deals at our shops or on the watch list, most votes first. */
  function ozbCard() {
    const F = S.feed, t = today();
    if (!F || !F.deals.length) return '';
    const D = dealsCfg(), shops = /^(Coles|Woolworths|Harris Farm|ALDI|Costco|IGA|Lucky Mart|Liquorland|Meat Emporium|United Meat Co)$/;
    const list = F.deals.filter((d) => !d.hp && (!d.to || d.to >= t)).map((d) => Object.assign({ shop: L.storeName(d.s), ours: L.watchHits(d.t + ' ' + d.s, D.watch).length > 0 }, d))
      .sort((a, b) => (b.votes || 0) - (a.votes || 0));
    if (!list.length) return '';
    const mine = list.filter((d) => shops.test(d.shop) || d.ours), shown = S.ozbAll ? list.slice(0, 40) : mine.slice(0, 5);
    return '<section class="card specials ozb"><div class="card-head"><h2>From OzBargain</h2><span class="k">' + list.length + (list.length === 1 ? ' deal' : ' deals') + '</span></div>' +
      '<p class="muted">Deals people posted for the shops we use, most votes first.</p>' +
      (shown.length ? '<ul class="ozb-list">' + shown.map((d) => '<li class="ozb-row"><span class="ozb-main">' + (d.link ? '<a class="ozb-t" href="' + esc(d.link) + '" target="_blank" rel="noopener">' + esc(d.t) + '</a>' : '<span class="ozb-t">' + esc(d.t) + '</span>') +
        '<span class="k">' + esc([shopLabel(d.shop || d.s), d.to ? 'ends ' + L.fmtDay(d.to) : ''].filter(Boolean).join(' · ')) + '</span>' + (d.ours ? '<span class="tag hit">On our list</span>' : '') + '</span>' +
        (d.votes > 0 ? '<span class="votes">' + icon('up') + d.votes + '<span class="sr"> votes</span></span>' : '') + '</li>').join('') + '</ul>'
        : '<p class="muted" style="margin-top:8px">Nothing for our shops right now.</p>') +
      (list.length > shown.length || S.ozbAll ? '<button class="link sm" style="margin-top:8px" data-act="ozball">' + (S.ozbAll ? 'Just our shops' : 'See all ' + list.length + ' grocery deals') + '</button>' : '') + '</section>';
  }
  function saleRow(o, t) {
    const s = o.sale, past = o.date < t, what = [s.offer, L.saleRuleLabel(s.rule)].filter(Boolean).join(' · ');
    return '<li class="sale-row"><span class="soon-when">' + esc(whenLabel(o.date, t)) + '</span>' +
      '<button class="sale-main" data-act="saleopen" data-arg="' + esc(s.id) + '"><span class="soon-n">' + esc(s.store) + '</span><span class="k">' + esc(what) + '</span></button>' +
      (S.readOnly || past ? '<span></span>' : '<button class="keen-btn" data-act="salekeen" data-arg="' + esc(s.id + '|' + o.date) + '" aria-pressed="' + o.keen + '" aria-label="Keen on ' + esc(s.store) + ', ' + esc(L.fmtDayLong(o.date)) + '">' + (o.keen ? icon('check') : '') + 'Keen</button>') + '</li>';
  }
  function saleIdeaHtml() {
    if (S.readOnly) return '';
    return saleIdeas().map((x) => '<div class="idea"><p><strong>' + esc(x.store) + '</strong>, ' + esc(x.where.split(', ').pop()) + '. ' + esc(x.offer) + ', ' + esc(L.saleRuleLabel(x.rule).toLowerCase().replace(/^last/, 'the last').replace(/^(\d)/, 'the $1')) + '.</p>' +
      '<button class="btn btn-secondary btn-small" data-act="saleidea" data-arg="' + esc(x.key) + '">Add</button></div>').join('');
  }
  function saleMonthCard(c) {
    const first = ymKey(c.y, c.m) + '-01', last = ymKey(c.y, c.m) + '-' + L.pad(L.daysInMonth(c.y, c.m)), t = today(), list = saleDays(first, last);
    return '<section class="card sale-card" id="saleMonth"><div class="card-head"><h2>Sale days in ' + L.MONTHS_FULL[c.m] + '</h2>' + (list.length ? '<span class="k">' + list.length + '</span>' : '') + '</div>' +
      (list.length ? '<ul class="sale-list">' + list.map((o) => saleRow(o, t)).join('') + '</ul>'
        : '<p class="muted">' + (dealsCfg().sales.length ? 'No sale days this month.' : 'Add the days your shops run sales, like a monthly 20% off Saturday. Mark the ones you\'re keen on: they show on Home, and your phones pop up the evening before.') + '</p>') +
      saleIdeaHtml() + (S.readOnly ? '' : '<button class="btn btn-secondary btn-block" style="margin-top:12px" data-act="saleadd">' + icon('plus') + 'Add a sale day</button>') + '</section>';
  }
  /* The Deals tab: everything on special first, then the watch list and OzBargain. Sale days live in the Calendar. */
  function listBtn() {
    const n = dealsCfg().list.filter((i) => !i.done).length;
    return '<button class="icon-btn list-btn" data-act="shoplist" aria-label="Weekend shopping list' + (n ? ', ' + n + ' to get' : '') + '">' + icon('cart') + (n ? '<span class="list-n" aria-hidden="true">' + n + '</span>' : '') + '</button>';
  }
  function dealsView() {
    const F = S.feed, t = today(), rep = F && F.sources.report, hf = F && F.sources.harris;
    const wk = F ? (rep.to >= t ? rep : hf.to >= t ? hf : null) : null;
    const eyebrow = wk && wk.from && wk.to ? 'Specials ' + L.fmtDay(wk.from) + ' to ' + L.fmtDay(wk.to) : 'This week\'s specials';
    return '<header class="top"><div><p class="eyebrow">' + esc(eyebrow) + '</p><h1 class="title">Deals</h1></div>' +
      '<div class="top-right">' + listBtn() + '</div></header>' +
      everythingCard() + matchesCard() + ozbCard() + dealsFoot();
  }
  /* Home: the next sale day, keen ones first. */
  function nextSaleCard() {
    const t = today(), list = saleDays(t, L.addDays(t, 120)), o = list.filter((x) => x.keen)[0] || list[0];
    if (!o) return '';
    const s = o.sale, n = daysTo(t, o.date), when = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : 'In ' + n + ' days';
    return '<section class="card next-sale" aria-label="Next sale day"><div class="card-head"><p class="k">Next sale day</p><span class="pill">' + when + '</span></div>' +
      '<h2>' + esc(s.store) + '</h2><p class="ns-when">' + esc([L.fmtDayLong(o.date), s.offer].filter(Boolean).join(' · ')) + '</p>' +
      (s.where ? '<p class="ns-where">' + icon('pin') + '<span>' + esc(s.where) + '</span></p>' : '') +
      '<div class="ns-act">' + (S.readOnly ? '' : '<button class="keen-btn" data-act="salekeen" data-arg="' + esc(s.id + '|' + o.date) + '" aria-pressed="' + o.keen + '" aria-label="Keen on ' + esc(s.store) + ', ' + esc(L.fmtDayLong(o.date)) + '">' +
        (o.keen ? icon('check') + 'We\'re keen' : 'Keen?') + '</button>') + '<button class="link" data-act="salecal" data-arg="' + o.date + '">See it in the calendar</button></div></section>';
  }
  /* Home: how many things on the watch list are on special. */
  function onSpecialCard() {
    if (!S.feed || notices().some((n) => n.kind === 'sp')) return '';
    const on = watchByWord().filter((x) => x.hits.length);
    if (!on.length) return '';
    return '<button class="card row-card hot" data-act="godeals"><span class="row-lead"><span class="news-ic" aria-hidden="true">' + icon('tag') + '</span><span><span class="k">On special this week</span>' +
      '<span class="row-t">' + esc(thingsLine(on)) + '</span></span></span>' + icon('arrow') + '</button>';
  }
  /* ---------- in-app notices ---------- */
  /* A heads-up at the top of Home when something's new: specials on your watch list when a new week's specials land,
     and a sale day you're keen on that's today or tomorrow. Each stays until it's closed or opened. What you've seen
     is kept on this phone only. */
  function seenList() { try { const v = JSON.parse(lsGet('hh.seen') || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch (e) { return []; } }
  function markSeen(k) { const v = seenList().filter((x) => x !== k); v.push(String(k).slice(0, 80)); lsSet('hh.seen', JSON.stringify(v.slice(-40))); }
  function specialsKey() {
    const F = S.feed, t = today();
    if (!F) return '';
    const r = F.sources.report, h = F.sources.harris, from = (r.to >= t && r.from) || (h.to >= t && h.from) || '';
    return from ? 'sp:' + from : '';
  }
  /* Specials and OzBargain deals this week that match the watch list. A deal matches on its shop too, so "Tokyo Mart"
     catches Tokyo Mart's sale when someone posts it. */
  function watchHitsNow() {
    const D = dealsCfg(), F = S.feed, t = today();
    if (!D.watch.length || !F) return [];
    const sp = L.sortSpecials(specialsNow().filter((x) => L.watchHits(x.n, D.watch).length), D.watch);
    const deals = F.deals.filter((d) => !d.hp && (!d.to || d.to >= t) && L.watchHits(d.t + ' ' + d.s, D.watch).length).map((d) => ({ n: d.t, s: L.storeName(d.s) }));
    return sp.concat(deals);
  }
  function notices() {
    if (!S.settings || !S.me || S.readOnly) return [];
    const t = today(), seen = seenList(), out = [], wk = specialsKey(), hits = wk && seen.indexOf(wk) < 0 ? watchHitsNow() : [];
    if (hits.length) out.push({ key: wk, kind: 'sp', hits });
    saleDays(t, L.addDays(t, 1)).forEach((o) => { const k = 'sale:' + o.sale.id + '|' + o.date; if (o.keen && seen.indexOf(k) < 0) out.push({ key: k, kind: 'sale', o }); });
    return out;
  }
  const noticeAt = {};
  function noticeHtml(n) {
    const t = today(), now = performance.now(), at = noticeAt[n.key] || (noticeAt[n.key] = now), since = now - at;
    /* A notice that turns up after Home has opened (the specials arrive a moment later) pops in on its own. */
    const pop = since < 600 && at - S.enterAt > 300 && !reduceMotion();
    let eyebrow, title, sub, go = '';
    if (n.kind === 'sp') {
      const on = watchByWord().filter((x) => x.hits.length), tops = on.map((x) => x.hits[0]);
      eyebrow = 'New this week';
      title = on.length ? thingsLine(on) : 'Something on our list is on special';
      sub = tops.slice(0, 2).map((x) => x.n.split(' ').slice(0, 4).join(' ') + ' at ' + shopLabel(x.s)).join(', ') + (tops.length > 2 ? ' and ' + (tops.length - 2) + ' more' : '');
      go = '<button class="btn btn-secondary btn-small" data-act="noticego" data-arg="' + esc(n.key) + '">See them</button>';
    } else {
      const s = n.o.sale;
      eyebrow = 'Sale day';
      title = s.store + ' sale ' + (n.o.date === t ? 'is on today' : 'is tomorrow');
      sub = [s.offer, s.where.split(', ').pop()].filter(Boolean).join(' · ');
    }
    return '<section class="card notice' + (pop ? ' pop' : '') + '"' + (pop ? ' style="--nd:-' + Math.round(since) + 'ms"' : '') + ' role="status">' +
      '<span class="news-ic" aria-hidden="true">' + icon(n.kind === 'sp' ? 'tag' : 'cal') + '</span>' +
      '<div class="notice-b"><p class="k">' + esc(eyebrow) + '</p><p class="notice-t">' + esc(title) + '</p>' + (sub ? '<p class="muted notice-s">' + esc(sub) + '</p>' : '') +
      (go ? '<div class="notice-go">' + go + '</div>' : '') + '</div>' +
      '<button class="icon-btn notice-x" data-act="noticex" data-arg="' + esc(n.key) + '" aria-label="Close this notice">' + icon('close') + '</button></section>';
  }
  function saleForm(s, date) {
    if (s) return { store: s.store, offer: s.offer, where: s.where, k: s.rule.k, n: String(s.rule.n || 2), dow: String(s.rule.dow != null ? s.rule.dow : 6), day: String(s.rule.day || 1), date: s.rule.date || '', keen: s.keen };
    const d = date || today(), dd = L.parseYmd(d);
    return { store: '', offer: '', where: '', k: date ? 'once' : 'nth', n: String(Math.min(5, Math.ceil(dd.getDate() / 7))), dow: String(dd.getDay()), day: String(dd.getDate()), date: d, keen: true };
  }
  function formRule(F) {
    if (F.k === 'once') return ISO_DAY.test(F.date || '') ? { k: 'once', date: F.date } : null;
    if (F.k === 'weekly') return { k: 'weekly', dow: L.clamp(parseInt(F.dow, 10), 0, 6) };
    if (F.k === 'monthly') return { k: 'monthly', day: L.clamp(parseInt(F.day, 10) || 1, 1, 31) };
    return { k: 'nth', n: L.clamp(parseInt(F.n, 10) || 1, 1, 5), dow: L.clamp(parseInt(F.dow, 10), 0, 6) };
  }
  function saleDialog(d) {
    const F = d.form, t = today(), rule = formRule(F);
    const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>';
    const dowSel = '<select class="input" id="saleDow" data-bind="dialog.form.dow" data-change="salerefresh">' + [1, 2, 3, 4, 5, 6, 0].map((i) => opt(i, L.DAYS_FULL[i], F.dow)).join('') + '</select>';
    let when = '';
    if (F.k === 'nth') when = '<div class="row2"><label class="field"><span>Which</span><select class="input" id="saleN" data-bind="dialog.form.n" data-change="salerefresh">' + [1, 2, 3, 4, 5].map((n) => opt(n, ['1st', '2nd', '3rd', '4th', 'Last'][n - 1], F.n)).join('') + '</select></label><label class="field"><span>Day</span>' + dowSel + '</label></div>';
    else if (F.k === 'monthly') when = '<label class="field"><span>Date each month</span><select class="input" id="saleDay" data-bind="dialog.form.day" data-change="salerefresh">' + Array.from({ length: 31 }, (_, i) => opt(i + 1, L.ordinalDay(i + 1), F.day)).join('') + '</select></label>';
    else if (F.k === 'weekly') when = '<label class="field"><span>Day</span>' + dowSel + '</label>';
    else when = '<label class="field"><span>Date</span><input class="input" id="saleDate" type="date" data-bind="dialog.form.date" data-change="salerefresh" value="' + esc(F.date) + '"></label>';
    const next = rule ? L.saleDates(rule, t, L.addDays(t, 400)).slice(0, 3) : [];
    return '<h2 id="dlgT">' + (d.id ? 'Edit sale day' : 'Add a sale day') + '</h2>' +
      '<label class="field"><span>Shop</span><input class="input" id="saleStore" maxlength="40" placeholder="Lucky Mart" autocomplete="off" data-bind="dialog.form.store" value="' + esc(F.store) + '"></label>' +
      '<label class="field"><span>The deal</span><input class="input" id="saleOffer" maxlength="60" placeholder="20% off storewide" autocomplete="off" data-bind="dialog.form.offer" value="' + esc(F.offer) + '"></label>' +
      '<label class="field"><span>When</span><select class="input" id="saleKind" data-bind="dialog.form.k" data-change="salerefresh">' +
        [['nth', 'Same weekday each month'], ['monthly', 'Same date each month'], ['weekly', 'Every week'], ['once', 'Just once']].map((x) => opt(x[0], x[1], F.k)).join('') + '</select></label>' + when +
      '<p class="hint" aria-live="polite">' + esc(next.length ? 'Next: ' + next.map(L.fmtDay).join(', ') : rule && F.k === 'once' ? 'That date has passed.' : 'Pick a date.') + '</p>' +
      '<label class="field"><span>Where (optional)</span><input class="input" id="saleWhere" maxlength="80" autocomplete="off" data-bind="dialog.form.where" value="' + esc(F.where) + '"></label>' +
      '<label class="switch-row"><span>We\'re keen every time</span><input type="checkbox" class="switch" role="switch" data-bind="dialog.form.keen"' + (F.keen ? ' checked' : '') + '></label>' +
      (d.error ? '<p class="err-text" role="alert">' + esc(d.error) + '</p>' : '') +
      '<div class="dialog-actions"><button class="btn btn-secondary" data-act="dlgclose">Cancel</button><button class="btn btn-primary" data-act="salesave">' + (d.id ? 'Save' : 'Add sale day') + '</button></div>' +
      (d.id ? '<p class="dlg-extra"><button class="link sm danger" data-act="saledel">Remove this sale day</button></p>' : '');
  }

  /* ---------- phone notifications ---------- */
  /* Pop-ups on your phones, even with the app closed: when the other of you adds a spend, the evening before and the
     morning of a sale day you're keen on, and when something on the watch list is on special. Each phone subscribes here with Web Push. A free
     GitHub job sends them; it signs in as its own bot user, whose login is kept in GitHub's encrypted secrets and which the
     Firestore rules limit to sale days, the watch list and phones. Each pop-up is encrypted for the phone it goes to. The first phone to turn them on makes the Web Push key pair and
     keeps it in hh/push, which only your two logins and that job can read. */
  const PUSH_BASE = { vapid: null, subs: {}, prefs: {}, sent: {}, last: null };
  const b64u = (bytes) => btoa(String.fromCharCode.apply(null, Array.from(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = (t) => { t = String(t || ''); return Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)), (c) => c.charCodeAt(0)); };
  const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => { try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
  function pushSupport() {
    if (isIOS() && !standalone()) return 'install';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
    return Notification.permission === 'denied' ? 'denied' : 'ok';
  }
  function pushCfg() {
    const d = S.pushDoc && typeof S.pushDoc === 'object' ? S.pushDoc : {}, subs = d.subs && typeof d.subs === 'object' ? d.subs : {};
    const pref = (p) => { const x = d.prefs && d.prefs[p] && typeof d.prefs[p] === 'object' ? d.prefs[p] : {}; return { sale: x.sale !== false, specials: x.specials !== false, spends: x.spends !== false }; };
    return {
      pub: d.vapid && typeof d.vapid.pub === 'string' ? d.vapid.pub : '',
      subs: Object.keys(subs).filter((k) => subs[k] && typeof subs[k] === 'object' && typeof subs[k].endpoint === 'string').map((k) => Object.assign({ id: k }, subs[k])),
      prefs: { a: pref('a'), b: pref('b') },
      last: d.last && typeof d.last === 'object' && typeof d.last.at === 'string' ? d.last : null
    };
  }
  const myPushId = () => lsGet('hh.pushId') || '';
  const swReady = () => Promise.race([navigator.serviceWorker.ready, delay(6000).then(() => { throw { code: 'sw' }; })]);
  /* The Web Push key pair, made on the first phone that turns notifications on. */
  function pushKey() {
    const have = pushCfg().pub;
    if (have) return Promise.resolve(have);
    return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
      .then((kp) => Promise.all([crypto.subtle.exportKey('raw', kp.publicKey), crypto.subtle.exportKey('jwk', kp.privateKey)]))
      .then((r) => {
        const pub = b64u(new Uint8Array(r[0]));
        S.pushDoc = Object.assign({}, S.pushDoc || PUSH_BASE, { vapid: { pub, d: r[1].d } });
        return upsert('hh/push', { vapid: { pub, d: r[1].d } }, PUSH_BASE).then((ok) => { if (!ok) throw { code: 'save' }; return pub; });
      });
  }
  const deviceName = () => (isIOS() ? 'iPhone' : /Android/i.test(navigator.userAgent) ? 'Android phone' : 'Computer');
  /* Subscribes this phone with the household's key, swapping out a subscription made with an older one. */
  function subscribeWith(reg, pub) {
    return reg.pushManager.getSubscription().then((old) => {
      const k = old && old.options && old.options.applicationServerKey;
      return old && (!k || b64u(new Uint8Array(k)) !== pub) ? old.unsubscribe().then(() => null, () => null) : old;
    }).then((old) => old || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(pub) })).then((sub) => {
      const j = sub.toJSON(), id = 'p' + L.hash(j.endpoint).slice(0, 12), prev = myPushId(), subs = {};
      subs[id] = { who: S.me, endpoint: j.endpoint, keys: j.keys, vapid: pub, at: Date.now(), welcomed: false, stale: false, device: deviceName() };
      if (prev && prev !== id) subs[prev] = null;
      lsSet('hh.pushId', id);
      return upsert('hh/push', { subs }, PUSH_BASE);
    });
  }
  function pushOn() {
    const sup = pushSupport();
    if (sup !== 'ok') { S.pushNote = sup; render(); return; }
    /* Asked first, inside the tap: iPhones only show the question for a tap. */
    const ask = Notification.requestPermission();
    S.pushBusy = true; S.pushNote = null; render();
    Promise.resolve(ask).then((perm) => {
      if (perm !== 'granted') throw { code: perm === 'denied' ? 'denied' : 'dismissed' };
      return Promise.all([swReady(), pushKey()]);
    }).then((r) => subscribeWith(r[0], r[1])).then((ok) => {
      S.pushBusy = false; S.pushNote = ok ? null : 'error'; render();
      if (ok) { toast('Notifications are on for this phone'); kick(); }
    }, (e) => { S.pushBusy = false; S.pushNote = e && (e.code === 'denied' || e.code === 'dismissed') ? e.code : 'error'; render(); });
  }
  function pushOff() {
    const id = myPushId();
    S.pushBusy = true; render();
    const done = () => { lsSet('hh.pushId', ''); S.pushBusy = false; S.pushNote = null; render(); toast('Notifications are off for this phone'); };
    swReady().then((reg) => reg.pushManager.getSubscription()).then((s) => s && s.unsubscribe()).catch(noop)
      .then(() => (id ? upsert('hh/push', { subs: { [id]: null } }, PUSH_BASE) : true)).then(done, done);
  }
  /* Each time the app opens: a phone whose subscription went stale (or was made with an older key) quietly signs up again. */
  let pushChecked = false;
  function pushCheck() {
    if (pushChecked || !S.me || S.readOnly || !S.live.hh || !myPushId() || pushSupport() !== 'ok' || Notification.permission !== 'granted') return;
    pushChecked = true;
    const P = pushCfg(), mine = P.subs.filter((x) => x.id === myPushId())[0];
    if (!P.pub || (mine && mine.vapid === P.pub && !mine.stale && mine.who === S.me)) return;
    swReady().then((reg) => subscribeWith(reg, P.pub)).catch(noop);
  }
  /* ---------- pop-ups for new spends ---------- */
  /* When one of us adds a spend, the other's phone gets a pop-up. The phone notes it in hh/push (a short list for each
     person, events.a and events.b), which the GitHub job can read, then starts the job straight away with a GitHub
     token kept in hh/ai, which only our two logins can read. Without the token, the morning and evening runs send it. */
  const GH_TOKEN = /^(github_pat_[A-Za-z0-9_]{40,}|ghp_[A-Za-z0-9]{30,})$/;
  const ghToken = () => (S.aiDoc && typeof S.aiDoc.ghToken === 'string' ? S.aiDoc.ghToken : '');
  /* The repo the app is served from: owner.github.io/repo. */
  function ghRepo() {
    if (window.HH_REPO) return String(window.HH_REPO);
    const m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname || ''), repo = (location.pathname || '').split('/').filter(Boolean)[0];
    return m && repo ? m[1] + '/' + repo : '';
  }
  /* GitHub's new token page, filled in: the name, 364 days (GitHub won't take a year or more), and Actions read and write.
     The repo is picked by hand. */
  const TOKEN_LINK = 'https://github.com/settings/personal-access-tokens/new?name=Household+pop-ups&description=' +
    encodeURIComponent('Lets the household app start its Phone notifications job when a spend is added') + '&expires_in=364&actions=write';
  /* Starts the job for new spends, or the deals refresh. Resolves with GitHub's answer: 204 means it's on its way, -1
     that GitHub couldn't be reached. */
  function startJob(token, file) {
    const repo = ghRepo(), deals = file === 'deals.yml';
    if (!repo || !token) return Promise.resolve(0);
    return fetch('https://api.github.com/repos/' + repo + '/actions/workflows/' + (deals ? 'deals.yml' : 'notify.yml') + '/dispatches', {
      method: 'POST', cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(deals ? { ref: 'main' } : { ref: 'main', inputs: { mode: 'spends' } })
    }).then((r) => r.status, () => -1);
  }
  const jobOk = (st) => st === 204 || st === 200;
  function ghWhy(st) {
    if (st === 401) return 'GitHub didn\'t accept the token. It may have expired or been deleted, so make a new one.';
    if (st === 403) return 'The token isn\'t allowed to start the job. Make a new one from the link, which sets Actions to Read and write.';
    if (st === 404) return 'The token can\'t see the household repo. Make a new one, and under Repository access pick Only select repositories, then household.';
    if (st === 422) return 'GitHub has an older copy of the job. Close the app fully, reopen it and try again.';
    if (st === -1) return 'Couldn\'t reach GitHub. Check your connection and try again.';
    if (st === 0) return 'Instant pop-ups only work in the app on your Home Screen.';
    return 'GitHub said no (' + st + '). Try again in a minute.';
  }
  /* Starts the job if there's a token, and remembers if GitHub said no, so Settings can say why. */
  function kick() {
    const tok = ghToken();
    if (!tok) return;
    startJob(tok).then((st) => {
      if (st === -1 || st === 0) return;
      const was = lsGet('hh.ghFail') || '';
      lsSet('hh.ghFail', jobOk(st) ? '' : String(st));
      if (!jobOk(st) && lsGet('hh.ghFailDay') !== today()) { lsSet('hh.ghFailDay', today()); setTimeout(() => toast('Instant pop-ups need a look in Settings'), 2600); }
      if (was !== (lsGet('hh.ghFail') || '') && S.view === 'settings') safeRender();
    });
  }
  const myEvents = () => { const d = S.pushDoc || {}; return d.events && Array.isArray(d.events[S.me]) ? d.events[S.me].filter((x) => x && typeof x === 'object') : []; };
  /* Adds a note to this person's list, keeping the last 20 from the past three days. Worked out when the write runs,
     so two quick saves both make it. */
  function noteEvent(ev) {
    return enqueue('hh/push', (ref) => {
      const cut = Date.now() - 3 * 864e5;
      return ref.update({ events: { [S.me]: myEvents().filter((x) => x.at > cut && x.id !== ev.id).slice(-19).concat([ev]) } });
    });
  }
  function dropEvent(id) {
    return enqueue('hh/push', (ref) => ref.update({ events: { [S.me]: myEvents().filter((x) => x.id !== id) } }));
  }
  /* A pop-up on the other person's phones for the spends one save just added: the total, what it was, who paid and
     their share. Only if one of their phones is on and they haven't turned spends off. */
  function spendPop(list, what) {
    const me = S.me, to = other(me), P = pushCfg();
    if (!me || S.readOnly || S.mode !== 'firebase' || !list.length || !P.pub || !P.prefs[to].spends || !P.subs.some((x) => x.who === to && x.vapid === P.pub && !x.stale)) return;
    const amt = list.reduce((a, e) => a + (e.amount || 0), 0), share = list.reduce((a, e) => a + ((e.owed && e.owed[to]) || 0), 0);
    const payers = list.map((e) => e.payer).filter((x, i, a) => a.indexOf(x) === i);
    const paid = payers.length === 1 && (payers[0] === 'a' || payers[0] === 'b') ? (payers[0] === to ? 'You paid' : nm(payers[0]) + ' paid') : 'You both paid';
    const e0 = list[0], name = String(what || e0.title || 'A spend').trim().slice(0, 40);
    const cat = e0.category && e0.category !== 'Other' && e0.category.toLowerCase() !== name.toLowerCase() ? e0.category : '';
    const ev = {
      id: uid('e'), at: Date.now(), n: nm(me), c: amt, sh: share,
      t: '💸 ' + nm(me) + ' added ' + L.fmt(amt),
      b: [name, cat, e0.date !== today() ? L.fmtDay(e0.date) : ''].filter(Boolean).join(' · ') + '\n' + paid + ' · ' + (share > 0 ? 'your share ' + L.fmt(share) : 'it\'s all ' + poss(nm(me))),
      l: L.fmt(amt) + ' ' + name
    };
    noteEvent(ev).then((ok) => { if (ok) kick(); });
  }
  /* Settings: whether new spends pop up straight away, and the setup for it (for whoever set the app up). */
  function instantRow() {
    const tok = ghToken(), fail = Number(lsGet('hh.ghFail') || 0), ed = isEditor();
    if (tok && !fail) return '<p class="push-on">' + icon('check') + 'New spends pop up within a minute</p>' + (ed ? '<button class="link sm" data-act="ghtoken">Instant pop-ups setup</button>' : '');
    if (tok) return '<p class="err-text">' + esc(ghWhy(fail)) + ' Until it\'s fixed, new spends wait for the morning or evening check.</p>' +
      (ed ? '<button class="btn btn-secondary btn-block" data-act="ghtoken">Fix instant pop-ups</button>' : '<p class="hint">' + esc(nm(editorOf())) + ' can fix it in Settings.</p>');
    return '<p class="hint">New spends pop up at the next morning or evening check.' + (ed ? ' A GitHub token makes it within a minute. It takes two minutes, once, for both phones.' : '') + '</p>' +
      (ed ? '<button class="btn btn-secondary btn-block" data-act="ghtoken">Set up instant pop-ups</button>' : '');
  }
  function ghTokenDialog(d) {
    const has = !!ghToken(), P = pushCfg(), mine = P.subs.some((x) => x.id === myPushId() && x.who === S.me && x.vapid === P.pub && !x.stale);
    return '<div class="dlg-head"><h2 id="dlgT">Instant pop-ups</h2><button class="icon-btn" data-act="dlgclose" aria-label="Close">' + icon('close') + '</button></div>' +
      '<p class="muted">A GitHub token lets either phone start the pop-up job the moment a spend is added, so it lands on the other phone within a minute. Make it once and it works on both phones.</p>' +
      '<ol class="setup-steps"><li><a href="' + esc(TOKEN_LINK) + '" target="_blank" rel="noopener">Open GitHub\'s new token page</a>. It fills in the name, an expiry 364 days away and Actions: Read and write.</li>' +
      '<li>Under <strong>Repository access</strong>, pick <strong>Only select repositories</strong>, then <strong>household</strong>.</li>' +
      '<li>Tap <strong>Generate token</strong> and copy it.</li><li>Paste it here and tap Save.' + (mine ? ' This phone gets a test pop-up within a minute.' : '') + '</li></ol>' +
      (has ? '<p class="hint">A token is saved. Paste a new one to replace it.</p>' : '') +
      '<label class="sr" for="ghTokIn">GitHub token</label><input class="input" id="ghTokIn" placeholder="Paste the token" autocomplete="off" autocapitalize="off" spellcheck="false" data-bind="ghTokNew" data-enter="ghtoksave" value="' + esc(S.ghTokNew) + '">' +
      (d.err ? '<p class="err-text" role="alert">' + esc(d.err) + '</p>' : '') +
      '<p class="hint">It\'s saved privately for the two of you, never in the app\'s public code, and it can only start or stop this repo\'s GitHub jobs. If it ever gets out, delete it on GitHub under Settings, Developer settings.</p>' +
      '<div class="dialog-actions">' + (has ? '<button class="btn btn-secondary" data-act="ghtokdel">Remove it</button>' : '<button class="btn btn-secondary" data-act="dlgclose">Not now</button>') +
      '<button class="btn btn-primary" data-act="ghtoksave"' + (d.busy ? ' disabled' : '') + '>' + (d.busy ? 'Checking' : 'Save') + '</button></div>';
  }
  function pushCard() {
    const P = pushCfg(), sup = pushSupport(), me = S.me, mine = P.subs.filter((x) => x.id === myPushId() && x.who === me)[0], pref = P.prefs[me];
    const who = ['a', 'b'].map((p) => nm(p) + ': ' + (P.subs.some((x) => x.who === p) ? 'on' : 'not yet')).join(' · ');
    const notes = {
      install: 'Open the app from its icon on your Home Screen to turn these on. iPhones need iOS 16.4 or later.',
      unsupported: 'This browser can\'t show notifications. Open the app on your phone instead.',
      denied: 'Notifications are blocked for this app. Allow them in your phone\'s Settings under Notifications, then come back here.',
      dismissed: 'No worries. Tap the button again when you\'re ready.',
      error: 'That didn\'t work. Check your connection and try again.'
    };
    let out = '<section class="card" id="pushCard"><div class="card-head"><h2>Phone notifications</h2></div>' +
      '<p class="muted">A pop-up when ' + esc(nm(other(me))) + ' adds a spend, the evening before a sale day you\'re keen on, with the top specials each Wednesday, and when something on the watch list is on special.</p>' +
      '<p class="hint">' + esc(who) + '</p>';
    if (!S.readOnly) {
      if (mine) {
        out += '<p class="push-on">' + icon('check') + 'On for this phone</p>' +
          '<label class="switch-row"><span>Spends ' + esc(nm(other(me))) + ' adds</span><input type="checkbox" class="switch" role="switch" data-change="pushpref" data-arg="spends"' + (pref.spends ? ' checked' : '') + '></label>' +
          '<label class="switch-row"><span>Sale days we\'re keen on</span><input type="checkbox" class="switch" role="switch" data-change="pushpref" data-arg="sale"' + (pref.sale ? ' checked' : '') + '></label>' +
          '<label class="switch-row"><span>Top specials and our watch list</span><input type="checkbox" class="switch" role="switch" data-change="pushpref" data-arg="specials"' + (pref.specials ? ' checked' : '') + '></label>' +
          '<button class="link sm" data-act="pushoff"' + (S.pushBusy ? ' disabled' : '') + '>Turn off for this phone</button>';
      } else {
        const blocked = sup === 'install' || sup === 'unsupported', n = S.pushNote || (sup !== 'ok' ? sup : null);
        out += '<button class="btn btn-primary btn-block" data-act="pushon"' + (S.pushBusy || blocked ? ' disabled' : '') + '>' + (S.pushBusy ? 'Turning on' : 'Turn on for this phone') + '</button>' +
          (n && notes[n] ? '<p class="hint" role="status">' + esc(notes[n]) + '</p>' : '');
      }
    }
    if (P.last) out += '<p class="hint">Last checked ' + esc(agoLabel(P.last.at)) + '.</p>' + (S.readOnly ? '' : '<div class="push-instant">' + instantRow() + '</div>');
    else if (isEditor()) {
      out += '<div class="push-setup"><p class="k">One-time setup</p><p>A free job in your GitHub repo sends the pop-ups. It signs in as its own bot user, which can only see your sale days, watch list and phones:</p><ol>' +
        '<li>In the Firebase console, open Authentication, then Users, and tap Add user. Use the bot email from your latest firestore.rules (your email with +bot before the @) and a long password from your password manager.</li>' +
        '<li>Open Firestore Database, then Rules. Paste in that firestore.rules, which lets the bot in, and tap Publish.</li>' +
        '<li>On GitHub, open your household repo, then Settings, Secrets and variables, Actions. Add two repository secrets, BOT_EMAIL and BOT_PASSWORD, with that email and password.</li></ol>' +
        '<p class="hint">To test it, open Actions on GitHub, then Phone notifications, then Run workflow.</p></div>';
    } else out += '<p class="hint">' + esc(nm(editorOf())) + ' is finishing the setup for these.</p>';
    return out + '</section>';
  }

  /* ---------- notes for the other person ---------- */
  function editorOf() {
    const C = cfg(), m = C.members || {};
    if (C.editor) return C.editor;
    if (C.welcome.to) return other(C.welcome.to);
    if (m.a && !m.b) return 'a';
    if (m.b && !m.a) return 'b';
    return 'a';
  }
  const isEditor = () => !!S.me && S.me === editorOf();
  /* Records who set the app up while that's still certain: the only one signed in so far. */
  function ensureEditor() {
    const C = cfg(), m = C.members || {};
    if (!S.settings || C.editor || S.readOnly || !S.me || !S.live.hh) return;
    const only = m.a && !m.b ? 'a' : m.b && !m.a ? 'b' : null;
    if (only && only === S.me) upsert('hh/settings', { editor: only }, defaults());
  }
  const noteEdits = (id) => { const n = S.newsDoc && S.newsDoc.notes; return n && typeof n === 'object' && n[id] && typeof n[id] === 'object' ? n[id] : {}; };
  function noteFor(id) {
    const R = RELEASES.filter((r) => r.id === id)[0];
    if (!R) return null;
    const E = noteEdits(id), items = Array.isArray(E.items) ? E.items : [];
    return {
      id, date: R.date,
      title: typeof E.title === 'string' && E.title.trim() ? E.title.slice(0, 80) : R.title,
      intro: typeof E.intro === 'string' ? E.intro.slice(0, 300) : 'Some new bits in our app.',
      items: R.items.map((x, i) => {
        const e = items[i] && typeof items[i] === 'object' ? items[i] : {};
        return { icon: x[0], head: typeof e.head === 'string' ? e.head.slice(0, 40) : x[1], text: typeof e.text === 'string' ? e.text.slice(0, 240) : x[2], on: e.on !== false };
      }),
      status: E.status === 'published' || E.status === 'skipped' ? E.status : 'draft',
      publishedAt: typeof E.publishedAt === 'number' ? E.publishedAt : 0,
      edited: !!E.editedAt
    };
  }
  /* The newest note that was shown to the other person. */
  function publishedNote() {
    for (let i = 0; i < RELEASES.length; i++) { const n = noteFor(RELEASES[i].id); if (n && n.status === 'published') return n; }
    return null;
  }
  function newsDue() {
    if (!S.me || isEditor()) return null;
    const n = publishedNote();
    return n && cfg().news[S.me] !== n.id ? n : null;
  }
  function saveNote(patch) {
    const n = Object.assign(S.newsEdit, patch || {});
    const notes = Object.assign({}, (S.newsDoc && S.newsDoc.notes) || {});
    notes[n.id] = { title: String(n.title || '').slice(0, 80), intro: String(n.intro || '').slice(0, 300), items: n.items.map((x) => ({ head: String(x.head || '').slice(0, 40), text: String(x.text || '').slice(0, 240), on: x.on !== false })),
      status: n.status, publishedAt: n.publishedAt || 0, editedAt: Date.now() };
    S.newsDoc = Object.assign({}, S.newsDoc || {}, { notes });
    return upsert('hh/news', { notes }, { notes: {} });
  }
  function resetNote() {
    const n = S.newsEdit;
    if (!n) return;
    const notes = Object.assign({}, (S.newsDoc && S.newsDoc.notes) || {});
    notes[n.id] = { status: n.status, publishedAt: n.publishedAt || 0 };
    S.newsDoc = Object.assign({}, S.newsDoc || {}, { notes });
    S.newsEdit = null;
    upsert('hh/news', { notes }, { notes: {} });
  }
  function viewNewsEdit() {
    if (!isEditor()) { S.view = 'settings'; return viewSettings(); }
    const them = nm(other(S.me));
    if (!S.newsId || !RELEASES.some((r) => r.id === S.newsId)) S.newsId = RELEASES.length ? RELEASES[0].id : null;
    if (!S.newsEdit || S.newsEdit.id !== S.newsId) S.newsEdit = S.newsId ? clone(noteFor(S.newsId)) : null;
    const n = S.newsEdit;
    let out = '<header class="top"><div><button class="back-link" data-act="go" data-arg="settings">' + icon('left') + 'Settings</button><p class="eyebrow">Just for you</p><h1 class="title">Notes for ' + esc(them) + '</h1></div></header>';
    if (!n) return out + '<section class="card empty"><h2>No notes yet</h2><p>When there\'s an update, Claude\'s draft shows up here.</p></section>';
    out += '<p class="muted" style="margin:0 4px 14px">Claude drafts a note for each update. Change anything you like, then show it to ' + esc(them) + ', who sees it once, the next time the app opens.</p>';
    const seen = cfg().news[other(S.me)] === n.id;
    const status = n.status === 'published' ? (seen ? esc(them) + ' has read it' : 'Shown to ' + esc(them)) : n.status === 'skipped' ? 'Not showing this one' : n.edited ? 'Your draft' : 'Claude\'s draft';
    out += '<section class="card note-edit"><div class="card-head"><h2>' + esc(dateY(n.date)) + '</h2><span class="tag' + (n.status === 'published' ? ' ok' : '') + '">' + status + '</span></div>' +
      '<label class="field"><span>Title</span><input class="input" id="nwTitle" maxlength="80" data-bind="newsEdit.title" data-change="newssave" value="' + esc(n.title) + '"></label>' +
      '<label class="field"><span>A line to start</span><textarea class="input" id="nwIntro" rows="2" maxlength="300" data-bind="newsEdit.intro" data-change="newssave">' + esc(n.intro) + '</textarea></label>' +
      n.items.map((x, i) => '<div class="nw-item' + (x.on ? '' : ' off') + '"><div class="nw-top"><span class="news-ic" aria-hidden="true">' + icon(x.icon) + '</span>' +
        '<label class="switch-row nw-sw"><span>' + (x.on ? 'Showing' : 'Hidden') + '</span><input type="checkbox" class="switch" role="switch" data-act="newsitem" data-arg="' + i + '"' + (x.on ? ' checked' : '') + ' aria-label="Show this part to ' + esc(them) + '"></label></div>' +
        '<label class="field"><span class="sr">Heading</span><input class="input" id="nwHead' + i + '" maxlength="40" data-bind="newsEdit.items.' + i + '.head" data-change="newssave" value="' + esc(x.head) + '"></label>' +
        '<label class="field" style="margin:0"><span class="sr">What to say</span><textarea class="input" id="nwText' + i + '" rows="3" maxlength="240" data-bind="newsEdit.items.' + i + '.text" data-change="newssave">' + esc(x.text) + '</textarea></label></div>').join('') +
      '<div class="nw-actions"><button class="btn btn-secondary" data-act="newspreview">Preview</button>' +
      (n.status === 'published' ? (seen ? '' : '<button class="btn btn-secondary" data-act="newsdraft">Take it back</button>') : '<button class="btn btn-primary" data-act="newspublish">Show it to ' + esc(them) + '</button>') + '</div>' +
      '<p class="nw-more">' + (n.status !== 'skipped' && n.status !== 'published' ? '<button class="link sm" data-act="newsskip">Don\'t show this one</button>' : '') +
      (n.edited ? '<button class="link sm" data-act="newsreset">Go back to Claude\'s draft</button>' : '') + '</p></section>';
    const earlier = RELEASES.filter((r) => r.id !== n.id);
    if (earlier.length) {
      out += '<section class="card"><div class="card-head"><h2>Other notes</h2></div>' + earlier.map((r) => { const m = noteFor(r.id); return '<button class="row-btn" data-act="newspick" data-arg="' + esc(r.id) + '"><span>' + esc(m.title) + '</span><span class="k">' + esc(dateY(r.date)) + '</span></button>'; }).join('') + '</section>';
    }
    return out;
  }

  /* ---------- profiles ---------- */
  function viewProfile() {
    if (!S.draft) S.draft = makeDraft();
    const D = S.draft, ro = S.readOnly ? ' disabled' : '';
    let out = '<header class="top"><div><button class="back-link" data-act="go" data-arg="settings">' + icon('left') + 'Settings</button><p class="eyebrow">You two</p><h1 class="title">Profiles</h1></div></header>';
    out += ['a', 'b'].map((p) => {
      const has = hasPhoto(p), busy = S.photoBusy === p;
      return '<section class="card profile"><div class="profile-top">' + av(p, 'xl') + '<div class="profile-act">' +
        (ro ? '' : '<label class="btn btn-secondary file-btn">' + (busy ? 'Saving photo' : has ? 'Change photo' : 'Add a photo') +
          '<input type="file" accept="image/*" data-change="photo" data-arg="' + p + '" aria-label="Choose a photo for ' + esc(nm(p)) + '"' + (busy ? ' disabled' : '') + '></label>' +
          (has ? '<button class="link sm danger" data-act="photodel" data-arg="' + p + '">Remove photo</button>' : '')) + '</div></div>' +
        (S.photoErr && S.photoErr.p === p ? '<p class="err-text" role="alert" style="margin-top:10px">' + esc(S.photoErr.msg) + '</p>' : '') +
        '<label class="field" style="margin-top:14px"><span>Name</span><input class="input" id="dn' + p + '" maxlength="24" data-bind="draft.names.' + p + '" data-change="dirty" value="' + esc(D.names[p]) + '"' + ro + '></label>' +
        '<fieldset style="margin:0"><legend>Colour</legend>' + colourPicker('ccolour', p, D.colours[p]) + '</fieldset></section>';
    }).join('');
    out += '<section class="card"><fieldset style="margin:0"><legend>This phone is</legend><div class="seg">' + segBtn('claim', 'a', S.me === 'a', poss(nm('a')), 'a') + segBtn('claim', 'b', S.me === 'b', poss(nm('b')), 'b') + '</div>' +
      '<p class="hint">So the app says "you owe" to the right person.</p></fieldset></section>';
    if (!S.readOnly) {
      out += '<div class="savebar above-nav">' + (D.error ? '<p class="err-text" role="alert">' + esc(D.error) + '</p>' : '') +
        '<button class="btn btn-primary btn-block" data-act="savecustom">Save changes</button></div>';
    }
    return out;
  }
  function savePhoto(p, url) {
    S.photos = Object.assign({ a: null, b: null }, S.photos || {}, { [p]: url });
    applyPhotos();
    return upsert('hh/photos', { [p]: url }, { a: null, b: null });
  }

  /* ---------- settings ---------- */
  function viewSettings() {
    const fb = S.mode === 'firebase', them = esc(nm(other(S.me || 'a')));
    let out = '<header class="top"><div><p class="eyebrow">Our household</p><h1 class="title">Settings</h1></div></header>';
    const waiting = pendingAll().length;
    out += '<button class="card row-card' + (waiting ? ' attn' : '') + '" data-act="go" data-arg="upload"><span class="row-lead">' + (waiting ? '<span class="count">' + waiting + '<span class="sr"> to check</span></span>' : '') +
      '<span><span class="row-t">Upload</span><span class="k">' + esc(poss(nm(holder()))) + ' Westpac statement and Splitwise files</span></span></span>' + icon('arrow') + '</button>';
    out += '<button class="card row-card" data-act="go" data-arg="profile"><span class="row-lead"><span class="duo" aria-hidden="true">' + av('a') + av('b') + '</span><span><span class="row-t">Profiles</span><span class="k">Photos, names and colours</span></span></span>' + icon('arrow') + '</button>';
    out += '<button class="card row-card" data-act="go" data-arg="custom"><span><span class="row-t">Customise</span><span class="k">Look, budget, rent, card and categories</span></span>' + icon('arrow') + '</button>';
    if (isEditor() && RELEASES.length) {
      out += '<button class="card row-card" data-act="go" data-arg="newsedit"><span><span class="row-t">Notes for ' + esc(nm(other(S.me))) + '</span><span class="k">Just for you: what ' + esc(nm(other(S.me))) + ' sees after an update</span></span>' + icon('arrow') + '</button>';
    } else if (publishedNote()) {
      out += '<button class="card row-card" data-act="newsopen"><span><span class="row-t">What\'s new</span><span class="k">' + esc(publishedNote().title) + '</span></span>' + icon('arrow') + '</button>';
    }
    if (fb) out += pushCard();
    if (fb) {
      out += '<section class="card"><div class="card-head"><h2>Account</h2></div><p class="muted">Signed in as <strong>' + esc((S.authUser && S.authUser.email) || '') + '</strong></p>' +
        '<button class="btn btn-secondary btn-block" style="margin-top:12px" data-act="auout">Sign out</button></section>';
    }
    out += '<section class="card"><div class="card-head"><h2>Sharing</h2></div>' + (fb
      ? '<p>To use this together, send ' + them + ' the link to this app. ' + them + ' makes a login with the email you put in your Firebase rules.</p>'
      : '<p>To use this together, share the app with ' + them + ' by email as an <strong>Editor</strong>. Don\'t turn on a public link: anyone with it could read your spends, and it stops outside editors from saving.</p>') + '</section>';
    out += '<section class="card"><div class="card-head"><h2>Your data</h2></div><button class="btn btn-secondary btn-block" data-act="copycsv">Copy all spends as CSV</button><p class="hint">' +
      S.entries.length + (S.entries.length === 1 ? ' spend' : ' spends') + ' saved. Paste into a spreadsheet for your own records.</p></section>';
    if (fb) {
      out += '<section class="card"><div class="card-head"><h2>App</h2></div><p class="muted" style="margin-bottom:12px">Updates go live without reinstalling. This loads the newest version now.</p>' +
        '<button class="btn btn-secondary btn-block" data-act="reload">Get the latest version</button></section>';
    }
    return out;
  }

  /* ---------- customise ---------- */
  function makeDraft() {
    const C = cfg();
    return {
      names: { a: C.names.a || '', b: C.names.b || '' }, colours: { a: C.colours.a, b: C.colours.b },
      budget: C.budget ? centsToStr(C.budget) : '', resetDay: String(C.resetDay), splitA: C.splitA,
      categories: C.categories.slice(), newCat: '',
      goal: { name: C.goal.name, target: C.goal.target ? centsToStr(C.goal.target) : '', saved: C.goal.saved ? centsToStr(C.goal.saved) : '' },
      card: {
        name: C.card.name, holder: C.card.holder, earns: C.card.earns,
        rates: C.card.earns ? strRates(C.card.rates && C.card.rates.intl != null ? C.card.rates : L.CARD_PRESETS[C.card.earns].rates) : { intl: '', everyday: '', other: '', after: '' },
        ratio: String(C.card.ratio || 3),
        pointsBal: C.card.pointsBal != null ? C.card.pointsBal.toLocaleString('en-AU') : '', pointsAsOf: C.card.pointsAsOf || ''
      },
      home: { week: C.home.week !== false, goal: C.home.goal !== false, spot: C.home.spot !== false, recap: C.home.recap !== false, soon: C.home.soon !== false, fact: C.home.fact !== false, sale: C.home.sale !== false, deals: C.home.deals !== false },
      spot: { type: C.spot.type === 'countdown' ? 'countdown' : 'note', text: String(C.spot.text || ''), date: String(C.spot.date || '') },
      budgetSkip: C.budgetSkip.slice(), cardFrom: C.cardFrom, scheme: C.scheme,
      welcome: { note: C.welcome.note || '' },
      rent: { on: C.rent.on, amount: C.rent.amount ? centsToStr(C.rent.amount) : '', from: C.rent.from, day: String(C.rent.day), start: C.rent.start },
      error: null
    };
  }
  function comparable(D) { const x = clone(D); delete x.newCat; delete x.error; return JSON.stringify(x); }
  function draftDirty() { return !!S.draft && !S.draftSaved && comparable(S.draft) !== comparable(makeDraft()); }
  function draftToPatch(D) {
    const money = (v, label) => {
      const s = String(v || '').trim();
      if (!s) return { v: null };
      const c = L.parseMoneyInput(s);
      return c == null ? { err: label + ' needs to be a number, like 2000.' } : { v: c };
    };
    const na = String(D.names.a || '').trim().slice(0, 24), nb = String(D.names.b || '').trim().slice(0, 24);
    if (!na || !nb) return { error: 'Both of you need a name.' };
    const budget = money(D.budget, 'The budget'); if (budget.err) return { error: budget.err };
    const target = money(D.goal.target, 'The goal'); if (target.err) return { error: target.err };
    const saved = money(D.goal.saved, 'Saved so far'); if (saved.err) return { error: saved.err };
    let rates = null, ratio = 1;
    if (D.card.earns) {
      rates = {};
      for (const k of ['intl', 'everyday', 'other', 'after']) {
        const v = parseFloat(D.card.rates[k]);
        if (!(v >= 0 && v <= 20)) return { error: 'Earn rates need to be numbers, like 0.8.' };
        rates[k] = v;
      }
      if (D.card.earns === 'altitude') { ratio = parseFloat(D.card.ratio); if (!(ratio > 0 && ratio <= 20)) return { error: 'Altitude per Velocity Point needs to be a number, like 3.' }; }
    }
    const balStr = String(D.card.pointsBal || '').replace(/[\s,]/g, ''), pointsBal = balStr ? Number(balStr) : null;
    if (balStr && !(Number.isInteger(pointsBal) && pointsBal >= 0)) return { error: 'The points balance needs to be a whole number, like 50000.' };
    const pointsAsOf = /^\d{4}-\d{2}-\d{2}$/.test(D.card.pointsAsOf || '') ? D.card.pointsAsOf : '';
    if (pointsBal != null && !pointsAsOf) return { error: 'Add the date the points balance is from.' };
    const rentAmt = money(D.rent.amount, 'Rent'); if (rentAmt.err) return { error: rentAmt.err };
    const rentStart = /^\d{4}-\d{2}-\d{2}$/.test(D.rent.start || '') ? D.rent.start : '';
    if (D.rent.on && !rentAmt.v) return { error: 'Add how much the rent is, like 300.' };
    if (D.rent.on && !rentStart) return { error: 'Pick the date rent starts from.' };
    const spotDate = D.spot.type === 'countdown' ? String(D.spot.date || '') : '';
    if (D.spot.type === 'countdown' && D.spot.text.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(spotDate)) return { error: 'Pick a date for the countdown.' };
    return {
      patch: {
        names: { a: na, b: nb }, colours: { a: D.colours.a, b: D.colours.b },
        budget: budget.v, resetDay: L.clamp(parseInt(D.resetDay, 10) || 1, 1, 28), splitA: L.clamp(D.splitA, 0, 100),
        categories: D.categories.slice(0, 30),
        goal: { name: String(D.goal.name || '').trim().slice(0, 40), target: target.v, saved: saved.v || 0 },
        card: { name: String(D.card.name || '').trim().slice(0, 40), holder: D.card.holder === 'a' ? 'a' : 'b', program: D.card.earns ? L.CARD_PRESETS[D.card.earns].program : cfg().card.program, earns: D.card.earns || null, rates, ratio, rate: null, pointsBal, pointsAsOf },
        home: { week: !!D.home.week, goal: !!D.home.goal, spot: !!D.home.spot, recap: !!D.home.recap, soon: !!D.home.soon, fact: !!D.home.fact, sale: !!D.home.sale, deals: !!D.home.deals },
        spot: { type: D.spot.type, text: String(D.spot.text || '').trim().slice(0, 60), date: spotDate },
        budgetSkip: D.budgetSkip.filter((c) => typeof c === 'string').slice(0, 30),
        scheme: SCHEMES[D.scheme] ? D.scheme : 'warm',
        cardFrom: /^\d{4}-\d{2}-\d{2}$/.test(D.cardFrom || '') ? D.cardFrom : '',
        cardFromWhy: D.cardFrom === cfg().cardFrom ? cfg().cardFromWhy : '',
        welcome: { note: welcomeNoteToSave(D) },
        rent: { on: !!D.rent.on, amount: rentAmt.v, from: D.rent.from === 'a' ? 'a' : 'b', day: L.clamp(parseInt(D.rent.day, 10) || 0, 0, 6), start: rentStart }
      }
    };
  }
  const rentLine = (R, nA, nB) => (R.from === 'a' ? nA : nB) + ' pays ' + (R.from === 'a' ? nB : nA) + ' ' + L.fmtRound(R.amount) + ' rent every ' + L.DAYS_FULL[R.day] + ', from ' + dateY(R.start);
  function rentCard(D, ro) {
    const R = D.rent, from = R.from === 'a' ? 'a' : 'b';
    let h = '<section class="card" id="crent"><div class="card-head"><h2>Rent</h2></div>' +
      '<label class="switch-row"><span>Add rent every week</span><input type="checkbox" class="switch" role="switch" id="drenton" data-bind="draft.rent.on" data-change="rerender"' + (R.on ? ' checked' : '') + ro + '></label>';
    if (R.on) {
      h += '<fieldset style="margin-top:8px"><legend>Who pays it?</legend><div class="seg">' + segBtn('crentfrom', 'b', from === 'b', nm('b') + ' pays ' + nm('a'), 'b') + segBtn('crentfrom', 'a', from === 'a', nm('a') + ' pays ' + nm('b'), 'a') + '</div></fieldset>' +
        '<div class="row2"><label class="field"><span>Each week</span><div class="money"><input class="input" id="drentamt" inputmode="decimal" data-bind="draft.rent.amount" data-change="dirty" value="' + esc(R.amount) + '"' + ro + '></div></label>' +
        '<label class="field"><span>Added every</span><select class="input" id="drentday" data-bind="draft.rent.day" data-change="dirty"' + ro + '>' + L.DAYS_FULL.map((n, i) => '<option value="' + i + '"' + (String(i) === String(R.day) ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label></div>' +
        '<label class="field"><span>Starting from</span><input class="input" id="drentstart" type="date" data-bind="draft.rent.start" data-change="dirty" value="' + esc(R.start) + '"' + ro + '></label>';
    }
    return h + '<p class="hint">Rent goes on what ' + esc(nm(from)) + ' owes, not on shared spending or the budget. Each week shows in the calendar, where you can remove one.</p></section>';
  }
  function colourPicker(act, p, current) {
    const ppl = pal().people;
    return '<div class="swatches">' + COLOUR_KEYS.map((k) => '<button type="button" class="swatch" style="background:' + ppl[k].main + '" data-act="' + act + '" data-arg="' + p + '|' + k + '" aria-pressed="' + (current === k) + '" aria-label="' + esc(ppl[k].label) + '"></button>').join('') + '</div>';
  }
  function viewCustom() {
    if (!S.draft) S.draft = makeDraft();
    const D = S.draft, ro = S.readOnly ? ' disabled' : '';
    const sw = (key, label) => '<label class="switch-row"><span>' + label + '</span><input type="checkbox" class="switch" role="switch" data-bind="draft.home.' + key + '" data-change="dirty"' + (D.home[key] ? ' checked' : '') + ro + '></label>';
    const days = []; for (let i = 1; i <= 28; i++) days.push('<option value="' + i + '"' + (String(i) === String(D.resetDay) ? ' selected' : '') + '>' + ordinal(i) + ' of the month</option>');
    const unused = SUGGESTED.filter((c) => D.categories.indexOf(c) < 0);
    let out = '<header class="top"><div><button class="back-link" data-act="go" data-arg="settings">' + icon('left') + 'Settings</button><p class="eyebrow">Make it yours</p><h1 class="title">Customise</h1></div></header>';
    out += '<section class="card"><div class="card-head"><h2>Colour scheme</h2></div>' + schemePicker('cscheme', D.scheme) +
      '<p class="hint">Tap one to preview the whole app, then save to keep it for both of you.</p></section>';
    out += '<section class="card"><div class="card-head"><h2>Money</h2></div>' +
      '<label class="field"><span>Monthly budget for shared spends</span><div class="money"><input class="input" id="dbudget" inputmode="decimal" placeholder="0" data-bind="draft.budget" data-change="dirty" value="' + esc(D.budget) + '"' + ro + '></div><p class="hint">Leave empty to just track what you spend.</p></label>' +
      '<label class="field"><span>Budget resets on the</span><select class="input" id="dreset" data-bind="draft.resetDay" data-change="dirty"' + ro + '>' + days.join('') + '</select></label>' +
      '<fieldset style="margin:0 0 18px"><legend>Usual split</legend>' + stepper('cstep', D.splitA) + '</fieldset>' +
      '<fieldset style="margin:0"><legend>Leave out of the budget</legend><div class="chips">' + D.categories.concat(D.categories.indexOf('Other') >= 0 ? [] : ['Other']).map((c) => '<button type="button" class="chip" data-act="cskip" data-arg="' + esc(c) + '" aria-pressed="' + (D.budgetSkip.indexOf(c) >= 0) + '"' + ro + '>' + esc(c) + '</button>').join('') + '</div>' +
      '<p class="hint">These still count in the balance and the recap, just not against the monthly budget. Handy for bills.</p></fieldset></section>';
    out += rentCard(D, ro);
    out += '<section class="card"><div class="card-head"><h2>Categories</h2></div>' +
      (D.categories.length ? '<div class="chips" style="margin-bottom:12px">' + D.categories.map((c) => '<button type="button" class="chip" data-act="cdelcat" data-arg="' + esc(c) + '" aria-label="Remove ' + esc(c) + '"' + ro + '>' + esc(c) + icon('close') + '</button>').join('') + '</div>' : '<p class="muted" style="margin-bottom:12px">None yet. Spends go under Other until you add some.</p>') +
      '<div class="add-row" style="grid-template-columns:1fr auto"><label><span class="sr">New category</span><input class="input" id="dnewcat" maxlength="24" placeholder="Add your own" data-bind="draft.newCat" data-enter="caddcat" value="' + esc(D.newCat) + '"' + ro + '></label>' +
      '<button class="btn btn-secondary" data-act="caddcat"' + ro + '>Add</button></div>' +
      (unused.length ? '<p class="k" style="margin:4px 0 8px">Ideas</p><div class="chips">' + unused.map((c) => '<button type="button" class="chip add" data-act="caddsug" data-arg="' + esc(c) + '"' + ro + '>' + icon('plus') + esc(c) + '</button>').join('') + '</div>' : '') + '</section>';
    out += '<section class="card"><div class="card-head"><h2>Shared goal</h2></div>' +
      '<label class="field"><span>What are you saving for?</span><input class="input" id="dgname" maxlength="40" placeholder="A trip, a couch, a rainy day" data-bind="draft.goal.name" data-change="dirty" value="' + esc(D.goal.name) + '"' + ro + '></label>' +
      '<div class="row2"><label class="field"><span>Target</span><div class="money"><input class="input" id="dgtarget" inputmode="decimal" placeholder="0" data-bind="draft.goal.target" data-change="dirty" value="' + esc(D.goal.target) + '"' + ro + '></div></label>' +
      '<label class="field"><span>Saved so far</span><div class="money"><input class="input" id="dgsaved" inputmode="decimal" placeholder="0" data-bind="draft.goal.saved" data-change="dirty" value="' + esc(D.goal.saved) + '"' + ro + '></div></label></div></section>';
    out += '<section class="card"><div class="card-head"><h2>Card and points</h2></div>' +
      '<label class="field"><span>Card name</span><input class="input" id="dcname" maxlength="40" data-bind="draft.card.name" data-change="dirty" value="' + esc(D.card.name) + '"' + ro + '></label>' +
      '<fieldset><legend>Whose card is it?</legend><div class="seg">' + segBtn('cholder', 'a', D.card.holder === 'a', poss(nm('a')), 'a') + segBtn('cholder', 'b', D.card.holder === 'b', poss(nm('b')), 'b') + '</div></fieldset>' +
      '<fieldset style="margin-bottom:12px"><legend>Which points does it earn?</legend>' + earnsSeg('cearns', D.card.earns) + '</fieldset>' +
      (D.card.earns
        ? '<div class="rate-grid">' + [['intl', 'Overseas'], ['everyday', 'Supermarkets, petrol, utilities'], ['other', 'Everything else'], ['after', 'After $10,000']].map((f) =>
            '<label class="field"><span>' + f[1] + '</span><input class="input" id="dr' + f[0] + '" inputmode="decimal" data-bind="draft.card.rates.' + f[0] + '" data-change="dirty" value="' + esc(D.card.rates[f[0]]) + '"' + ro + '></label>').join('') +
          (D.card.earns === 'altitude' ? '<label class="field"><span>Altitude per Velocity Point</span><input class="input" id="drratio" inputmode="decimal" data-bind="draft.card.ratio" data-change="dirty" value="' + esc(D.card.ratio) + '"' + ro + '></label>' : '') + '</div>' +
          '<p class="hint" style="margin:-6px 0 16px">' + L.CARD_PRESETS[D.card.earns].unit + ' per $1, filled in with Westpac\'s published rates. ' + (S.readOnly ? '' : '<button class="link sm" data-act="cpreset">Use Westpac\'s rates</button>') + '</p>'
        : '<p class="hint" style="margin:-4px 0 16px">' + EARNS_HINT + ' Pick one to see a points estimate.</p>') +
      '<div class="row2"><label class="field"><span>Points balance</span><input class="input" id="dpbal" inputmode="numeric" placeholder="e.g. 50,000" data-bind="draft.card.pointsBal" data-change="dirty" value="' + esc(D.card.pointsBal) + '"' + ro + '></label>' +
      '<label class="field"><span>As of</span><input class="input" id="dpasof" type="date" data-bind="draft.card.pointsAsOf" data-change="dirty" value="' + esc(D.card.pointsAsOf) + '"' + ro + '></label></div>' +
      '<p class="hint" style="margin:-6px 0 16px">From a statement or the bank app. Insights adds an estimate for card spends after that date.</p>' +
      '<label class="field" style="margin:0"><span>Bring in card spends from</span><input class="input" id="dcfrom" type="date" data-bind="draft.cardFrom" data-change="dirty" value="' + esc(D.cardFrom) + '"' + ro + '><p class="hint">Westpac imports leave out card spends before this date. Leave it empty to bring in everything.</p></label></section>';
    out += '<section class="card"><div class="card-head"><h2>Home screen</h2></div>' + sw('week', 'Last 7 days') + sw('goal', 'Our goal') + sw('spot', 'Your spot') + sw('fact', 'Fun fact') + sw('soon', 'Coming up') + sw('sale', 'Next sale day') + sw('deals', 'Specials on our watch list') + sw('recap', 'Insights link') + '</section>';
    out += '<section class="card"><div class="card-head"><h2>Your spot</h2></div><p class="muted" style="margin-bottom:12px">A space on Home for whatever you like: a note to each other or a countdown.</p>' +
      '<fieldset><legend class="sr">Type</legend><div class="seg">' + segBtn('cspot', 'note', D.spot.type === 'note', 'Note') + segBtn('cspot', 'countdown', D.spot.type === 'countdown', 'Countdown') + '</div></fieldset>' +
      '<label class="field"><span>' + (D.spot.type === 'countdown' ? 'Counting down to' : 'Note') + '</span><input class="input" id="dstext" maxlength="60" placeholder="' + (D.spot.type === 'countdown' ? 'Our holiday' : 'No takeaway this week') + '" data-bind="draft.spot.text" data-change="dirty" value="' + esc(D.spot.text) + '"' + ro + '></label>' +
      (D.spot.type === 'countdown' ? '<label class="field"><span>Date</span><input class="input" id="dsdate" type="date" data-bind="draft.spot.date" data-change="dirty" value="' + esc(D.spot.date) + '"' + ro + '></label>' : '') + '</section>';
    out += welcomeCard(D, ro);
    if (!S.readOnly) {
      out += '<div class="savebar above-nav">' + (D.error ? '<p class="err-text" role="alert">' + esc(D.error) + '</p>' : '') +
        '<button class="btn btn-primary btn-block" data-act="savecustom">Save changes</button></div>';
    }
    return out;
  }
  function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function saveCustom(then) {
    const r = draftToPatch(S.draft);
    if (r.error) { S.draft.error = r.error; render(); return false; }
    S.draft.error = null; S.draftSaved = true;
    upsert('hh/settings', r.patch, defaults()).then((ok) => { if (ok) toast('Saved'); });
    if (then) then(); else render();
    return true;
  }

  /* ---------- setup ---------- */
  function newSetup() {
    return {
      step: 1, names: PRESET && PRESET.names ? clone(PRESET.names) : { a: '', b: '' }, colours: { a: 'cobalt', b: 'coral' }, me: null, scheme: SCHEMES[lsGet('hh.scheme')] ? lsGet('hh.scheme') : 'warm',
      budget: '', resetDay: '1', splitA: 50, categories: [], newCat: '',
      goalName: '', goalTarget: '', cardName: PRESET && PRESET.card ? PRESET.card.name : '', holder: PRESET && PRESET.card ? PRESET.card.holder : 'b',
      earns: PRESET && PRESET.card ? PRESET.card.earns : null, rentOn: !!(PRESET && PRESET.rent), error: null
    };
  }
  function viewSetup() {
    if (!S.setup) S.setup = newSetup();
    const U = S.setup;
    const steps = '<div class="steps" aria-hidden="true">' + [1, 2, 3].map((i) => '<span' + (i <= U.step ? ' class="on"' : '') + '></span>').join('') + '</div><p class="eyebrow">Step ' + U.step + ' of 3</p>';
    const err = U.error ? '<p class="err-text" role="alert" style="margin-bottom:10px">' + esc(U.error) + '</p>' : '';
    const nA = U.names.a.trim() || 'Person one', nB = U.names.b.trim() || 'Person two';
    let body;
    if (U.step === 1) {
      body = '<h1>Hello, you two</h1><p class="lead">Set this up once. When ' + esc(nB) + ' opens it too, you\'ll both see the same spends.</p>' +
        '<fieldset><legend>Pick a colour scheme</legend>' + schemePicker('sscheme', U.scheme) + '<p class="hint">You can change it any time in Customise.</p></fieldset>' +
        ['a', 'b'].map((p) => '<div class="person"><label class="field"><span>' + (p === 'a' ? 'First name' : 'Second name') + '</span><input class="input" id="sn' + p + '" maxlength="24" autocomplete="off" data-bind="setup.names.' + p + '" data-input="snames" value="' + esc(U.names[p]) + '"></label>' +
          '<fieldset><legend>Colour</legend>' + colourPicker('scolour', p, U.colours[p]) + '</fieldset></div>').join('') +
        '<fieldset><legend>Which one are you?</legend><div class="seg">' + segBtnSetup('a', nA) + segBtnSetup('b', nB) + '</div><p class="hint">So this phone shows "you owe" the right way round.</p></fieldset>' +
        err + '<div class="setup-actions"><button class="btn btn-primary" data-act="snext">Next</button></div>';
    } else if (U.step === 2) {
      const days = []; for (let i = 1; i <= 28; i++) days.push('<option value="' + i + '"' + (String(i) === String(U.resetDay) ? ' selected' : '') + '>' + ordinal(i) + ' of the month</option>');
      body = '<h1>Your monthly money</h1><p class="lead">A budget for shared spends shows how much is left each day. You can skip it and add it later.</p>' +
        '<label class="field"><span>Monthly budget for shared spends</span><div class="money"><input class="input" id="sbudget" inputmode="decimal" placeholder="0" autocomplete="off" data-bind="setup.budget" value="' + esc(U.budget) + '"></div><p class="hint">Leave empty to just track what you spend.</p></label>' +
        '<label class="field"><span>Pick a reset day</span><select class="input" id="sreset" data-bind="setup.resetDay">' + days.join('') + '</select><p class="hint">Payday works well. The 1st keeps it to calendar months.</p></label>' +
        '<fieldset><legend>How do you split shared spends?</legend>' + stepperSetup(U.splitA, nA, nB) + '</fieldset>' +
        (PRESET && PRESET.rent ? '<fieldset><legend>Rent</legend><label class="switch-row"><span>' + esc(rentLine(defaults().rent, nA, nB)) + '</span><input type="checkbox" class="switch" role="switch" id="srent" data-bind="setup.rentOn"' + (U.rentOn ? ' checked' : '') + '></label>' +
          '<p class="hint">It goes on what ' + esc(defaults().rent.from === 'a' ? nA : nB) + ' owes, not on your shared spending. Change it any time in Customise.</p></fieldset>' : '') +
        err + '<div class="setup-actions"><button class="btn btn-secondary" data-act="sback">Back</button><button class="btn btn-primary" data-act="snext">Next</button></div>';
    } else {
      const swCats = S.impParsed ? swCategories(S.impParsed.groups) : [];
      const unused = swCats.concat(SUGGESTED.filter((c) => swCats.indexOf(c) < 0)).filter((c) => U.categories.indexOf(c) < 0);
      body = '<h1>Make it yours</h1><p class="lead">Pick categories that fit how you two spend.' + (swCats.length ? ' The ones you used in Splitwise come first.' : '') + ' All of this can change later in Customise.</p>' +
        '<fieldset><legend>Your categories</legend>' +
        (U.categories.length ? '<div class="chips" style="margin-bottom:10px">' + U.categories.map((c) => '<button type="button" class="chip" aria-pressed="true" data-act="scat" data-arg="' + esc(c) + '" aria-label="Remove ' + esc(c) + '">' + esc(c) + icon('close') + '</button>').join('') + '</div>' : '') +
        '<div class="chips" style="margin-bottom:10px">' + unused.map((c) => '<button type="button" class="chip add" data-act="scat" data-arg="' + esc(c) + '">' + icon('plus') + esc(c) + '</button>').join('') + '</div>' +
        '<div class="add-row" style="grid-template-columns:1fr auto"><label><span class="sr">Your own category</span><input class="input" id="snewcat" maxlength="24" placeholder="Add your own" data-bind="setup.newCat" data-enter="saddcat" value="' + esc(U.newCat) + '"></label><button class="btn btn-secondary" data-act="saddcat">Add</button></div></fieldset>' +
        '<fieldset><legend>A shared goal (optional)</legend><div class="row2"><label><span class="sr">Goal name</span><input class="input" id="sgname" maxlength="40" placeholder="What for?" data-bind="setup.goalName" value="' + esc(U.goalName) + '"></label>' +
        '<label><span class="sr">Goal target</span><div class="money"><input class="input" id="sgtarget" inputmode="decimal" placeholder="Target" data-bind="setup.goalTarget" value="' + esc(U.goalTarget) + '"></div></label></div></fieldset>' +
        '<fieldset><legend>Our shared card</legend><p class="muted" style="margin:-2px 0 10px">' + esc(poss(U.holder === 'a' ? nA : nB)) + ' ' + esc(U.cardName || 'card') + (U.earns ? ' · earns ' + esc(L.CARD_PRESETS[U.earns].unit) : '') + '</p>' +
        '<div class="seg" style="margin-bottom:12px">' + ['a', 'b'].map((p) => '<button type="button" data-act="sholder" data-arg="' + p + '" aria-pressed="' + (U.holder === p) + '">' + esc(poss(p === 'a' ? nA : nB)) + ' card</button>').join('') + '</div>' +
        '<p class="lbl" style="margin-top:4px">Which points does it earn?</p>' + earnsSeg('searns', U.earns) +
        '<p class="hint" style="margin-bottom:18px">' + (U.earns ? esc(ratesLine(U.earns)) + ' Westpac\'s published rates.' : esc(EARNS_HINT)) + '</p></fieldset>' +
        err + '<div class="setup-actions"><button class="btn btn-secondary" data-act="sback">Back</button><button class="btn btn-primary" data-act="sfinish">Start using it</button></div>';
    }
    return '<div class="setup">' + steps + body + '</div>';
  }
  function segBtnSetup(p, label) {
    const U = S.setup, ppl = pal().people, c = ppl[U.colours[p]] || ppl.cobalt, on = U.me === p;
    return '<button type="button" data-act="sme" data-arg="' + p + '" aria-pressed="' + on + '"' + (on ? ' style="background:' + c.main + ';color:' + c.on + '"' : '') + '>' + esc(label) + '</button>';
  }
  function stepperSetup(a, nA, nB) {
    return '<div class="stepper"><button type="button" class="icon-btn" data-act="sstep" data-arg="-5" aria-label="Less for ' + esc(nA) + '"' + (a <= 0 ? ' disabled' : '') + '>' + icon('left') + '</button>' +
      '<output>' + esc(nA) + ' ' + a + '% · ' + esc(nB) + ' ' + (100 - a) + '%</output>' +
      '<button type="button" class="icon-btn" data-act="sstep" data-arg="5" aria-label="More for ' + esc(nA) + '"' + (a >= 100 ? ' disabled' : '') + '>' + icon('right') + '</button></div>';
  }
  function setupNext() {
    const U = S.setup;
    U.error = null;
    if (U.step === 1) {
      if (!U.names.a.trim() || !U.names.b.trim()) U.error = 'Add both names first.';
      else if (U.me !== 'a' && U.me !== 'b') U.error = 'Pick which one of you is using this phone.';
    } else if (U.step === 2) {
      if (String(U.budget).trim() && L.parseMoneyInput(U.budget) == null) U.error = 'The budget needs to be a number, like 2000.';
    }
    if (!U.error) U.step = Math.min(3, U.step + 1);
    render(); window.scrollTo(0, 0);
  }
  function setupFinish() {
    const U = S.setup;
    U.error = null;
    const target = String(U.goalTarget).trim() ? L.parseMoneyInput(U.goalTarget) : null;
    if (String(U.goalTarget).trim() && target == null) U.error = 'The goal target needs to be a number, like 5000.';
    if (U.error) { render(); return; }
    if (S.settings) { claim(U.me); return; }
    const s = defaults();
    s.names = { a: U.names.a.trim().slice(0, 24), b: U.names.b.trim().slice(0, 24) };
    s.colours = { a: U.colours.a, b: U.colours.b };
    s.scheme = SCHEMES[U.scheme] ? U.scheme : 'warm';
    s.budget = String(U.budget).trim() ? L.parseMoneyInput(U.budget) : null;
    s.resetDay = L.clamp(parseInt(U.resetDay, 10) || 1, 1, 28);
    s.splitA = U.splitA;
    s.categories = U.categories.slice();
    s.goal = { name: U.goalName.trim().slice(0, 40), target, saved: 0 };
    const pr = L.CARD_PRESETS[U.earns];
    s.card = { name: U.cardName.trim(), holder: U.holder, program: pr ? pr.program : '', earns: pr ? U.earns : null, rates: pr ? Object.assign({}, pr.rates) : null, ratio: pr ? pr.ratio : 1, rate: null };
    s.rent.on = !!U.rentOn;
    if (U.me === 'a' || U.me === 'b') { s.editor = U.me; if (RELEASES.length) s.news[U.me] = RELEASES[0].id; }
    if (S.myId) s.members[U.me] = S.myId;
    lsSet('hh.me', U.me);
    S.me = U.me; S.settings = s; S.view = 'home';
    ensureRent();
    enqueue('hh/settings', (ref) => doSet(ref, s)).then((ok) => { if (ok) { knownDocs['hh/settings'] = true; toast("You're set. Add your first spend with the plus."); } });
    S.setup = null; render(); window.scrollTo(0, 0);
  }

  function viewWho() {
    const C = cfg(), m = C.members;
    return '<div class="setup"><h1>Who\'s this?</h1><p class="lead">Pick your name so the app knows whose phone this is.</p>' +
      ['a', 'b'].map((p) => '<button class="who-btn" data-act="claim" data-arg="' + p + '">' + av(p) + '<span>' + esc(nm(p)) + (S.myId && m[p] && m[p] !== S.myId ? '<span class="hint" style="display:block;font:600 14px var(--body)">Already picked on another account</span>' : '') + '</span></button>').join('') + '</div>';
  }

  /* ---------- welcome ---------- */
  /* The first time the second person opens the app, they get a welcome instead of the plain "Who's this?": a quick
     tour of what they can do, with a note from whoever set the app up at the end, if they wrote one. */
  function welcomeFor() {
    if (!S.settings || S.me || !S.myId || S.whoPick) return null;
    const m = cfg().members, free = ['a', 'b'].filter((p) => !m[p]);
    return free.length === 1 ? free[0] : null;
  }
  /* Written in the voice of whoever set the app up; they can rewrite it in Customise. */
  function defaultNote(p) {
    const C = cfg(), pr = C.card.earns && C.card.holder === p ? L.CARD_PRESETS[C.card.earns] : null;
    return 'I made us our own little place for the shared stuff. No more Splitwise, no more chasing receipts. Add things whenever you like, I\'ll do the same, and it\'ll keep us square.' +
      (pr ? '\n\nThanks for putting so much of it on your card. Now we can watch the ' + pr.unit + ' add up too.' : '') +
      '\n\nHere\'s to more date nights and less admin.\n\nLove, ' + nm(other(p));
  }
  function welcomeNote(p, preview) {
    const raw = preview && S.draft && S.draft.welcome ? S.draft.welcome.note : cfg().welcome.note;
    return String(raw || '').trim();
  }
  /* What the second person can do straight away, in the order they'll want it. */
  function welcomeTour(p) {
    const from = nm(other(p));
    return [
      ['camera', 'Add a spend', 'Tap + to capture a receipt, or type one in. Mark anything that\'s just yours.'],
      ['duo', 'Stay square', 'Home shows where you two stand, what\'s left of the month\'s budget and what\'s coming up.'],
      ['tag', 'Grab the specials', 'Deals has what\'s on special at Coles, Woolies, Harris Farm, Umall, Liquorland and Meat Emporium. Tap + to put one on our weekend list.'],
      ['cal', 'Every day, and sale days', 'The Calendar shows each day\'s spends, and the sale days we\'re keen on.'],
      ['bell', 'Pop-ups', 'Turn them on in Settings to hear when ' + from + ' adds a spend, and when something we buy is on special.']
    ];
  }
  /* An untouched default is stored empty, so it keeps up with name and card changes. */
  function welcomeNoteToSave(D) {
    const t = String((D.welcome && D.welcome.note) || '').trim().slice(0, 400);
    return S.me && t === defaultNote(other(S.me)).trim() ? '' : t;
  }
  function viewWelcome(p, preview) {
    const from = other(p), me = colOf(p), n = esc(nm(p));
    if (!S.welcomeT) S.welcomeT = Date.now();
    const anim = Date.now() - S.welcomeT < 1600 ? ' wl-anim' : '';
    const mark = markSvg();
    const note = welcomeNote(p, preview);
    return '<div class="welcome' + anim + '" style="--me:' + me.main + ';--me-soft:' + me.soft + '">' +
      (preview ? '<div class="wl-preview"><span>Preview of what ' + n + ' sees</span><button class="btn btn-secondary btn-small" data-act="wpclose">Close</button></div>' : '') +
      '<div class="wl-mark">' + mark + '</div><div class="wl-rest">' +
      '<h1>Welcome home, ' + n + '</h1><p class="lead wl-lead">' + av(from) + '<span>' + esc(nm(from)) + ' made Two of Us just for the two of you. Here\'s what you can do.</span></p>' +
      '<ol class="wl-tour">' + welcomeTour(p).map((it) => '<li><span class="wl-ic">' + icon(it[0]) + '</span><span><strong>' + esc(it[1]) + '</strong><span class="wl-t">' + esc(it[2]) + '</span></span></li>').join('') + '</ol>' +
      (note ? '<figure class="wl-note"><figcaption>' + av(from, true) + '<span>From ' + esc(nm(from)) + '</span></figcaption><blockquote>' + note.split(/\n\s*\n/).map((t) => '<p>' + esc(t.trim()) + '</p>').join('') + '</blockquote></figure>' : '') +
      '<button class="btn btn-primary btn-block" data-act="' + (preview ? 'wpclose' : 'welcomein') + '">Come on in</button>' +
      '<button class="link wl-not" data-act="' + (preview ? 'wpclose' : 'wnotme') + '">Not ' + n + '? Pick your name</button>' +
      '</div></div>';
  }
  function welcomeIn() {
    const p = welcomeFor();
    if (!p) { render(); return; }
    S.me = p; S.view = 'home'; lsSet('hh.me', p);
    if (!S.readOnly) {
      const patch = { members: {}, welcome: { to: p, seen: today() } };
      patch.members[p] = S.myId;
      upsert('hh/settings', patch, defaults());
    }
    ensureRent();
    /* The tour covered what's new, so the latest update note is marked as read rather than shown on top. */
    const shown = publishedNote();
    S.newsShown = true;
    if (shown && !S.readOnly) markNewsSeen(shown.id);
    render(); window.scrollTo(0, 0);
    toast("You're in. Add a spend any time with the plus.");
  }
  function welcomeCard(D, ro) {
    if (!S.me) return '';
    const C = cfg(), p = other(S.me), n = esc(nm(p));
    const head = '<section class="card" id="cwelcome"><div class="card-head"><h2>' + n + '\'s welcome</h2></div>';
    if (C.members[p]) {
      if (C.welcome.to !== p || !C.welcome.seen) return '';
      return head + '<p class="muted" style="margin-bottom:12px">' + n + ' came in on ' + esc(L.fmtDayLong(C.welcome.seen)) + '.</p>' +
        '<button class="btn btn-secondary btn-block" data-act="wpreview">See the welcome page</button></section>';
    }
    return head + '<p class="muted" style="margin-bottom:12px">The first time ' + n + ' opens the app, a quick tour shows what ' + n + ' can do. Add a note and it goes at the end.</p>' +
      '<label class="field"><span>Your note (optional)</span><textarea class="input wl-text" id="dwnote" rows="6" maxlength="400" placeholder="A few words from you, if you like" data-bind="draft.welcome.note" data-change="dirty"' + ro + '>' + esc(D.welcome.note) + '</textarea></label>' +
      '<button class="btn btn-secondary btn-block" data-act="wpreview">Preview what ' + n + ' sees</button></section>';
  }

  /* The app's mark: the two circles from the icon, in your two colours. */
  function markSvg() {
    const v = pal().vars;
    const ring = (cls, cx, fill) => '<circle class="' + cls + '" cx="' + cx + '" cy="486" r="236" style="fill:' + fill + ';stroke:' + v.ink + ';stroke-width:28"/>';
    return '<svg viewBox="130 210 764 600" aria-hidden="true" focusable="false">' +
      '<circle class="wl-l" cx="404" cy="516" r="250" style="fill:' + v.ink + '"/><circle class="wl-r" cx="620" cy="516" r="250" style="fill:' + v.ink + '"/>' +
      ring('wl-l', 404, colOf('a').main) + ring('wl-r', 620, colOf('b').main) +
      '<path class="wl-lens" d="M512 276.16A236 236 0 0 1 512 695.84A236 236 0 0 1 512 276.16Z" style="fill:' + v.hi + '"/>' +
      ring('wl-l', 404, 'none') + ring('wl-r', 620, 'none') + '</svg>';
  }

  /* ---------- sign-in (PWA only) ---------- */
  function authGate() {
    if (S.fbMissing) return viewNoConnection();
    if (!S.authReady) return viewLoading();
    if (!S.authUser || !S.authUser.emailVerified) return viewSignIn();
    if (S.denied) return viewDenied();
    return '';
  }
  const signinHead = (title, lead) => '<div class="setup signin"><div class="si-mark">' + markSvg() + '</div><h1>' + title + '</h1><p class="lead">' + lead + '</p>';
  function viewSignIn() {
    const A = S.signin || (S.signin = { mode: 'in', email: '', password: '', error: null, note: null, busy: false });
    const msg = (A.error ? '<p class="err-text" role="alert" style="margin-bottom:12px">' + esc(A.error) + '</p>' : '') + (A.note ? '<p class="hint" role="status" style="margin:0 0 12px">' + esc(A.note) + '</p>' : '');
    const u = S.authUser;
    if (u && !u.emailVerified) {
      return signinHead('Check your email', 'We sent a link to <strong>' + esc(u.email) + '</strong>. Tap it to confirm it\'s you, then come back here.') + msg +
        '<button class="btn btn-primary btn-block" data-act="auverified"' + (A.busy ? ' disabled' : '') + '>I\'ve confirmed it</button>' +
        '<p class="si-links"><button class="link sm" data-act="auresend">Send the link again</button><button class="link sm" data-act="auout">Use a different email</button></p></div>';
    }
    const create = A.mode === 'create', act = create ? 'aucreate' : 'auin';
    return signinHead(create ? 'Create your login' : 'Our household', create ? 'Use the email you two set up for this app. You\'ll get a link to confirm it.' : 'Sign in to see your shared spends.') +
      '<label class="field"><span>Email</span><input class="input" id="auemail" type="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" data-bind="signin.email" data-enter="' + act + '" value="' + esc(A.email) + '"></label>' +
      '<label class="field"><span>Password</span><input class="input" id="aupw" type="password" autocomplete="' + (create ? 'new-password' : 'current-password') + '" data-bind="signin.password" data-enter="' + act + '"></label>' +
      (create ? '<p class="hint" style="margin:-10px 0 16px">At least 8 characters.</p>' : '') + msg +
      '<button class="btn btn-primary btn-block" data-act="' + act + '"' + (A.busy ? ' disabled' : '') + '>' + (create ? 'Create login' : 'Sign in') + '</button>' +
      '<p class="si-links">' + (create ? '<button class="link sm" data-act="aumode" data-arg="in">I already have a login</button>'
        : '<button class="link sm" data-act="aumode" data-arg="create">First time here? Create your login</button><button class="link sm" data-act="aureset">Forgot your password?</button>') + '</p></div>';
  }
  function viewDenied() {
    return signinHead('This login can\'t open it', esc((S.authUser && S.authUser.email) || 'This email') + ' isn\'t one of the two emails this app allows. Sign out and use the other one.') +
      '<button class="btn btn-secondary btn-block" data-act="auout">Sign out</button></div>';
  }
  function viewNoConnection() {
    return signinHead('Can\'t connect', 'The app couldn\'t load its sign-in. Check you\'re online, then try again.') +
      '<button class="btn btn-primary btn-block" data-act="reload">Try again</button></div>';
  }
  function authMsg(e) {
    const c = String((e && e.code) || '');
    if (c === 'auth/invalid-email') return 'That email doesn\'t look right.';
    if (/^auth\/(wrong-password|user-not-found|invalid-credential|invalid-login-credentials)$/.test(c)) return 'That email and password don\'t match.';
    if (c === 'auth/email-already-in-use') return 'There\'s already a login for that email. Sign in instead.';
    if (c === 'auth/weak-password') return 'Use at least 8 characters for the password.';
    if (c === 'auth/too-many-requests') return 'Too many tries. Wait a few minutes, then try again.';
    if (c === 'auth/network-request-failed') return 'Can\'t reach the internet. Check your connection and try again.';
    return 'That didn\'t work. Try again.';
  }
  function authDo(kind) {
    const A = S.signin, em = String(A.email || '').trim(), pw = String(A.password || '');
    A.error = null; A.note = null;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) A.error = 'That email doesn\'t look right.';
    else if (!pw) A.error = 'Type your password.';
    else if (kind === 'create' && pw.length < 8) A.error = 'Use at least 8 characters for the password.';
    if (A.error) { render(); return; }
    A.busy = true; render();
    const p = kind === 'create'
      ? S.auth.createUserWithEmailAndPassword(em, pw).then((cred) => cred.user.sendEmailVerification())
      : S.auth.signInWithEmailAndPassword(em, pw);
    p.then(() => { A.busy = false; A.password = ''; render(); }, (e) => { A.busy = false; A.password = ''; A.error = authMsg(e); render(); });
  }
  function authCheckVerified() {
    const A = S.signin || (S.signin = { mode: 'in', email: '', password: '', error: null, note: null, busy: false }), u = S.auth && S.auth.currentUser;
    if (!u) return;
    A.busy = true; A.error = null; render();
    u.reload().then(() => {
      const cur = S.auth.currentUser;
      if (cur && cur.emailVerified) return cur.getIdToken(true).then(() => location.reload());
      A.busy = false; A.error = 'Not confirmed yet. Tap the link in the email first.'; render();
    }, (e) => { A.busy = false; A.error = authMsg(e); render(); });
  }

  /* ---------- dialogs ---------- */
  function openDialog(d) { S.dialog = d; render(); }
  function closeDialog() {
    if (S.dialog && S.dialog.type === 'news' && !S.dialog.preview) markNewsSeen(S.dialog.id);
    S.dialog = S.dialog && S.dialog.back ? { type: S.dialog.back } : null;
    render();
  }
  function markNewsSeen(id) {
    if (!S.me || S.readOnly || !id || isEditor()) return;
    const C = cfg();
    if (C.news[S.me] === id) return;
    upsert('hh/settings', { news: Object.assign({}, C.news, { [S.me]: id }) }, defaults());
  }
  function dialogHtml() {
    const d = S.dialog;
    if (!d) return '';
    let body = '';
    const actions = (cancel, okAct, okLabel, danger) => '<div class="dialog-actions"><button class="btn btn-secondary" data-act="dlgclose">' + cancel + '</button><button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-act="' + okAct + '">' + okLabel + '</button></div>';
    if (d.type === 'settle') {
      body = '<h2 id="dlgT">Settle up</h2><p>' + (d.from === S.me ? 'You pay ' + esc(nm(d.to)) : esc(nm(d.from)) + ' pays you') + '. Record it here once the money has moved.</p>' +
        '<label class="field"><span>Amount</span><div class="money"><input class="input" id="dlgAmt" inputmode="decimal" data-bind="dialog.amount" data-enter="dlgsettle" value="' + esc(d.amount) + '"></div></label>' +
        (d.error ? '<p class="err-text" role="alert">' + esc(d.error) + '</p>' : '') + actions('Not now', 'dlgsettle', 'Record payment');
    } else if (d.type === 'delete') {
      const r = S.byId[d.id], e = r && r.e;
      if (!e) { S.dialog = null; return ''; }
      const what = e.kind === 'settlement' ? 'payment' : e.kind === 'rent' ? 'rent' : 'spend';
      const desc = e.kind === 'settlement' ? nm(payerOf(e)) + ' paid ' + nm(other(payerOf(e))) : e.kind === 'rent' ? 'Rent from ' + nm(payerOf(e)) + ' to ' + nm(other(payerOf(e))) : e.title || 'Spend';
      body = '<h2 id="dlgT">' + (e.kind === 'rent' ? 'Remove this rent?' : 'Delete this ' + what + '?') + '</h2><p>' + esc(desc) + ', ' + L.fmt(e.amount) + ' on ' + esc(L.fmtDay(e.date)) + '. ' +
        (e.source === 'rent' ? 'It won\'t be added again for that week.' : 'This can\'t be undone.') + '</p>' + actions('Keep it', 'dlgdelete', e.kind === 'rent' ? 'Remove rent' : 'Delete ' + what, true);
    } else if (d.type === 'tabclose') {
      const items = tabItems(), C = cfg(), cats = C.categories.concat(C.categories.indexOf('Other') >= 0 ? [] : ['Other']);
      body = '<h2 id="dlgT">Close the tab</h2><p>' + items.length + (items.length === 1 ? ' spend' : ' spends') + ', ' + L.fmt(sumAmt(items)) + '. It saves as one spend on ' + esc(L.fmtDay((S.tab && S.tab.date) || today())) + '.</p>' +
        '<label class="field"><span>Call it</span><input class="input" id="dlgTitle" maxlength="60" data-bind="dialog.title" value="' + esc(d.title) + '"></label>' +
        '<fieldset><legend>Category</legend><div class="chips">' + cats.map((c) => '<button type="button" class="chip" data-act="dlgcat" data-arg="' + esc(c) + '" aria-pressed="' + (d.category === c) + '">' + esc(c) + '</button>').join('') + '</div></fieldset>' +
        (C.budget ? '<label class="check-row"><input type="checkbox" id="dlgBudget" data-bind="dialog.budget"' + (d.budget !== false ? ' checked' : '') + '> Counts towards our monthly budget</label>' : '') +
        actions('Not yet', 'dlgtabclose', 'Save as one spend');
    } else if (d.type === 'tabdiscard') {
      body = '<h2 id="dlgT">Discard this tab?</h2><p>The ' + tabItems().length + ' spends on it won\'t be saved.</p>' + actions('Keep the tab', 'dlgtabdiscard', 'Discard tab', true);
    } else if (d.type === 'leave') {
      body = '<h2 id="dlgT">Save your changes?</h2><p>You changed some things in ' + (S.view === 'profile' ? 'Profiles' : 'Customise') + '.</p><div class="dialog-actions"><button class="btn btn-secondary" data-act="dlgdiscard">Discard</button><button class="btn btn-primary" data-act="dlgsaveleave">Save changes</button></div>';
    } else if (d.type === 'splitwise') {
      body = splitwiseDialog(d);
    } else if (d.type === 'swtrim') {
      body = swTrimDialog(d);
    } else if (d.type === 'bills') {
      body = billsDialog(d);
    } else if (d.type === 'sale') {
      body = saleDialog(d);
    } else if (d.type === 'watch') {
      body = watchDialog();
    } else if (d.type === 'spitem') {
      body = spItemDialog(d);
    } else if (d.type === 'shoplist') {
      body = shopListDialog();
    } else if (d.type === 'receipt') {
      body = receiptDialog(d);
    } else if (d.type === 'snaps') {
      body = snapsDialog(d);
    } else if (d.type === 'aitoken') {
      body = aiTokenDialog(d);
    } else if (d.type === 'ghtoken') {
      body = ghTokenDialog(d);
    } else if (d.type === 'addpick') {
      body = addPickDialog();
    } else if (d.type === 'inscat') {
      body = insCatDialog(d);
    } else if (d.type === 'news') {
      const n = d.preview ? S.newsEdit : noteFor(d.id), ed = editorOf();
      if (!n) { S.dialog = null; return ''; }
      body = '<p class="eyebrow">' + (d.fresh ? 'A few things to try' : 'What\'s new · ' + esc(dateY(n.date))) + '</p><h2 id="dlgT">' + esc(n.title) + '</h2>' +
        (n.intro ? '<p class="muted" style="margin-top:6px">' + esc(n.intro) + '</p>' : '') +
        '<ul class="news">' + n.items.filter((x) => x.on && (x.head || x.text)).map((x) => '<li><span class="news-ic" aria-hidden="true">' + icon(x.icon) + '</span><span>' + (x.head ? '<strong>' + esc(x.head) + '</strong> ' : '') + esc(x.text) + '</span></li>').join('') + '</ul>' +
        '<p class="news-from">' + av(ed, true) + '<span>From ' + esc(nm(ed)) + '</span></p>' +
        '<div class="dialog-actions"><button class="btn btn-primary" data-act="newsok">' + (d.preview ? 'Close the preview' : d.again ? 'Done' : 'Lovely, thanks') + '</button></div>';
    } else if (d.type === 'csv') {
      body = '<h2 id="dlgT">Copy your spends</h2><p>Copying isn\'t allowed here, so select all of this and copy it yourself.</p><textarea class="input" id="dlgCsv" readonly>' + esc(d.text) + '</textarea><div class="dialog-actions"><button class="btn btn-primary" data-act="dlgclose">Done</button></div>';
    }
    return '<div class="scrim" data-act="dlgclose"></div><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlgT">' + body + '</div>';
  }

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  /* ---------- navigation ---------- */
  function go(v) {
    if ((S.view === 'custom' || S.view === 'profile') && v !== S.view && draftDirty()) { openDialog({ type: 'leave', to: v }); return; }
    if (v === 'custom' || v === 'profile') { S.draft = makeDraft(); S.draftSaved = false; S.photoErr = null; }
    if (v === 'newsedit') { S.newsEdit = null; S.newsId = null; }
    if (v === 'cal' || v === 'deals') { if (!S.cal) initCal(); else if (v !== S.view) S.cal.picked = false; }
    if (v === 'deals') loadFeed();
    if (v === 'recap') { S.recapOffset = S.view === 'home' ? -1 : 0; S.insMode = 'month'; v = 'insights'; }
    else if (v === 'insights' && S.view !== 'insights') { S.recapOffset = 0; S.insYearOff = 0; S.insSel = null; S.insDay = null; }
    if (v !== 'add') S.add = null;
    S.view = v; render(); window.scrollTo(0, 0);
  }

  /* ---------- actions ---------- */
  const ACT = {
    go: (v) => go(v),
    add: () => openAdd({}),
    addpick: () => openDialog({ type: 'addpick' }),
    pickadd: () => { S.dialog = null; openAdd({}); },
    addon: (d) => openAdd({ date: d }),
    edit: (id) => openEdit(id),
    closeadd: () => { const back = (S.add && S.add.from) || 'home'; S.add = null; S.view = back; render(); window.scrollTo(0, 0); },
    key: (k) => pressKey(k),
    addcat: (c) => { S.add.category = S.add.category === c ? null : c; render(); },
    addpayer: (p) => { S.add.payer = p; S.add.onCard = p === holder(); render(); },
    addsplit: (m) => { S.add.splitMode = m; render(); },
    addstep: (d) => { S.add.splitA = L.clamp(S.add.splitA + Number(d), 0, 100); render(); },
    saveadd: () => saveAdd(),
    deladd: () => openDialog({ type: 'delete', id: S.add.id, fromAdd: true }),
    markadd: () => { const id = S.add.id; ACT.closeadd(); markEntries([id], 'personal', true); },
    delentry: (id) => openDialog({ type: 'delete', id }),
    mark: (arg) => { const i = arg.lastIndexOf('|'); markEntries([arg.slice(0, i)], arg.slice(i + 1), true); },
    shareday: (d) => markEntries(pendingAll().filter((e) => e.date === d).map((e) => e.id), 'shared', false),
    dismissimport: () => { S.importResult = null; render(); },
    selday: (d) => { S.cal.sel = d; S.cal.picked = true; render(); const c = document.getElementById('dayCard'); if (c && c.getBoundingClientRect().top > window.innerHeight - 120) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    pickday: (d) => { initCal(d); go('cal'); },
    calmove: (n) => { S.enterDir = Number(n) > 0 ? 1 : -1; const t = L.addMonths(S.cal.y, S.cal.m, Number(n)); S.cal.y = t[0]; S.cal.m = t[1]; const first = ymKey(t[0], t[1]) + '-01'; S.cal.sel = today().slice(0, 7) === ymKey(t[0], t[1]) ? today() : first; S.cal.picked = false; render(); },
    caltoday: () => { initCal(); render(); },
    settle: () => { const b = balance(); if (b.state === 'square') return; openDialog({ type: 'settle', from: b.from, to: b.to, amount: centsToStr(b.amount) }); },
    tabstart: () => {
      const s = { open: true, date: today(), startedAt: Date.now(), items: {} };
      S.tab = s;
      enqueue('hh/tab', (ref) => doSet(ref, s)).then((ok) => { if (ok) knownDocs['hh/tab'] = true; });
      S.tabForm = { amount: '', label: '', payer: null }; render();
      setTimeout(() => { const el = document.getElementById('tabAmt'); if (el) el.focus(); }, 30);
    },
    tabpayer: (p) => { S.tabForm.payer = p; render(); },
    tabadd: () => {
      const F = S.tabForm, amt = L.parseMoneyInput(F.amount);
      if (!amt) { toast('Enter an amount first.'); const el = document.getElementById('tabAmt'); if (el) el.focus(); return; }
      const id = uid('i'), item = { amount: amt, label: String(F.label || '').trim().slice(0, 40), payer: F.payer || holder(), at: Date.now() };
      upsert('hh/tab', { items: { [id]: item } }, { open: true, date: today(), startedAt: Date.now(), items: {} });
      localTabItem(id, item);
      S.tabForm = { amount: '', label: '', payer: F.payer }; render();
      const el = document.getElementById('tabAmt'); if (el) el.focus();
    },
    tabdel: (id) => { upsert('hh/tab', { items: { [id]: null } }, { open: true, date: today(), startedAt: Date.now(), items: {} }); localTabItem(id, null); render(); },
    tabclose: () => openDialog({ type: 'tabclose', title: 'Day out', category: null, budget: true }),
    tabdiscard: () => openDialog({ type: 'tabdiscard' }),
    recapmove: (n) => { S.enterDir = Number(n) > 0 ? 1 : -1; S.recapOffset = Math.min(0, S.recapOffset + Number(n)); render(); },
    insmode: (m) => { S.insMode = m === 'year' ? 'year' : 'month'; render(); },
    insyear: (n) => { S.enterDir = Number(n) > 0 ? 1 : -1; S.insYearOff = Math.min(0, S.insYearOff + Number(n)); S.insSel = null; S.insDay = null; render(); },
    insbar: (i) => insPick('m', Number(i)),
    insday: (i) => insPick('d', Number(i)),
    insopen: (i) => {
      const p = insYearData().ps[Number(i)];
      if (!p) return;
      S.recapOffset = Math.min(0, pIndex(p) - pIndex(curPeriod())); S.insMode = 'month'; render(); window.scrollTo(0, 0);
    },
    move: () => {
      const C = cfg(), p = L.shiftPeriod(curPeriod(), S.recapOffset), left = C.budget - sumAmt(counted(spendsIn(p)));
      if (!(left > 0) || typeof C.moves[p.start] === 'number') return;
      upsert('hh/settings', { goal: { saved: (C.goal.saved || 0) + left }, moves: { [p.start]: left } }, defaults())
        .then((ok) => { if (ok) toast('Moved ' + L.fmtRound(left) + ' to ' + C.goal.name); });
    },
    claim: (slot) => claim(slot),
    crentfrom: (p) => { S.draft.rent.from = p === 'a' ? 'a' : 'b'; S.draftSaved = false; render(); },
    aumode: (m) => { S.signin.mode = m === 'create' ? 'create' : 'in'; S.signin.error = null; S.signin.note = null; render(); },
    auin: () => authDo('in'),
    aucreate: () => authDo('create'),
    aureset: () => {
      const A = S.signin, em = String(A.email || '').trim();
      if (!em) { A.error = 'Type your email first, then tap that again.'; A.note = null; render(); return; }
      S.auth.sendPasswordResetEmail(em).then(() => { A.error = null; A.note = 'Check your email for a link to set a new password.'; render(); }, (e) => { A.error = authMsg(e); render(); });
    },
    auverified: () => authCheckVerified(),
    auresend: () => {
      const u = S.auth && S.auth.currentUser, A = S.signin || (S.signin = { mode: 'in', email: '', password: '', error: null, note: null, busy: false });
      if (u) u.sendEmailVerification().then(() => { A.error = null; A.note = 'Sent. Check your inbox.'; render(); }, (e) => { A.error = authMsg(e); render(); });
    },
    auout: () => { splashSet(null); if (S.auth) S.auth.signOut().then(() => location.reload(), () => location.reload()); },
    reload: () => location.reload(),
    welcomein: () => welcomeIn(),
    wnotme: () => { S.whoPick = true; render(); window.scrollTo(0, 0); },
    wpreview: () => { S.welcomePreview = true; S.welcomeT = 0; render(); window.scrollTo(0, 0); },
    wpclose: () => { S.welcomePreview = false; render(); const el = document.getElementById('cwelcome'); if (el) el.scrollIntoView({ block: 'center' }); },
    ccolour: (arg) => { const [p, k] = arg.split('|'); if (COLOUR_KEYS.indexOf(k) >= 0) { S.draft.colours[p] = k; S.draftSaved = false; render(); } },
    cscheme: (k) => { if (SCHEMES[k]) { S.draft.scheme = k; S.draftSaved = false; render(); } },
    cstep: (d) => { S.draft.splitA = L.clamp(S.draft.splitA + Number(d), 0, 100); S.draftSaved = false; render(); },
    cdelcat: (c) => { S.draft.categories = S.draft.categories.filter((x) => x !== c); S.draftSaved = false; render(); },
    caddcat: () => { addCat(S.draft); S.draftSaved = false; render(); const el = document.getElementById('dnewcat'); if (el) el.focus(); },
    caddsug: (c) => { if (S.draft.categories.indexOf(c) < 0) S.draft.categories.push(c); S.draftSaved = false; render(); },
    cholder: (p) => { S.draft.card.holder = p; S.draftSaved = false; render(); },
    cearns: (v) => {
      const c = S.draft.card;
      c.earns = c.earns === v ? null : v;
      if (c.earns) { const pr = L.CARD_PRESETS[c.earns]; c.rates = strRates(pr.rates); c.ratio = String(pr.ratio); }
      S.draftSaved = false; render();
    },
    cpreset: () => { const c = S.draft.card, pr = L.CARD_PRESETS[c.earns]; if (pr) { c.rates = strRates(pr.rates); c.ratio = String(pr.ratio); S.draftSaved = false; render(); } },
    cspot: (t) => { S.draft.spot.type = t; S.draftSaved = false; render(); },
    cskip: (c) => { const k = S.draft.budgetSkip, i = k.indexOf(c); if (i >= 0) k.splice(i, 1); else k.push(c); S.draftSaved = false; render(); },
    swstaged: () => { const P = S.impParsed; if (P) openSplitwise(P.groups, { rates: P.rates, rateNote: P.rateNote, staged: true }); },
    swswap: (gi) => { const m = S.dialog.maps[Number(gi)]; Object.keys(m).forEach((k) => { m[k] = other(m[k]); }); render(); },
    swimport: () => doSplitwise(),
    swtrim: () => openDialog({ type: 'swtrim', cut: today().slice(0, 4) + '-01-01', dropCats: true, busy: false, error: null }),
    swtrimgo: () => doSwTrim(),
    newsok: () => closeDialog(),
    factnext: () => { S.factN++; lsSet('hh.factN', String(S.factN)); const c = document.getElementById('factCard'); if (c) c.outerHTML = factCard(null, true); },
    pushon: () => pushOn(),
    pushoff: () => pushOff(),
    noticex: (k) => { markSeen(k); render(); },
    noticego: (k) => { markSeen(k); ACT.godeals(); },
    godeals: () => go('deals'),
    feedretry: () => { loadFeed(true); render(); },
    spstore: (v) => { S.spStore = v || 'all'; S.spAll = false; render(); },
    spaisle: (v) => { S.spAisle = S.spAisle === v ? 'all' : (v || 'all'); S.spAll = false; render(); },
    spwatch: () => {
      S.spWatch = !S.spWatch; S.spAll = false; S.spAisle = 'all'; render();
      if (S.spWatch) { const c = document.getElementById('spCard'); if (c) c.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); }
    },
    watchopen: () => openDialog({ type: 'watch' }),
    spitem: (k) => openDialog({ type: 'spitem', key: k }),
    aitoken: () => { S.aiTokNew = ''; openDialog({ type: 'aitoken' }); },
    aitoksave: () => {
      const t = String(S.aiTokNew || '').trim(), el = document.getElementById('aiTokIn');
      if (!UUID.test(t)) { S.dialog.err = 'That doesn\'t look like an App Check token. It\'s 36 characters, like 1a2b3c4d-1a2b-1a2b-1a2b-1a2b3c4d5e6f.'; render(); return; }
      if (el) el.value = '';
      S.aiTokNew = ''; S.aiDoc = Object.assign({}, S.aiDoc || {}, { appCheckDebug: t });
      upsert('hh/ai', { appCheckDebug: t }, {});
      S.dialog = null;
      if (aiLoad) { toast('Saved. The app reopens to use it'); setTimeout(() => location.reload(), 1200); render(); return; }
      render(); toast('Saved. Capture a receipt to try it');
    },
    aitokdel: () => {
      S.aiDoc = Object.assign({}, S.aiDoc || {}, { appCheckDebug: '' });
      upsert('hh/ai', { appCheckDebug: '' }, {});
      S.dialog = null; render(); toast('Token removed');
      if (aiLoad) setTimeout(() => location.reload(), 1200);
    },
    ghtoken: () => { S.ghTokNew = ''; openDialog({ type: 'ghtoken' }); },
    /* Checks the token by starting the job for real (with a test pop-up for this phone, if it's on), and saves it only if GitHub says yes. */
    ghtoksave: () => {
      const d = S.dialog, t = String(S.ghTokNew || '').replace(/\s+/g, '');
      if (!d || d.type !== 'ghtoken' || d.busy) return;
      if (!GH_TOKEN.test(t)) { d.err = 'That doesn\'t look like a GitHub token. It starts with github_pat_ and runs to about 90 letters and numbers.'; render(); return; }
      if (!ghRepo()) { d.err = ghWhy(0); render(); return; }
      const P = pushCfg(), mine = P.subs.some((x) => x.id === myPushId() && x.who === S.me && x.vapid === P.pub && !x.stale);
      const test = mine ? { id: uid('t'), at: Date.now(), self: true, n: nm(S.me), t: '🔔 Instant pop-ups are on', b: 'When ' + nm(other(S.me)) + ' adds a spend, it pops up here within a minute.' } : null;
      d.busy = true; d.err = ''; render();
      (test ? noteEvent(test) : Promise.resolve(true)).then(() => startJob(t)).then((st) => {
        const open = S.dialog === d;
        d.busy = false;
        if (jobOk(st)) {
          const el = document.getElementById('ghTokIn');
          if (el) el.value = '';
          S.ghTokNew = ''; S.aiDoc = Object.assign({}, S.aiDoc || {}, { ghToken: t }); lsSet('hh.ghFail', '');
          upsert('hh/ai', { ghToken: t }, {});
          if (open) S.dialog = null;
          render(); toast(test ? 'Saved. A test pop-up is on its way' : 'Saved. New spends now pop up within a minute');
          return;
        }
        if (test) dropEvent(test.id);
        if (open) { d.err = ghWhy(st); render(); }
      });
    },
    ghtokdel: () => {
      S.aiDoc = Object.assign({}, S.aiDoc || {}, { ghToken: '' }); lsSet('hh.ghFail', '');
      upsert('hh/ai', { ghToken: '' }, {});
      S.dialog = null; render(); toast('Token removed. New spends wait for the morning or evening check');
    },
    spsortbest: () => { S.spSort = 'best'; S.spAll = false; render(); },
    shoplist: () => openDialog({ type: 'shoplist' }),
    listadd: (k) => {
      const x = findSpecial(k);
      if (!x || S.readOnly) return;
      addToList({ n: x.n, s: x.s, p: centsOk(x.now), w: centsOk(x.was), link: linkOk(x.link), to: specialEnd(x) });
      S.dialog = null; render(); toast('Added to the weekend list');
    },
    listoff: (k) => {
      const x = findSpecial(k);
      if (!x || S.readOnly) return;
      saveList(dealsCfg().list.filter((i) => listKey(i) !== listKey(x)));
      S.dialog = null; render(); toast('Taken off the weekend list');
    },
    watchfor: (k) => { const x = findSpecial(k); if (!x) return; S.watchNew = watchWord(x.n); openDialog({ type: 'watch' }); },
    listtick: (id) => { if (S.readOnly) return; saveList(dealsCfg().list.map((i) => (i.id === id ? Object.assign({}, i, { done: !i.done }) : i))); render(); },
    listdel: (id) => { if (S.readOnly) return; saveList(dealsCfg().list.filter((i) => i.id !== id)); render(); },
    listclear: () => { if (S.readOnly) return; saveList(dealsCfg().list.filter((i) => !i.done)); render(); },
    listnew: () => {
      const n = String(S.listNew || '').trim().replace(/\s+/g, ' ').slice(0, 60), el = () => document.getElementById('listIn');
      if (!n || S.readOnly) { if (el()) el().focus(); return; }
      S.listNew = '';
      if (el()) el().value = '';
      if (dealsCfg().list.length >= 80) { toast('That\'s the most the list keeps. Clear some ticked things first.'); render(); return; }
      addToList({ n });
      render();
      if (el()) el().focus();
    },
    /* The Calendar, on a sale day's month with that day picked. */
    salecal: (d) => { go('cal'); initCal(ISO_DAY.test(d || '') ? d : today()); render(); window.scrollTo(0, 0); },
    rcptype: () => { S.dialog = null; if (S.view === 'add') render(); else openAdd({ from: S.view === 'upload' ? 'upload' : 'home' }); },
    rcpitem: (i) => {
      const f = S.dialog && S.dialog.form, x = f && f.items[Number(i)];
      if (!x) return;
      const order = ['shared', f.payer, f.payer === 'a' ? 'b' : 'a'];
      x.who = order[(order.indexOf(x.who) + 1) % 3]; S.dialog.error = null; render();
    },
    rcppaid: (p) => { const f = S.dialog && S.dialog.form; if (!f) return; f.payer = p === 'b' ? 'b' : 'a'; S.dialog.error = null; render(); },
    rcpsave: () => saveReceipt(),
    snapsave: () => saveSnaps(),
    snapdel: (id) => {
      if (S.readOnly) return;
      saveDeals({ snaps: dealsCfg().snaps.filter((x) => x.id !== id) });
      S.dialog = null; toast('Taken off the specials'); render();
    },
    spmore: () => { S.spAll = !S.spAll; render(); if (!S.spAll) { const el = document.getElementById('spList'); if (el) el.scrollIntoView({ block: 'nearest' }); } },
    ozball: () => { S.ozbAll = !S.ozbAll; render(); },
    watchadd: () => {
      const w = String(S.watchNew || '').trim().replace(/\s+/g, ' ').slice(0, 30), D = dealsCfg();
      const el = () => document.getElementById('watchIn');
      if (!w) { if (el()) el().focus(); return; }
      S.watchNew = '';
      if (el()) el().value = ''; // or Chrome's change event, as the old box is swapped out, would put the word back
      if (!D.watch.some((x) => x.toLowerCase() === w.toLowerCase())) {
        if (D.watch.length >= 30) { toast('That\'s the most words the watch list keeps.'); render(); return; }
        saveDeals({ watch: D.watch.concat([w]) });
      }
      render();
      if (el()) el().focus();
    },
    watchdel: (w) => { const D = dealsCfg(); saveDeals({ watch: D.watch.filter((x) => x !== w) }); render(); },
    saleidea: (key) => {
      const x = SALE_IDEAS.filter((i) => i.key === key)[0], D = dealsCfg(), t = today();
      if (!x || D.sales.some((s) => s.key === key)) return;
      const sale = { id: uid('sale'), key: x.key, store: x.store, offer: x.offer, where: x.where, note: x.note, link: x.link, rule: clone(x.rule), keen: true, skip: [], on: [] };
      saveDeals({ sales: D.sales.concat([sale]) }).then((ok) => { if (ok) toast('Added ' + x.store + '. Next one is ' + L.fmtDay(nextSale(sale, t))); });
      render();
    },
    saleadd: (d) => openDialog({ type: 'sale', id: null, form: saleForm(null, ISO_DAY.test(d || '') ? d : null), error: null }),
    saleopen: (id) => { const s = dealsCfg().sales.filter((x) => x.id === id)[0]; if (s) openDialog({ type: 'sale', id, form: saleForm(s), error: null }); },
    salesave: () => {
      const d = S.dialog, F = d && d.form;
      if (!F) return;
      const store = String(F.store || '').trim().replace(/\s+/g, ' ').slice(0, 40), rule = formRule(F), D = dealsCfg();
      if (!store) { d.error = 'Which shop is it at?'; d.focused = false; render(); return; }
      if (!rule) { d.error = 'Pick the date of the sale.'; render(); return; }
      const base = d.id ? D.sales.filter((x) => x.id === d.id)[0] : null;
      if (!base && D.sales.length >= 30) { d.error = 'That\'s the most sale days this can keep.'; render(); return; }
      const sale = Object.assign({}, base || { id: uid('sale'), key: '', note: '', link: '', skip: [], on: [] },
        { store, offer: String(F.offer || '').trim().slice(0, 60), where: String(F.where || '').trim().slice(0, 80), rule, keen: !!F.keen });
      if (base && JSON.stringify(base.rule) !== JSON.stringify(rule)) { sale.skip = []; sale.on = []; }
      if (base && base.keen !== sale.keen) { sale.skip = []; sale.on = []; }
      saveDeals({ sales: base ? D.sales.map((x) => (x.id === base.id ? sale : x)) : D.sales.concat([sale]) }).then((ok) => { if (ok) toast(base ? 'Saved ' + store : 'Added ' + store); });
      S.dialog = d.back ? { type: d.back } : null; render();
    },
    saledel: () => {
      const d = S.dialog, D = dealsCfg(), s = d && D.sales.filter((x) => x.id === d.id)[0];
      if (!s) return;
      saveDeals({ sales: D.sales.filter((x) => x.id !== s.id) }).then((ok) => { if (ok) toast('Removed ' + s.store); });
      S.dialog = d.back ? { type: d.back } : null; render();
    },
    salekeen: (arg) => {
      const i = arg.lastIndexOf('|'), id = arg.slice(0, i), date = arg.slice(i + 1), D = dealsCfg();
      saveDeals({ sales: D.sales.map((s) => {
        if (s.id !== id) return s;
        const x = Object.assign({}, s, { skip: s.skip.slice(), on: s.on.slice() }), list = s.keen ? x.skip : x.on, j = list.indexOf(date);
        if (j >= 0) list.splice(j, 1); else list.push(date);
        return x;
      }) });
      render();
    },
    billsopen: () => openDialog({ type: 'bills', form: { name: '', amount: '', every: 'quarter', from: '' }, error: null }),
    billadd: () => {
      const d = S.dialog, F = d && d.form, C = cfg();
      if (!F) return;
      const name = String(F.name || '').trim().slice(0, 40), amount = L.parseMoneyInput(String(F.amount || ''));
      if (!name) { d.error = 'Give the bill a name, like Strata.'; render(); return; }
      if (!(amount > 0)) { d.error = 'Add about how much it is, like 1500.'; render(); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(F.from || '')) { d.error = 'Pick when it\'s next due.'; render(); return; }
      if (C.bills.length >= 30) { d.error = 'That\'s the most bills this can keep.'; render(); return; }
      upsert('hh/settings', { bills: C.bills.concat([{ id: uid('b'), name, amount, every: EVERY_DAYS[F.every] ? F.every : 'quarter', from: F.from }]) }, defaults()).then((ok) => { if (ok) toast('Added ' + name); });
      d.form = { name: '', amount: '', every: F.every, from: '' }; d.error = null; render();
    },
    billdel: (id) => { const C = cfg(); upsert('hh/settings', { bills: C.bills.filter((b) => b.id !== id) }, defaults()); render(); },
    billhide: (k) => { const C = cfg(); if (C.billsHide.indexOf(k) < 0) upsert('hh/settings', { billsHide: C.billsHide.concat([k]) }, defaults()).then((ok) => { if (ok) toast("Got it, that one's not a bill"); }); },
    inscat: (c) => openDialog({ type: 'inscat', cat: c, open: null }),
    inscatopen: (id) => { const d = S.dialog; if (d && d.type === 'inscat') { d.open = d.open === id ? null : id; render(); } },
    inscatset: (arg) => {
      const i = arg.lastIndexOf('|'), id = arg.slice(0, i), cat = arg.slice(i + 1), r = S.byId[id], C = cfg();
      if (!r || !r.e) return;
      putEntries(r.ym, { [id]: Object.assign({}, r.e, { category: cat, updatedAt: Date.now() }) }).then((ok) => { if (ok) toast('Moved to ' + cat); });
      if (r.e.source === 'import' && r.e.key && C.remember && C.categories.indexOf(cat) >= 0) saveRule(r.e.key, null, cat);
      if (S.dialog && S.dialog.type === 'inscat') S.dialog.open = null;
      render();
    },
    newsopen: () => { const n = publishedNote(); if (n) openDialog({ type: 'news', id: n.id, again: true }); },
    newsitem: (i) => { const n = S.newsEdit, it = n && n.items[Number(i)]; if (!it) return; it.on = !it.on; saveNote(); render(); },
    newspreview: () => { if (S.newsEdit) openDialog({ type: 'news', preview: true, id: S.newsEdit.id }); },
    newspublish: () => {
      if (!S.newsEdit) return;
      const them = nm(other(S.me));
      saveNote({ status: 'published', publishedAt: Date.now() }).then((ok) => { if (ok) toast('Done. ' + them + ' sees it next time the app opens.'); });
      render();
    },
    newsdraft: () => { saveNote({ status: 'draft', publishedAt: 0 }); render(); },
    newsskip: () => { saveNote({ status: 'skipped', publishedAt: 0 }); render(); toast("This one won't be shown."); },
    newsreset: () => { resetNote(); render(); },
    newspick: (id) => { S.newsId = id; S.newsEdit = null; render(); window.scrollTo(0, 0); },
    photodel: (p) => { savePhoto(p === 'b' ? 'b' : 'a', null).then((ok) => { if (ok) toast('Photo removed'); }); render(); },
    savecustom: () => saveCustom(),
    copycsv: () => {
      const csv = L.entriesToCSV(S.entries, { a: nm('a'), b: nm('b') });
      const fallback = () => openDialog({ type: 'csv', text: csv });
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(csv).then(() => toast('Copied ' + S.entries.length + ' spends. Paste into a spreadsheet.'), fallback);
      else fallback();
    },
    sme: (p) => { S.setup.me = p; S.setup.error = null; render(); },
    scolour: (arg) => { const [p, k] = arg.split('|'); if (COLOUR_KEYS.indexOf(k) >= 0) { S.setup.colours[p] = k; render(); } },
    sscheme: (k) => { if (SCHEMES[k]) { S.setup.scheme = k; render(); } },
    sstep: (d) => { S.setup.splitA = L.clamp(S.setup.splitA + Number(d), 0, 100); render(); },
    scat: (c) => { const U = S.setup, i = U.categories.indexOf(c); if (i >= 0) U.categories.splice(i, 1); else U.categories.push(c); render(); },
    saddcat: () => { addCat(S.setup); render(); const el = document.getElementById('snewcat'); if (el) el.focus(); },
    sholder: (p) => { S.setup.holder = p; render(); },
    searns: (v) => { S.setup.earns = S.setup.earns === v ? null : v; render(); },
    snext: () => setupNext(),
    sback: () => { S.setup.step = Math.max(1, S.setup.step - 1); S.setup.error = null; render(); window.scrollTo(0, 0); },
    sfinish: () => setupFinish(),
    dlgclose: () => closeDialog(),
    dlgcat: (c) => { S.dialog.category = S.dialog.category === c ? null : c; render(); },
    dlgsettle: () => {
      const d = S.dialog, amt = L.parseMoneyInput(d.amount);
      if (!amt) { d.error = 'Enter the amount that was paid.'; d.focused = false; render(); return; }
      const e = makeEntry({ id: uid('s'), kind: 'settlement', source: 'manual', status: 'shared', date: today(), title: 'Settling up', amount: amt, from: d.from, to: d.to });
      putEntries(e.date.slice(0, 7), { [e.id]: e }).then((ok) => { if (ok) toast('Recorded ' + L.fmt(amt) + ' from ' + nm(d.from) + ' to ' + nm(d.to)); });
      closeDialog();
    },
    dlgdelete: () => {
      const d = S.dialog, r = S.byId[d.id];
      if (r) putEntries(r.ym, { [d.id]: null }).then((ok) => { if (ok) toast('Deleted'); });
      S.dialog = null;
      if (d.fromAdd) { const back = (S.add && S.add.from) || 'home'; S.add = null; S.view = back; }
      render();
    },
    dlgtabclose: () => closeTab(S.dialog.title, S.dialog.category, S.dialog.budget),
    dlgtabdiscard: () => {
      enqueue('hh/tab', (ref) => doSet(ref, { open: false, date: null, startedAt: null, items: {} }));
      S.dialog = null; S.tabForm = { amount: '', label: '', payer: null }; render(); toast('Tab discarded');
    },
    dlgdiscard: () => { const to = S.dialog.to; S.dialog = null; S.draft = null; S.draftSaved = true; go(to); },
    dlgsaveleave: () => { const to = S.dialog.to; S.dialog = null; if (!saveCustom(() => go(to))) { /* stays on Customise with the error */ } }
  };
  function addCat(T) {
    const v = String(T.newCat || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    if (!v) return;
    const exists = T.categories.some((c) => c.toLowerCase() === v.toLowerCase());
    if (!exists && T.categories.length < 30) T.categories.push(v.charAt(0).toUpperCase() + v.slice(1));
    T.newCat = '';
  }
  const CHANGE = {
    adddate: (el) => {
      if (!S.add) return;
      if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) S.add.date = el.value; else el.value = S.add.date;
      const l = document.getElementById('dateLbl'); if (l) l.textContent = L.fmtDay(S.add.date);
    },
    importfile: (el) => { const f = el.files && el.files[0]; importFile(f); el.value = ''; },
    spshopsel: (el) => { S.spStore = el.value || 'all'; S.spAll = false; render(); },
    spsortsel: (el) => { S.spSort = SP_SORTS.some((o) => o[0] === el.value) ? el.value : 'best'; S.spAll = false; render(); },
    spcatsel: (el) => { const v = el.value || 'all'; S.spWatch = v === 'watch'; S.spAisle = v === 'watch' ? 'all' : v; S.spAll = false; render(); },
    rcpfile: (el) => { const f = el.files && el.files[0]; el.value = ''; startReceipt(f); },
    snapfile: (el) => { const f = el.files ? Array.prototype.slice.call(el.files) : []; el.value = ''; startSnaps(f); },
    /* Ticking keeps the list where it is: only the button's count changes. */
    snapcount: () => { const d = S.dialog, b = document.getElementById('snapGo'); if (d && d.form && b) b.textContent = snapLabel(d.form.items.filter((x) => x.on).length); },
    remember: (el) => { upsert('hh/settings', { remember: !!el.checked }, defaults()); },
    dirty: () => { S.draftSaved = false; },
    swfiles: (el) => {
      const files = Array.from(el.files || []);
      el.value = '';
      if (!files.length) return;
      Promise.all(files.map(readFileText)).then((texts) => {
        const groups = [], errs = [];
        texts.forEach((t) => { const g = L.parseSplitwise(L.parseCSV(t)); if (g.error) errs.push(g.error); else groups.push(g); });
        if (!groups.length) { S.importResult = { error: errs[0] || "That doesn't look like a Splitwise export." }; render(); return; }
        openSplitwise(groups, {});
      }, () => { S.importResult = { error: "That file couldn't be opened. Export it again from Splitwise and try once more." }; render(); });
    },
    swtrimrefresh: () => swTrimRefresh(),
    pushpref: (el) => {
      const a = el.getAttribute('data-arg'), k = a === 'sale' || a === 'spends' ? a : 'specials', cur = pushCfg().prefs[S.me];
      upsert('hh/push', { prefs: { [S.me]: Object.assign({}, cur, { [k]: !!el.checked }) } }, PUSH_BASE);
    },
    salerefresh: () => { if (S.dialog && S.dialog.type === 'sale') S.dialog.error = null; render(); },
    newssave: () => { if (S.newsEdit) saveNote(); },
    photo: (el) => {
      const p = el.getAttribute('data-arg') === 'b' ? 'b' : 'a', f = el.files && el.files[0];
      el.value = '';
      if (!f) return;
      S.photoBusy = p; S.photoErr = null; render();
      readPhoto(f).then((url) => savePhoto(p, url).then((ok) => {
        S.photoBusy = null;
        if (ok) toast('Photo saved'); else S.photoErr = { p, msg: "The photo didn't save. Try again." };
        render();
      }), () => { S.photoBusy = null; S.photoErr = { p, msg: "That photo couldn't be opened. Try a JPEG or PNG." }; render(); });
    },
    /* Waits while someone is still typing or tapping, so a field isn't swapped out from under them. */
    rerender: () => safeRender()
  };

  const INPUT = {
    /* Typing a name updates the "Which one are you?" buttons in place, without redrawing the field being typed in. */
    snames: () => {
      const U = S.setup;
      if (!U) return;
      ['a', 'b'].forEach((p) => {
        const b = root.querySelector('[data-act="sme"][data-arg="' + p + '"]');
        if (b) b.textContent = String(U.names[p] || '').trim() || (p === 'a' ? 'Person one' : 'Person two');
      });
    },
    swrefresh: () => {
      const el = document.getElementById('swResult');
      if (el && S.dialog && S.dialog.type === 'splitwise') el.innerHTML = swResultHtml(swPreview(S.dialog));
    },
    swtrimrefresh: () => swTrimRefresh(),
    spsearch: () => { S.spAll = false; const el = document.getElementById('spList'); if (el) el.innerHTML = spListHtml(); },
    rcpsum: () => { const el = document.getElementById('rcpSum'); if (el && S.dialog && S.dialog.form) el.innerHTML = receiptSumHtml(S.dialog.form); }
  };

  /* ---------- Splitwise ---------- */
  function swCategories(groups) {
    const n = {};
    groups.forEach((g) => g.rows.forEach((r) => { const c = r.category; if (c && !/^(general|payment|rent)$/i.test(c)) n[c] = (n[c] || 0) + 1; }));
    return Object.keys(n).sort((x, y) => n[y] - n[x]).map((c) => c.slice(0, 24));
  }
  function stagedCard() {
    const P = S.impParsed;
    if (S.impBad && !S.readOnly && S.view === 'home') return '<button class="card row-card attn" data-act="go" data-arg="upload"><span><span class="k">Splitwise history</span><span class="row-t">Choose your Splitwise files in Upload</span></span>' + icon('arrow') + '</button>';
    if (!P || S.readOnly) return '';
    const fresh = P.groups.reduce((n, g) => n + g.rows.filter((r) => !S.byId[r.id]).length, 0);
    if (!fresh) return '';
    const from = P.groups.map((g) => g.from).sort()[0], to = P.groups.map((g) => g.to).sort().slice(-1)[0];
    return '<section class="card note-card"><h2>Your Splitwise history is ready</h2><p style="margin-bottom:12px">' + fresh + ' expenses from ' + P.groups.length + (P.groups.length === 1 ? ' group' : ' groups') + ', ' + esc(dateY(from)) + ' to ' + esc(dateY(to)) + '. Bring them in and the app carries on where Splitwise left off.</p>' +
      '<button class="btn btn-primary" data-act="swstaged">Review and bring it in</button></section>';
  }
  function openSplitwise(groups, opts) {
    const names = { a: nm('a'), b: nm('b') }, foreign = [], rates = {};
    groups.forEach((g) => g.currencies.forEach((c) => { if (c !== 'AUD' && foreign.indexOf(c) < 0) foreign.push(c); }));
    foreign.forEach((c) => { const r = opts.rates && Number(opts.rates[c]); rates[c] = r > 0 ? r.toFixed(2) : ''; });
    openDialog({ type: 'splitwise', groups, maps: groups.map((g) => L.mapPeople(g.people, names).map), rates, rateNote: opts.rateNote || '', foreign, addCats: true, cutover: true, staged: !!opts.staged, busy: false, error: null });
  }
  function swPreview(d) {
    const rates = {};
    d.foreign.forEach((c) => { const v = parseFloat(d.rates[c]); if (v > 0) rates[c] = v; });
    const built = L.buildSplitwise(d.groups, d.maps, rates);
    const fresh = built.entries.filter((e) => !S.byId[e.id]);
    return { built, fresh, after: L.netBalances(S.entries.concat(fresh)) };
  }
  function viewerLine(netA) {
    const me = S.me || 'a', v = me === 'a' ? netA : -netA;
    if (Math.abs(v) < 1) return 'All square';
    return v < 0 ? 'You owe ' + nm(other(me)) + ' ' + L.fmt(-v) : nm(other(me)) + ' owes you ' + L.fmt(v);
  }
  function swResultHtml(pv) {
    return pv.built.missing.length ? 'Add the exchange rate above to see your balance.' : 'After this, Home will show: <strong>' + esc(viewerLine(pv.after.a)) + '</strong>';
  }
  function groupLines(g, map) {
    return Object.keys(g.totals).map((cur) => {
      const t = g.totals[cur], pos = Object.keys(t).filter((p) => t[p] > 0)[0];
      if (!pos) return (cur === 'AUD' ? '' : cur + ': ') + 'all square';
      const neg = Object.keys(t).filter((p) => p !== pos)[0], amt = t[pos];
      const money = cur === 'AUD' ? L.fmt(amt) : cur === 'JPY' ? '¥' + Math.round(amt / 100).toLocaleString('en-AU') : cur + ' ' + (amt / 100).toFixed(2);
      return nm(map[neg]) + ' owes ' + nm(map[pos]) + ' ' + money;
    });
  }
  function totalsMatch(g) {
    const p0 = g.people[0];
    return Object.keys(g.totals).length > 0 && Object.keys(g.totals).every((cur) => g.rows.filter((r) => r.currency === cur).reduce((s2, r) => s2 + r.nets[p0], 0) === g.totals[cur][p0]);
  }
  function splitwiseDialog(d) {
    const pv = swPreview(d), C = cfg();
    const total = d.groups.reduce((n, g) => n + g.rows.length, 0), already = total - pv.fresh.length;
    let h = '<h2 id="dlgT">Bring in your Splitwise history</h2><p>' + pv.fresh.length + ' expenses' + (already ? ' (' + already + ' already here)' : '') + '. Your Splitwise balance carries over, so you can stop adding to Splitwise from here.</p>';
    d.groups.forEach((g, gi) => {
      const map = d.maps[gi], p0 = g.people[0], p1 = g.people[1];
      h += '<div class="sw-group"><p class="sw-t">' + esc(dateY(g.from)) + ' to ' + esc(dateY(g.to)) + ' · ' + g.rows.length + ' expenses</p>' +
        groupLines(g, map).map((l) => '<p class="sw-s">' + esc(l) + '</p>').join('') +
        (totalsMatch(g) ? '<p class="sw-ok">' + icon('check') + 'Adds up to the Splitwise total</p>' : '') +
        '<p class="sw-map">' + esc(p0) + ' is <strong>' + esc(nm(map[p0])) + '</strong>, ' + esc(p1) + ' is <strong>' + esc(nm(map[p1])) + '</strong> <button class="link sm" data-act="swswap" data-arg="' + gi + '">Swap</button></p></div>';
    });
    d.foreign.forEach((c) => {
      const word = c === 'JPY' ? 'yen' : c;
      h += '<label class="field"><span>' + esc(c === 'JPY' ? 'Yen' : c) + ' per A$1</span><input class="input" id="swrate' + esc(c) + '" inputmode="decimal" autocomplete="off" data-bind="dialog.rates.' + esc(c) + '" data-input="swrefresh" value="' + esc(d.rates[c]) + '" placeholder="e.g. 111.30">' +
        '<p class="hint">' + (d.rateNote ? esc(d.rateNote) + '. ' : '') + 'Each ' + esc(word) + ' spend is converted to dollars at this rate.</p></label>';
    });
    const newCats = pv.built.cats.filter((c) => C.categories.indexOf(c) < 0);
    if (newCats.length) h += '<label class="check-row"><input type="checkbox" data-bind="dialog.addCats"' + (d.addCats ? ' checked' : '') + '><span>Add your Splitwise categories: ' + esc(listNames(newCats.slice(0, 3).concat(newCats.length > 3 ? [(newCats.length - 3) + ' more'] : []))) + '</span></label>';
    const last = d.groups.map((g) => g.to).sort().slice(-1)[0];
    h += '<label class="check-row"><input type="checkbox" data-bind="dialog.cutover"' + (d.cutover ? ' checked' : '') + '><span>Leave card spends up to ' + esc(L.fmtDay(last)) + ' out of future Westpac imports. This history already has them.</span></label>';
    h += '<div class="sw-result" id="swResult" aria-live="polite">' + swResultHtml(pv) + '</div>';
    if (d.error) h += '<p class="err-text" role="alert">' + esc(d.error) + '</p>';
    return h + '<div class="dialog-actions"><button class="btn btn-secondary" data-act="dlgclose">Not now</button><button class="btn btn-primary" data-act="swimport"' + (d.busy || !pv.fresh.length ? ' disabled' : '') + '>' + (d.busy ? 'Bringing it in' : 'Bring it in') + '</button></div>';
  }
  function doSplitwise() {
    const d = S.dialog;
    if (!d || d.busy) return;
    const pv = swPreview(d);
    if (pv.built.missing.length) { d.error = 'Add the exchange rate first.'; render(); return; }
    if (!pv.fresh.length) { closeDialog(); return; }
    d.busy = true; d.error = null; render();
    const now = Date.now(), byYm = {};
    pv.fresh.forEach((e, i) => { const ym = e.date.slice(0, 7); (byYm[ym] = byYm[ym] || {})[e.id] = Object.assign({}, e, { createdAt: now + i, updatedAt: now }); });
    const C = cfg(), patch = {};
    if (d.addCats) { const add = pv.built.cats.filter((c) => C.categories.indexOf(c) < 0); if (add.length) patch.categories = C.categories.concat(add).slice(0, 30); }
    if (d.cutover) { patch.cardFrom = L.addDays(d.groups.map((g) => g.to).sort().slice(-1)[0], 1); patch.cardFromWhy = 'splitwise'; }
    let chain = Promise.resolve(true);
    Object.keys(byYm).sort().forEach((ym) => { chain = chain.then((ok) => (ok ? putEntries(ym, byYm[ym]) : false)); });
    chain.then((ok) => {
      if (!ok) { if (S.dialog === d) { d.busy = false; d.error = "Some of it didn't save. Try again: anything already brought in is skipped."; render(); } return; }
      if (Object.keys(patch).length) upsert('hh/settings', patch, defaults());
      if (d.staged) enqueue('hh/import', (ref) => doSet(ref, { status: 'done', doneAt: Date.now(), count: pv.fresh.length }));
      if (S.dialog === d) S.dialog = null;
      S.view = 'home'; render(); window.scrollTo(0, 0);
      toast('Brought in ' + pv.fresh.length + ' Splitwise expenses');
    });
  }

  /* ---------- trimming Splitwise history ---------- */
  /* Once Splitwise history is in, Upload shows what came across and lets you drop anything older than a date.
     Only entries that came from Splitwise are touched. Removed ones are left as empty markers, so choosing
     the same file again doesn't bring them back. */
  function swHistoryCard() {
    const list = S.entries.filter((e) => e.source === 'splitwise');
    if (!list.length) return '';
    const dates = list.map((e) => e.date).sort();
    return '<section class="card"><h2 style="font-size:19px;margin-bottom:6px">Splitwise history</h2>' +
      '<p class="muted" style="margin-bottom:12px">' + list.length + ' brought in from Splitwise, ' + esc(dateY(dates[0])) + ' to ' + esc(dateY(dates[dates.length - 1])) + '.</p>' +
      '<button class="btn btn-secondary btn-block" data-act="swtrim">Remove older ones</button>' +
      '<label class="link sm file-btn" style="margin-top:8px">Bring in another Splitwise file<input type="file" multiple accept=".csv,text/csv,text/plain" data-change="swfiles" aria-label="Choose more Splitwise CSV files"></label></section>';
  }
  function swTrimPreview(d) {
    const cut = /^\d{4}-\d{2}-\d{2}$/.test(d.cut || '') ? d.cut : '';
    const gone = cut ? S.entries.filter((e) => e.source === 'splitwise' && e.date < cut) : [];
    const goneIds = {};
    gone.forEach((e) => { goneIds[e.id] = true; });
    const keep = S.entries.filter((e) => !goneIds[e.id]);
    const used = {}, C = cfg(), cats = [];
    keep.forEach((e) => { used[e.category || 'Other'] = true; });
    gone.forEach((e) => { const c = e.category; if (c && !used[c] && C.categories.indexOf(c) >= 0 && cats.indexOf(c) < 0) cats.push(c); });
    return { cut, gone, cats, after: L.netBalances(keep) };
  }
  function swTrimResultHtml(pv) {
    if (!pv.cut) return 'Pick a date.';
    const n = pv.gone.length;
    if (!n) return 'Nothing from Splitwise is older than ' + esc(dateY(pv.cut)) + '.';
    return n + (n === 1 ? ' expense' : ' expenses') + ' from before ' + esc(dateY(pv.cut)) + ' will go. After this, Home will show: <strong>' + esc(viewerLine(pv.after.a)) + '</strong>';
  }
  function swTrimCatsHtml(d, pv) {
    if (!pv.cats.length) return '';
    return '<label class="check-row"><input type="checkbox" data-bind="dialog.dropCats"' + (d.dropCats ? ' checked' : '') + '><span>Also remove ' + esc(listNames(pv.cats)) +
      ' from your categories. Nothing else uses ' + (pv.cats.length === 1 ? 'it' : 'them') + '.</span></label>';
  }
  const swTrimGoLabel = (d, pv) => (d.busy ? 'Removing' : pv.gone.length ? 'Remove ' + pv.gone.length : 'Remove');
  function swTrimDialog(d) {
    const pv = swTrimPreview(d);
    let h = '<h2 id="dlgT">Remove older Splitwise expenses</h2><p>Keep what came from Splitwise from this date on. Anything added in the app stays.</p>' +
      '<label class="field"><span>Keep from</span><input class="input" id="swcut" type="date" data-bind="dialog.cut" data-input="swtrimrefresh" data-change="swtrimrefresh" value="' + esc(d.cut) + '"></label>' +
      '<div class="sw-result" id="swTrimResult" aria-live="polite">' + swTrimResultHtml(pv) + '</div>' +
      '<div id="swTrimCats">' + swTrimCatsHtml(d, pv) + '</div>';
    if (d.error) h += '<p class="err-text" role="alert">' + esc(d.error) + '</p>';
    return h + '<div class="dialog-actions"><button class="btn btn-secondary" data-act="dlgclose">Keep them</button><button class="btn btn-danger" id="swTrimGo" data-act="swtrimgo"' +
      (pv.gone.length && !d.busy ? '' : ' disabled') + '>' + swTrimGoLabel(d, pv) + '</button></div>';
  }
  /* Updates the dialog in place while the date is being picked, so the picker isn't closed by a redraw. */
  function swTrimRefresh() {
    const d = S.dialog;
    if (!d || d.type !== 'swtrim') return;
    const pv = swTrimPreview(d);
    const r = document.getElementById('swTrimResult'); if (r) r.innerHTML = swTrimResultHtml(pv);
    const c = document.getElementById('swTrimCats'); if (c) c.innerHTML = swTrimCatsHtml(d, pv);
    const b = document.getElementById('swTrimGo'); if (b) { b.textContent = swTrimGoLabel(d, pv); b.disabled = !pv.gone.length || !!d.busy; }
  }
  function doSwTrim() {
    const d = S.dialog;
    if (!d || d.type !== 'swtrim' || d.busy) return;
    const pv = swTrimPreview(d), n = pv.gone.length;
    if (!n) { closeDialog(); return; }
    d.busy = true; d.error = null; render();
    const byYm = {};
    pv.gone.forEach((e) => { const r = S.byId[e.id], ym = (r && r.ym) || e.date.slice(0, 7); (byYm[ym] = byYm[ym] || {})[e.id] = null; });
    let chain = Promise.resolve(true);
    Object.keys(byYm).sort().forEach((ym) => { chain = chain.then((ok) => (ok ? putEntries(ym, byYm[ym]) : false)); });
    chain.then((ok) => {
      if (!ok) { if (S.dialog === d) { d.busy = false; d.error = "Some of it didn't save. Try again: anything already removed stays removed."; render(); } return; }
      if (d.dropCats && pv.cats.length) {
        const C = cfg(), keepCat = (c) => pv.cats.indexOf(c) < 0;
        upsert('hh/settings', { categories: C.categories.filter(keepCat), budgetSkip: C.budgetSkip.filter(keepCat) }, defaults());
      }
      if (S.dialog === d) S.dialog = null;
      render();
      toast('Removed ' + n + ' Splitwise ' + (n === 1 ? 'expense' : 'expenses'));
    });
  }

  /* ---------- events ---------- */
  /* A shop photo that won't load steps aside, leaving its space. */
  document.addEventListener('error', (ev) => { const el = ev.target; if (el && el.classList && el.classList.contains('sp-img')) el.classList.add('gone'); }, true);
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || !root.contains(el) || el.disabled) return;
    const fn = ACT[el.getAttribute('data-act')];
    if (!fn) return;
    ev.preventDefault();
    fn(el.getAttribute('data-arg'), el);
  });
  const bind = (el) => {
    const b = el.getAttribute && el.getAttribute('data-bind');
    if (b) setPath(S, b, el.type === 'checkbox' ? el.checked : el.value);
  };
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (!root.contains(el)) return;
    bind(el);
    if (S.view === 'custom' && el.getAttribute('data-bind')) S.draftSaved = false;
    const fn = INPUT[el.getAttribute('data-input')];
    if (fn) fn(el);
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (!root.contains(el)) return;
    bind(el);
    const fn = CHANGE[el.getAttribute('data-change')];
    if (fn) fn(el);
  });
  const colPick = (ev) => {
    const b = ev.target && ev.target.closest ? ev.target.closest('.col[data-act]') : null;
    if (!b || !root.contains(b)) return;
    const fn = ACT[b.getAttribute('data-act')];
    if (fn) fn(b.getAttribute('data-arg'));
  };
  document.addEventListener('focusin', colPick);
  document.addEventListener('pointerover', (ev) => { if (ev.pointerType === 'mouse') colPick(ev); });
  const paceTrack = (ev) => { if (!S.pace) return; if (paceAt(ev)) S.paceOn = true; else if (S.paceOn) paceReset(); };
  document.addEventListener('pointermove', paceTrack);
  document.addEventListener('pointerdown', paceTrack);
  /* ---------- the phone's keyboard ----------
     On iPhone the keyboard is see-through and slides over the bottom of the app instead of making room, so the tab bar
     and save bar end up behind it, cut off. While it's up they're hidden, and an open sheet sits on top of it. */
  (function keyboardWatch() {
    const vv = window.visualViewport;
    if (!vv) return;
    const docEl = document.documentElement;
    const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !/^(checkbox|radio|file|button|submit|range|color)$/.test(a.type || ''); };
    let last = '';
    const update = () => {
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      const open = typing() && kb > 120 && (vv.scale || 1) < 1.05;
      const key = open + '|' + kb + '|' + Math.round(vv.height);
      if (key === last) return;
      last = key;
      docEl.classList.toggle('kb-open', open);
      docEl.style.setProperty('--kb', (open ? kb : 0) + 'px');
      docEl.style.setProperty('--vvh', Math.round(vv.height) + 'px');
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    document.addEventListener('focusin', () => setTimeout(update, 60));
    document.addEventListener('focusout', () => setTimeout(update, 60));
    update();
  })();
  document.addEventListener('keydown', (ev) => {
    const t = ev.target, typing = t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    if (ev.key === 'Escape' && S.dialog) { ev.preventDefault(); closeDialog(); return; }
    if (ev.key === 'Enter' && typing && t.getAttribute('data-enter')) {
      ev.preventDefault(); bind(t);
      const fn = ACT[t.getAttribute('data-enter')]; if (fn) fn(null, t);
      return;
    }
    if (S.view === 'add' && S.add && !S.dialog && !typing && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
      const k = ev.key;
      if (/^\d$/.test(k) || k === '.' || k === '+') { ev.preventDefault(); pressKey(k); }
      else if (k === 'Backspace') { ev.preventDefault(); pressKey('back'); }
      else if (k === 'Enter' && !(t && t.tagName === 'BUTTON')) { ev.preventDefault(); saveAdd(); }
    }
  });
  document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
  const pointerUp = () => setTimeout(() => { pointerDown = false; }, 0);
  document.addEventListener('pointerup', pointerUp, true);
  document.addEventListener('pointercancel', pointerUp, true);
  document.addEventListener('focusout', () => { setTimeout(flushPending, 0); });
  if (navigator.serviceWorker && navigator.serviceWorker.addEventListener) {
    navigator.serviceWorker.addEventListener('message', (ev) => {
      const m = ev.data || {};
      if (m.hh !== 'open' || !S.settings || !S.me) return;
      const cal = /^#cal=(\d{4}-\d{2}-\d{2})$/.exec(m.hash || '');
      if (m.hash === '#deals') ACT.godeals(); else if (cal) ACT.salecal(cal[1]); else go('home');
    });
  }

  boot();
})();
