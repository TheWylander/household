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
    inbox: '<path d="M4 13.5 6.5 5h11L20 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13.5h4.5l1 2.5h5l1-2.5H20"/>',
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
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5"/><circle cx="12" cy="12" r="6.3"/>'
  };
  const icon = (n) => '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[n] + '</svg>';

  /* ---------- state ---------- */
  const S = {
    mode: 'loading', db: null, user: null, myId: null, idResolved: false,
    hhLoaded: false, monthsLoaded: false, live: { hh: false, months: false }, slow: false, offline: false,
    settings: null, tab: null, rules: null, months: {}, entries: [], byId: {},
    me: null, readOnly: false,
    view: 'home', cal: null, add: null, tabForm: { amount: '', label: '', payer: null },
    recapOffset: 0, draft: null, draftSaved: false, setup: null, dialog: null,
    insMode: 'month', insYearOff: 0, insSel: null, insDay: null, pace: null, paceOn: false,
    photos: null, photoBusy: null, photoErr: null,
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
      home: { week: true, goal: true, spot: true, recap: true },
      spot: { type: 'note', text: '', date: '' },
      remember: true, scheme: 'warm',
      moves: {},
      budgetSkip: [], cardFrom: '', cardFromWhy: '',
      welcome: { note: '', to: null, seen: '' },
      rent: PRESET && PRESET.rent ? Object.assign(clone(PRESET.rent), { on: false }) : { on: false, amount: null, from: 'b', day: 0, start: '' },
      createdAt: Date.now()
    };
  }
  function cfg() {
    const d = defaults();
    const s = S.settings && typeof S.settings === 'object' ? S.settings : {};
    const pick = (k) => Object.assign({}, d[k], s[k] && typeof s[k] === 'object' ? s[k] : {});
    const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
    const goal = pick('goal'), card = pick('card'), welcome = pick('welcome'), rent = pick('rent');
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
      remember: s.remember !== false,
      scheme: SCHEMES[s.scheme] ? s.scheme : 'warm',
      moves: s.moves && typeof s.moves === 'object' ? s.moves : {},
      budgetSkip: Array.isArray(s.budgetSkip) ? s.budgetSkip.filter((c) => typeof c === 'string') : [],
      cardFrom: typeof s.cardFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.cardFrom) ? s.cardFrom : '',
      cardFromWhy: s.cardFromWhy === 'splitwise' ? 'splitwise' : '',
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
  const counted = (list) => { const skip = cfg().budgetSkip; return skip.length ? list.filter((e) => skip.indexOf(e.category || 'Other') < 0) : list; };
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
      parts: o.parts && o.parts.length ? o.parts : null,
      payer: o.kind === 'settlement' || o.kind === 'rent' ? o.from : (o.payer || null), splitA, paid, owed, onCard: !!o.onCard,
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
      applyPhotos();
      parseStaged();
      S.hhLoaded = true; S.offline = false;
      markLive('hh', snap); resolveMe(); ensureRent(); safeRender();
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
    const nav = ['home', 'cal', 'inbox', 'insights', 'settings', 'custom', 'profile', 'recap', 'tab'].indexOf(S.view) >= 0;
    return bn + '<main class="main' + (nav ? '' : ' no-nav') + '" style="' + meVars() + '">' + viewFor(S.view) + '</main>' +
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
    root.innerHTML = html;
    if (S.dialog && !S.dialog.focused) {
      S.dialog.focused = true;
      const f = root.querySelector('.dialog input, .dialog textarea') || root.querySelector('.dialog .btn-primary, .dialog .btn-danger');
      if (f) f.focus();
    } else if (key) {
      const el = root.querySelector(key);
      if (el) el.focus({ preventScroll: true });
    }
  }
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
      case 'add': return S.add ? viewAdd() : viewHome();
      case 'tab': return viewTab();
      case 'inbox': return viewInbox();
      case 'recap':
      case 'insights': return viewInsights();
      case 'settings': return viewSettings();
      case 'profile': return viewProfile();
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
    const n = pendingAll().length;
    const item = (v, ic, label, extra) => '<button class="nav-i' + (S.view === v ? ' on' : '') + '" data-act="go" data-arg="' + v + '"' + (S.view === v ? ' aria-current="page"' : '') + '>' + icon(ic) + '<span>' + label + '</span>' + (extra || '') + '</button>';
    return '<nav class="nav" aria-label="Main">' + item('home', 'home', 'Home') + item('cal', 'cal', 'Calendar') +
      (S.readOnly ? '' : '<button class="nav-add" data-act="add" aria-label="Add a spend">' + icon('plus') + '</button>') +
      item('inbox', 'inbox', 'Inbox', n ? '<span class="badge"><span class="sr">, </span>' + n + '<span class="sr"> to check</span></span>' : '') +
      item('insights', 'chart', 'Insights') + '</nav>';
  }
  function viewLoading() {
    return '<div class="loading"><div class="blob" aria-hidden="true"></div><p class="title sm">Opening your household</p>' +
      (S.slow ? '<p class="muted">This is taking a while. Check your connection.</p>' : '<p class="muted">Just a moment</p>') + '</div>';
  }
  function viewNotSetUp() {
    return '<div class="setup"><h1>Not set up yet</h1><p class="lead">Once this is set up, your shared spends will show here.</p></div>';
  }

  /* ---------- home ---------- */
  function viewHome() {
    const C = cfg(), t = today(), p = curPeriod(), all = spendsIn(p), spent = sumAmt(C.budget ? counted(all) : all);
    const daysLeft = L.daysBetweenInclusive(t, p.end);
    let hero;
    if (C.budget) {
      const left = C.budget - spent, over = left < 0, pct = Math.min(100, Math.round(spent / C.budget * 100));
      const perDay = !over && daysLeft > 0 ? Math.floor(left / daysLeft / 100) * 100 : 0;
      hero = '<section class="hero" aria-label="Budget">' +
        '<span class="blob" aria-hidden="true"></span>' +
        '<p class="hero-k">' + (over ? 'Over budget by' : 'Left to spend') + '</p>' +
        '<p class="hero-v' + (over ? ' over' : '') + '">' + L.fmtRound(Math.abs(left)) + '</p>' +
        '<p class="hero-sub">Spent ' + L.fmt(spent) + ' of ' + L.fmtRound(C.budget) + (C.budgetSkip.length ? '<span class="hint" style="display:block;margin-top:2px">Not counting ' + esc(listNames(C.budgetSkip)) + '</span>' : '') + '</p>' +
        '<div class="meter" role="img" aria-label="' + pct + ' percent of the budget spent"><span style="width:' + pct + '%"></span></div>' +
        '<div class="hero-foot"><span class="sticker' + (over ? ' coral' : '') + '">' + (over ? 'Over budget' : 'About ' + L.fmtRound(perDay) + ' a day') + '</span>' +
        '<span class="muted">' + (daysLeft === 1 ? 'Last day' : daysLeft + ' days left') + '</span></div></section>';
    } else {
      hero = '<section class="hero" aria-label="Spending">' +
        '<span class="blob" aria-hidden="true"></span>' +
        '<p class="hero-k">Spent so far</p><p class="hero-v">' + L.fmtRound(spent) + '</p>' +
        '<p class="hero-sub">' + esc(L.periodLabel(p, t)) + ' · ' + (daysLeft === 1 ? 'last day' : daysLeft + ' days left') + '</p>' +
        '<div class="hero-foot"><button class="link" data-act="go" data-arg="custom">Set a monthly budget</button></div></section>';
    }
    let out = '<header class="top"><div><p class="eyebrow">Hi ' + esc(nm(S.me)) + '</p><h1 class="title">' + esc(L.periodLabel(p, t)) + '</h1></div>' +
      '<div class="top-right"><div class="duo" aria-hidden="true">' + av('a') + av('b') + '</div>' +
      '<button class="icon-btn" data-act="go" data-arg="settings" aria-label="Settings">' + icon('gear') + '</button></div></header>' + stagedCard() + hero;

    const items = tabItems();
    if (S.tab && S.tab.open) {
      out += '<button class="card row-card attn" data-act="go" data-arg="tab"><span class="row-lead"><span><span class="k">Day tab open</span>' +
        '<span class="row-t">' + items.length + (items.length === 1 ? ' spend' : ' spends') + ' · ' + L.fmt(sumAmt(items)) + '</span></span></span>' + icon('arrow') + '</button>';
    }
    const n = pendingAll().length;
    if (n) {
      out += '<button class="card row-card attn" data-act="go" data-arg="inbox"><span class="row-lead"><span class="count">' + n + '</span>' +
        '<span><span class="row-t">' + (n === 1 ? 'spend' : 'spends') + ' to check</span><span class="k">From ' + esc(poss(nm(holder()))) + ' card</span></span></span>' + icon('arrow') + '</button>';
    }
    out += balanceCard();
    if (C.home.week !== false) out += weekCard();
    const tiles = (C.home.goal !== false ? goalTile() : '') + (C.home.spot !== false ? spotTile() : '');
    if (tiles) out += '<div class="grid2">' + tiles + '</div>';
    if (C.home.recap !== false) {
      out += '<button class="card row-card" data-act="go" data-arg="recap"><span><span class="k">Insights</span><span class="row-t">Where ' + esc(L.periodLabel(L.shiftPeriod(p, -1), t)) + ' went</span></span>' + icon('arrow') + '</button>';
    }
    if (!S.entries.length) {
      out += '<section class="card note-card"><h2>Start with one spend</h2><p>Tap the plus to add what you spent today, or bring in ' + esc(poss(nm(holder()))) + ' card statement from the Inbox.</p></section>';
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
    const cells = L.monthGrid(c.y, c.m).map((d) => {
      if (!d) return '<span class="cal-day pad" aria-hidden="true"></span>';
      const i = info[d] || {};
      const cls = ['cal-day', i.total ? 'has' : '', d === t ? 'today' : '', d === c.sel ? 'sel' : '', d > t ? 'future' : ''].filter(Boolean).join(' ');
      const label = L.fmtDayLong(d) + (i.total ? ', ' + L.fmt(i.total) + ' shared' : '') + (i.chk ? ', some to check' : '');
      return '<button class="' + cls + '" data-act="selday" data-arg="' + d + '" aria-label="' + esc(label) + '" aria-pressed="' + (d === c.sel) + '">' +
        '<span class="n">' + L.parseYmd(d).getDate() + '</span><span class="v">' + (i.total ? L.fmtShort(i.total) : '') + '</span>' +
        '<span class="dots">' + (i.man ? '<i class="dot man"></i>' : '') + (i.imp ? '<i class="dot imp"></i>' : '') + (i.chk ? '<i class="dot chk"></i>' : '') + '</span></button>';
    }).join('');
    const isThisMonth = ym === t.slice(0, 7);
    return '<header class="top"><div><p class="eyebrow">Every spend, day by day</p><h1 class="title">Calendar</h1></div>' +
      '<button class="link" data-act="go" data-arg="recap">Insights</button></header>' +
      '<section class="card cal bold"><div class="cal-head"><button class="icon-btn" data-act="calmove" data-arg="-1" aria-label="Previous month">' + icon('left') + '</button>' +
      '<h2>' + L.MONTHS_FULL[c.m] + ' ' + c.y + '</h2><button class="icon-btn" data-act="calmove" data-arg="1" aria-label="Next month">' + icon('right') + '</button></div>' +
      '<div class="cal-dow" aria-hidden="true"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>' +
      '<div class="cal-grid">' + cells + '</div>' +
      '<div class="legend"><span><i class="dot man"></i>Added by you two</span><span><i class="dot imp"></i>From ' + esc(poss(nm(H))) + ' card</span><span><i class="dot chk"></i>To check</span></div>' +
      '<div class="cal-foot"><span>Shared spend in ' + L.MONTHS_FULL[c.m] + '</span><span class="amt">' + L.fmt(monthTotal) + '</span></div>' +
      (isThisMonth ? '' : '<p style="margin-top:6px"><button class="link sm" data-act="caltoday">Back to this month</button></p>') + '</section>' +
      (c.sel && c.sel.slice(0, 7) === ym ? dayCard(c.sel) : '');
  }
  function dayCard(d) {
    const order = { shared: 0, check: 1, dupe: 2, personal: 3 };
    const list = S.entries.filter((e) => e.date === d).sort((x, y) => (order[x.status] || 0) - (order[y.status] || 0) || (x.createdAt || 0) - (y.createdAt || 0));
    const shared = sumAmt(list.filter(L.isSpend));
    return '<section class="card" id="dayCard"><div class="card-head"><h2>' + esc(L.fmtDayLong(d)) + '</h2><span class="amt">' + (shared ? L.fmt(shared) : '') + '</span></div>' +
      (list.length ? '<ul class="list">' + list.map((e) => entryRow(e, 'day')).join('') + '</ul>' : '<p class="muted" style="margin-bottom:14px">Nothing on this day yet.</p>') +
      (S.readOnly ? '' : '<button class="btn btn-secondary btn-block" style="margin-top:12px" data-act="addon" data-arg="' + d + '">' + icon('plus') + 'Add a spend on this day</button>') + '</section>';
  }
  function entryRow(e, ctx) {
    const H = holder(), id = esc(e.id), inInbox = ctx === 'inbox';
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
    if (e.parts && e.parts.length) sub = '<p class="e-sub">' + esc(e.parts.map((x) => (x.label ? x.label + ' ' : '') + L.fmt(x.amount)).join(', ')) + '</p>';
    else if (e.items && e.items.length > 1) sub = '<p class="e-sub">' + e.items.map(L.fmt).join(' + ') + '</p>';
    if (e.source === 'import' && e.raw) sub += '<p class="e-sub">' + esc(e.raw) + '</p>';
    if (e.orig && e.orig.currency) sub += '<p class="e-sub">' + esc(fmtForeign(e.orig)) + '</p>';
    let tag = '', actions = '';
    if (e.status === 'check') {
      tag = inInbox ? '' : '<span class="tag chk">To check</span>';
      if (!S.readOnly) actions = '<div class="e-actions"><button class="btn btn-small btn-secondary" data-act="mark" data-arg="' + id + '|shared">Shared</button><button class="btn btn-small btn-ghost" data-act="mark" data-arg="' + id + '|personal">Just ' + esc(poss(nm(H))) + '</button></div>';
    } else if (e.status === 'personal') {
      tag = '<span class="tag">Just ' + esc(poss(nm(H))) + '</span>';
      if (!S.readOnly) actions = '<div class="e-actions"><button class="btn btn-small btn-ghost" data-act="mark" data-arg="' + id + '|shared">Make it shared</button></div>';
    } else if (e.status === 'dupe') {
      const twin = e.dupOf && S.byId[String(e.dupOf).split(':')[0]];
      tag = '<span class="tag">' + (twin && twin.e ? 'Same as ' + esc(twin.e.title || 'a spend you added') : 'Already added by hand') + '</span>';
      if (!S.readOnly) actions = '<div class="e-actions"><button class="btn btn-small btn-ghost" data-act="mark" data-arg="' + id + '|shared">Count it too</button></div>';
    }
    const dim = e.status === 'personal' || e.status === 'dupe';
    return '<li class="entry' + (dim ? ' dim' : '') + '"><div class="e-row">' + av(payerOf(e)) + '<div class="e-main"><p class="e-title">' + esc(e.title || 'Spend') + '</p>' +
      '<p class="e-meta">' + esc(inInbox ? (e.category || 'Other') : (e.category || 'Other') + ' · ' + src) + '</p>' + sub + tag + '</div>' +
      '<div class="e-right"><p class="e-amt">' + L.fmt(e.amount) + '</p>' + (S.readOnly ? '' : '<button class="link sm" data-act="edit" data-arg="' + id + '">Edit</button>') + '</div></div>' + actions + '</li>';
  }

  /* ---------- add and edit ---------- */
  function openAdd(opts) {
    const C = cfg(), H = holder();
    S.add = {
      id: null, date: opts.date || today(), expr: '', title: '', category: null,
      payer: H, onCard: true, splitMode: 'even', splitA: C.splitA, locked: false, orig: null,
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
      title: e.title || '', category: e.category || 'Other', payer: payer === 'mixed' ? 'mixed' : payer,
      onCard: !!e.onCard, splitMode: (e.splitA == null || e.splitA === C.splitA) ? 'even' : 'custom', splitA: e.splitA == null ? C.splitA : e.splitA,
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
    if (r.items.length > 1) return r.items.length + ' spends: ' + r.items.map(L.fmt).join(' + ');
    if (A.expr) return 'Tap + to add another and get the total';
    return 'Use + to add up a day of spends';
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
    const usual = C.splitA + '/' + (100 - C.splitA);
    const split = '<fieldset><legend>Split</legend><div class="seg">' + segBtn('addsplit', 'even', A.splitMode === 'even', 'Our usual ' + usual) + segBtn('addsplit', 'custom', A.splitMode === 'custom', 'Custom') + '</div>' +
      (A.splitMode === 'custom' ? stepper('addstep', A.splitA) : '') + '</fieldset>';
    return '<header class="top sheet"><button class="icon-btn" data-act="closeadd" aria-label="Close">' + icon('close') + '</button>' +
      '<h1 class="title sm">' + (A.id ? 'Edit spend' : 'Add a spend') + '</h1>' +
      '<label class="date-chip"><span id="dateLbl">' + esc(L.fmtDay(A.date)) + '</span><input type="date" id="addDate" value="' + A.date + '" data-change="adddate" aria-label="Date of the spend"></label></header>' +
      '<section class="amount-box" aria-live="polite"><p class="amt-total" id="amtTotal">' + L.fmt(r.ok ? r.total : 0) + '</p><p class="amt-expr" id="amtExpr">' + esc(exprLine(A, r)) + '</p></section>' +
      (A.locked ? '<p class="hint" style="text-align:center;margin:-6px 0 16px">' + esc(A.orig.parts ? A.orig.parts.map((x) => nm(x.payer) + ' ' + L.fmt(x.amount)).join(', ') : '') + '</p>' : keypad()) +
      '<section class="card">' + payerBlock +
      '<label class="field"><span>What was it?</span><input class="input" id="addTitle" data-bind="add.title" value="' + esc(A.title) + '" placeholder="Dinner, groceries, a gift" autocomplete="off" maxlength="60"></label>' +
      (isImport ? '<p class="hint" style="margin:-10px 0 16px">On the statement: ' + esc(A.orig.raw || '') + '</p>' : '') +
      '<fieldset><legend>Category</legend><div class="chips">' + cats.map((c) => '<button type="button" class="chip" data-act="addcat" data-arg="' + esc(c) + '" aria-pressed="' + (A.category === c) + '">' + esc(c) + '</button>').join('') + '</div>' +
      (C.categories.length ? '' : '<p class="hint">Add your own categories in Customise.</p>') + '</fieldset>' +
      split + '<div id="nudge">' + nudgeHtml(A, r) + '</div></section>' +
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
    A.expr = x;
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
  }
  function saveAdd() {
    const A = S.add, C = cfg(), r = addTotal(A);
    if (!r.ok || r.total <= 0) { toast('Enter an amount first.'); return; }
    const base = A.orig || {};
    const splitA = A.splitMode === 'even' ? C.splitA : A.splitA;
    const title = String(A.title || '').trim() || (A.category && A.category !== 'Other' ? A.category : 'Spend');
    let e;
    if (A.locked) {
      e = Object.assign(clone(base), { date: A.date, title, category: A.category || 'Other', splitA, owed: L.splitOwed(base.amount, splitA, base.id), updatedAt: Date.now() });
    } else {
      e = makeEntry({
        id: A.id || uid('m'), kind: 'expense', source: base.source || 'manual', status: base.status || 'shared',
        date: A.date, title, raw: base.raw, key: base.key, amount: r.total, items: r.items,
        parts: base.parts && base.amount === r.total ? base.parts : null, payer: A.payer, onCard: A.onCard, splitA,
        category: A.category || 'Other', dupOf: base.dupOf, orig: base.orig && base.amount === r.total ? base.orig : null, createdAt: base.createdAt, by: base.by
      });
    }
    const newYm = e.date.slice(0, 7), old = A.id && S.byId[A.id], oldYm = old ? old.ym : null;
    const done = (oldYm && oldYm !== newYm)
      ? putEntries(newYm, { [e.id]: e }).then((ok) => (ok ? putEntries(oldYm, { [e.id]: null }) : false))
      : putEntries(newYm, { [e.id]: e });
    if (base.source === 'import' && base.key && C.remember && A.category && A.category !== base.category && C.categories.indexOf(A.category) >= 0) saveRule(base.key, null, A.category);
    done.then((ok) => { if (ok) toast((A.id ? 'Updated ' : 'Saved ') + L.fmt(e.amount) + ' on ' + L.fmtDay(e.date)); });
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
  function closeTab(title, category) {
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
      payer, paid, onCard: payer === H, splitA: C.splitA, category: category || 'Other'
    });
    putEntries(date.slice(0, 7), { [e.id]: e }).then((ok) => {
      if (!ok) return;
      enqueue('hh/tab', (ref) => doSet(ref, { open: false, date: null, startedAt: null, items: {} }));
      toast('Saved the tab: ' + L.fmt(total) + ' on ' + L.fmtDay(date));
    });
    S.dialog = null; S.tabForm = { amount: '', label: '', payer: null };
    initCal(date); S.view = 'cal'; render(); window.scrollTo(0, 0);
  }

  /* ---------- inbox and import ---------- */
  function viewInbox() {
    const H = holder(), C = cfg(), hn = nm(H);
    const pend = pendingAll().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt || 0) - (b.createdAt || 0)));
    const groups = {};
    pend.forEach((e) => { (groups[e.date] = groups[e.date] || []).push(e); });
    let out = '<header class="top"><div><p class="eyebrow">' + esc(poss(hn)) + ' ' + esc(cardLabel()) + '</p><h1 class="title">Inbox</h1></div></header>';
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
        '<ul class="list">' + list.map((e) => entryRow(e, 'inbox')).join('') + '</ul></section>';
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
  const kpi = (label, value, sub) => '<div class="kpi"><p class="k">' + esc(label) + '</p><p class="kpi-v">' + esc(value) + '</p>' + (sub ? '<p class="kpi-s">' + esc(sub) + '</p>' : '') + '</div>';

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
    out += '<section class="hero"><span class="blob" aria-hidden="true"></span><p class="hero-k">Shared spend</p><p class="hero-v">' + L.fmtRound(total) + '</p>' +
      '<p class="hero-sub">' + (C.budget ? (C.budgetSkip.length ? L.fmtRound(budgetTotal) + ' counts towards the ' + L.fmtRound(C.budget) + ' budget · ' : 'of ' + L.fmtRound(C.budget) + ' budget · ') : '') + list.length + (list.length === 1 ? ' spend' : ' spends') + '</p>' + (sticker ? '<div class="hero-foot">' + sticker + '</div>' : '') + '</section>';
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
    out += '<div class="kpis">' + kpi('Per day', L.fmtRound(Math.round(total / elapsed)), isCurrent ? 'so far' : 'on average') +
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
    svg += '<path class="pc-area" d="' + line + ' L' + f(lx) + ' ' + yb + ' Z"/><path class="pc-line" d="' + line + '"/>';
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
    out += '<section class="hero"><span class="blob" aria-hidden="true"></span><p class="hero-k">Shared spend</p><p class="hero-v">' + L.fmtRound(total) + '</p>' +
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
    out += '<div class="kpis">' + kpi('Per month', L.fmtRound(avgM), done.length ? 'on average' : 'so far') + k2 + kpi('Typical spend', L.fmtRound(Math.round(total / list.length)), 'on average') + '</div>';
    const rows = started.map((m) => [L.periodLabel(m.p, t) + (m.current ? ' so far' : ''), L.fmt(m.total),
      useB ? (C.budget - m.towards >= 0 ? L.fmtRound(C.budget - m.towards) + ' under' : L.fmtRound(m.towards - C.budget) + ' over') : String(m.n)]);
    out += '<section class="card"><div class="card-head"><h2>Month by month</h2></div>' +
      (useB && C.budgetSkip.length ? '<p class="hint" style="margin:-6px 0 0">Bars show what counts towards the budget, so they leave out ' + esc(listNames(C.budgetSkip)) + '.</p>' : '') +
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
      h += '<button type="button" class="col' + (on ? ' on' : '') + '" data-act="' + o.act + '" data-arg="' + i + '" aria-pressed="' + on + '" aria-label="' + esc(it.aria || it.name + ', ' + L.fmt(it.v)) + '">' +
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
    return '<section class="card"><div class="card-head"><h2>Where it went</h2></div>' + keys.map((c) => {
      const note = noteFn ? noteFn(c, cats[c]) : '';
      return '<div class="hbar"><div class="hbar-top"><span>' + esc(c) + '</span><span>' + L.fmt(cats[c]) + ' <span class="muted">' + Math.round(cats[c] / total * 100) + '%</span></span></div>' +
        '<div class="hbar-track" aria-hidden="true"><span class="hbar-fill" style="width:' + Math.max(2, Math.round(cats[c] / cmax * 100)) + '%"></span></div>' +
        (note ? '<p class="hbar-note">' + esc(note) + '</p>' : '') + '</div>';
    }).join('') + '</section>';
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
    out += '<button class="card row-card" data-act="go" data-arg="profile"><span class="row-lead"><span class="duo" aria-hidden="true">' + av('a') + av('b') + '</span><span><span class="row-t">Profiles</span><span class="k">Photos, names and colours</span></span></span>' + icon('arrow') + '</button>';
    out += '<button class="card row-card" data-act="go" data-arg="custom"><span><span class="row-t">Customise</span><span class="k">Look, budget, rent, card and categories</span></span>' + icon('arrow') + '</button>';
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
      home: { week: C.home.week !== false, goal: C.home.goal !== false, spot: C.home.spot !== false, recap: C.home.recap !== false },
      spot: { type: C.spot.type === 'countdown' ? 'countdown' : 'note', text: String(C.spot.text || ''), date: String(C.spot.date || '') },
      budgetSkip: C.budgetSkip.slice(), cardFrom: C.cardFrom, scheme: C.scheme,
      welcome: { note: C.welcome.note || (S.me ? defaultNote(other(S.me)) : '') },
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
        home: { week: !!D.home.week, goal: !!D.home.goal, spot: !!D.home.spot, recap: !!D.home.recap },
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
    out += '<section class="card"><div class="card-head"><h2>Home screen</h2></div>' + sw('week', 'Last 7 days') + sw('goal', 'Our goal') + sw('spot', 'Your spot') + sw('recap', 'Insights link') + '</section>';
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
  /* The first time the second person opens the app, they get a welcome instead of the plain "Who's this?". */
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
    return String(raw || '').trim() || defaultNote(p);
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
    const items = [['plus', 'Add a spend in a couple of taps'], ['cal', 'See every day added up'], ['duo', 'Always know where you two stand']];
    return '<div class="welcome' + anim + '" style="--me:' + me.main + ';--me-soft:' + me.soft + '">' +
      (preview ? '<div class="wl-preview"><span>Preview of what ' + n + ' sees</span><button class="btn btn-secondary btn-small" data-act="wpclose">Close</button></div>' : '') +
      '<div class="wl-mark">' + mark + '</div><div class="wl-rest">' +
      '<h1>Welcome home, ' + n + '</h1><p class="lead">' + esc(nm(from)) + ' made this for the two of you.</p>' +
      '<figure class="wl-note"><figcaption>' + av(from, true) + '<span>From ' + esc(nm(from)) + '</span></figcaption><blockquote>' + welcomeNote(p, preview).split(/\n\s*\n/).map((t) => '<p>' + esc(t.trim()) + '</p>').join('') + '</blockquote></figure>' +
      '<ul class="wl-list">' + items.map((it) => '<li><span class="wl-ic">' + icon(it[0]) + '</span>' + it[1] + '</li>').join('') + '</ul>' +
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
        '<button class="btn btn-secondary btn-block" data-act="wpreview">See what ' + n + ' saw</button></section>';
    }
    return head + '<p class="muted" style="margin-bottom:12px">This shows the first time ' + n + ' opens the app.</p>' +
      '<label class="field"><span>Your note</span><textarea class="input wl-text" id="dwnote" rows="8" maxlength="400" data-bind="draft.welcome.note" data-change="dirty"' + ro + '>' + esc(D.welcome.note) + '</textarea></label>' +
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
  function closeDialog() { S.dialog = null; render(); }
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
        actions('Not yet', 'dlgtabclose', 'Save as one spend');
    } else if (d.type === 'tabdiscard') {
      body = '<h2 id="dlgT">Discard this tab?</h2><p>The ' + tabItems().length + ' spends on it won\'t be saved.</p>' + actions('Keep the tab', 'dlgtabdiscard', 'Discard tab', true);
    } else if (d.type === 'leave') {
      body = '<h2 id="dlgT">Save your changes?</h2><p>You changed some things in ' + (S.view === 'profile' ? 'Profiles' : 'Customise') + '.</p><div class="dialog-actions"><button class="btn btn-secondary" data-act="dlgdiscard">Discard</button><button class="btn btn-primary" data-act="dlgsaveleave">Save changes</button></div>';
    } else if (d.type === 'splitwise') {
      body = splitwiseDialog(d);
    } else if (d.type === 'swtrim') {
      body = swTrimDialog(d);
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
    if (v === 'cal' && !S.cal) initCal();
    if (v === 'recap') { S.recapOffset = S.view === 'home' ? -1 : 0; S.insMode = 'month'; v = 'insights'; }
    else if (v === 'insights' && S.view !== 'insights') { S.recapOffset = 0; S.insYearOff = 0; S.insSel = null; S.insDay = null; }
    if (v !== 'add') S.add = null;
    S.view = v; render(); window.scrollTo(0, 0);
  }

  /* ---------- actions ---------- */
  const ACT = {
    go: (v) => go(v),
    add: () => openAdd({}),
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
    selday: (d) => { S.cal.sel = d; render(); const c = document.getElementById('dayCard'); if (c && c.getBoundingClientRect().top > window.innerHeight - 120) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    pickday: (d) => { initCal(d); go('cal'); },
    calmove: (n) => { const t = L.addMonths(S.cal.y, S.cal.m, Number(n)); S.cal.y = t[0]; S.cal.m = t[1]; const first = ymKey(t[0], t[1]) + '-01'; S.cal.sel = today().slice(0, 7) === ymKey(t[0], t[1]) ? today() : first; render(); },
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
    tabclose: () => openDialog({ type: 'tabclose', title: 'Day out', category: null }),
    tabdiscard: () => openDialog({ type: 'tabdiscard' }),
    recapmove: (n) => { S.recapOffset = Math.min(0, S.recapOffset + Number(n)); render(); },
    insmode: (m) => { S.insMode = m === 'year' ? 'year' : 'month'; render(); },
    insyear: (n) => { S.insYearOff = Math.min(0, S.insYearOff + Number(n)); S.insSel = null; S.insDay = null; render(); },
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
    auout: () => { if (S.auth) S.auth.signOut().then(() => location.reload(), () => location.reload()); },
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
    dlgtabclose: () => closeTab(S.dialog.title, S.dialog.category),
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
    swtrimrefresh: () => swTrimRefresh()
  };

  /* ---------- Splitwise ---------- */
  function swCategories(groups) {
    const n = {};
    groups.forEach((g) => g.rows.forEach((r) => { const c = r.category; if (c && !/^(general|payment|rent)$/i.test(c)) n[c] = (n[c] || 0) + 1; }));
    return Object.keys(n).sort((x, y) => n[y] - n[x]).map((c) => c.slice(0, 24));
  }
  function stagedCard() {
    const P = S.impParsed;
    if (S.impBad && !S.readOnly && S.view === 'home') return '<button class="card row-card attn" data-act="go" data-arg="inbox"><span><span class="k">Splitwise history</span><span class="row-t">Choose your Splitwise files in the Inbox</span></span>' + icon('arrow') + '</button>';
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
  /* Once Splitwise history is in, the Inbox shows what came across and lets you drop anything older than a date.
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

  boot();
})();
