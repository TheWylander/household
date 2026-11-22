/* Test double for the Firebase compat SDK (auth + Firestore), kept in localStorage so several pages share one
   project, like two phones. Each page has its own sign-in, like separate devices. Leave out with ?realfb=1. */
(function () {
  if (new URLSearchParams(location.search).get('realfb')) return;
  const K_DB = '__fbdb', K_USERS = '__fbusers', K_RULES = '__fbrules', SESSION = '__fbsession';
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const later = (fn, ms) => new Promise((res, rej) => setTimeout(() => { try { res(fn()); } catch (e) { rej(e); } }, ms || 15));
  const fail = (code, message) => { const e = new Error(message || code); e.code = code; return e; };

  /* ---------- auth ---------- */
  let current = null;
  const listeners = [];
  function userObj(rec) {
    if (!rec) return null;
    const u = {
      uid: rec.uid, email: rec.email, emailVerified: !!rec.verified,
      sendEmailVerification: () => later(() => { window.__fbSent = (window.__fbSent || 0) + 1; }),
      reload: () => later(() => { const r = load(K_USERS, {})[rec.email]; u.emailVerified = !!(r && r.verified); }),
      getIdToken: () => later(() => 'token-' + rec.uid)
    };
    return u;
  }
  function setCurrent(rec) {
    current = userObj(rec);
    if (rec) sessionStorage.setItem(SESSION, rec.email); else sessionStorage.removeItem(SESSION);
    listeners.slice().forEach((cb) => setTimeout(() => cb(current), 0));
  }
  const saved = sessionStorage.getItem(SESSION);
  if (saved) current = userObj(load(K_USERS, {})[saved]);
  const auth = {
    get currentUser() { return current; },
    onAuthStateChanged: (cb) => { listeners.push(cb); setTimeout(() => cb(current), 10); return () => {}; },
    createUserWithEmailAndPassword: (email, pw) => later(() => {
      email = String(email).toLowerCase();
      const users = load(K_USERS, {});
      if (users[email]) throw fail('auth/email-already-in-use');
      if (String(pw).length < 6) throw fail('auth/weak-password');
      users[email] = { uid: 'uid-' + email.split('@')[0], email, pw, verified: false };
      save(K_USERS, users); setCurrent(users[email]);
      return { user: current };
    }),
    signInWithEmailAndPassword: (email, pw) => later(() => {
      const r = load(K_USERS, {})[String(email).toLowerCase()];
      if (!r || r.pw !== pw) throw fail('auth/invalid-credential');
      setCurrent(r);
      return { user: current };
    }),
    sendPasswordResetEmail: (email) => later(() => { window.__fbReset = email; }),
    signOut: () => later(() => setCurrent(null))
  };
  window.__fbVerify = (email) => { const users = load(K_USERS, {}); users[email.toLowerCase()].verified = true; save(K_USERS, users); };

  /* ---------- Firestore ---------- */
  let docs = load(K_DB, {});
  let subs = [];
  /* Rules. A list of emails is the old single-household rules: only those two, and only hh/ and months/ at the top.
     { households: true, us: [...], admin: '...' } stands in for firestore.rules with households. Nothing set lets
     everything through. */
  const rules = () => load(K_RULES, null);
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const only = (keys, ok) => keys.every((k) => ok.indexOf(k) >= 0);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const changed = (after, before) => Object.keys(Object.assign({}, after, before)).filter((k) => !same((after || {})[k], (before || {})[k]));
  function can(op, path, req, res, pre, post) {
    const R = rules();
    if (!R) return true;
    const seg = path.split('/');
    const on = !!(current && current.emailVerified), me = current && current.uid, em = current && String(current.email).toLowerCase();
    if (Array.isArray(R)) return on && R.indexOf(current.email) >= 0 && seg.length === 2 && (seg[0] === 'hh' || seg[0] === 'months');
    const isUs = on && R.us.indexOf(em) >= 0, isAdmin = on && em === R.admin;
    const house = (hid) => pre('households/' + hid);
    const isMember = (hid) => on && !!house(hid) && (house(hid).members || []).indexOf(me) >= 0;
    if (seg[0] === 'households' && seg.length === 2) {
      const hid = seg[1];
      if (op === 'get') return isMember(hid) || isAdmin || (!!res && res.legacy === true && isUs);
      if (op === 'create' && !/^[a-z0-9]{16}$/.test(hid)) return false;
      if (op === 'list') return isAdmin;
      if (op === 'create') {
        const d = req;
        return on && only(Object.keys(d), ['owner', 'members', 'emails', 'label', 'createdAt', 'active', 'legacy', 'pilot']) && d.owner === me && same(d.members, [me]) && same(d.emails, [em]) &&
          (!has(d, 'legacy') || (d.legacy === true && isUs)) && (!has(d, 'pilot') || isAdmin || (has(d, 'legacy') && isUs)) &&
          (d.legacy === true || (post('users/' + me) || {}).hid === hid);
      }
      if (op === 'update') {
        const ch = changed(req, res);
        if (isMember(hid) && only(ch, ['label', 'active'])) return true;
        if (isAdmin && only(ch, ['pilot'])) return true;
        /* Joining. */
        if (!on || (res.members || []).indexOf(me) >= 0 || (res.members || []).length !== 1 || !only(ch, ['members', 'emails'])) return false;
        if (!same(req.members, res.members.concat([me])) || !same(req.emails, (res.emails || []).concat([em]))) return false;
        if (res.legacy === true && isUs) return true;
        const u = post('users/' + me) || {}, inv = pre('invites/' + u.via);
        return u.hid === hid && !!inv && inv.hid === hid && !has(inv, 'usedBy') && Date.now() < inv.at + 1209600000 && (post('invites/' + u.via) || {}).usedBy === me;
      }
      if (op === 'delete') return isMember(hid);
    }
    if (seg[0] === 'households' && seg.length === 4) {
      if (op === 'get' || op === 'list') return (seg[2] === 'hh' || seg[2] === 'months') && isMember(seg[1]);
      return isMember(seg[1]) && ((seg[2] === 'hh' && ['settings', 'tab', 'rules', 'import', 'photos', 'news', 'deals', 'push', 'ai'].indexOf(seg[3]) >= 0) ||
        (seg[2] === 'months' && /^[0-9]{4}-[0-9]{2}$/.test(seg[3])));
    }
    if (seg[0] === 'users' && seg.length === 2) {
      if (op === 'get' || op === 'delete') return on && seg[1] === me;
      if (op === 'create' || op === 'update') return on && seg[1] === me && only(Object.keys(req), ['hid', 'via', 'at']) && typeof req.hid === 'string' &&
        ((post('households/' + req.hid) || {}).members || []).indexOf(me) >= 0;
      return false;
    }
    if (seg[0] === 'invites' && seg.length === 2) {
      if (op === 'get') return on;
      if (op === 'create') return /^[a-z0-9]{12}$/.test(seg[1]) && only(Object.keys(req), ['hid', 'by', 'at', 'label']) && req.by === me && Number.isInteger(req.at) &&
        Math.abs(req.at - Date.now()) < 600000 && isMember(req.hid);
      if (op === 'update') return on && !has(res, 'usedBy') && only(changed(req, res), ['usedBy']) && req.usedBy === me && ((post('households/' + res.hid) || {}).members || []).indexOf(me) >= 0;
      if (op === 'delete') return isMember(res && res.hid);
      return false;
    }
    if (seg[0] === 'feedback' && seg.length === 2) {
      if (op === 'create') return /^[a-z0-9]{16}$/.test(seg[1]) && only(Object.keys(req), ['hid', 'by', 'label', 'email', 'text', 'at']) && req.by === me && req.email === em &&
        typeof req.text === 'string' && req.text.length > 0 && req.text.length <= 1000 && typeof req.label === 'string' && req.label.length <= 60 &&
        Number.isInteger(req.at) && Math.abs(req.at - Date.now()) < 600000 && isMember(req.hid);
      if (op === 'update') return isAdmin && only(changed(req, res), ['read']);
      return isAdmin;
    }
    if (seg[0] === 'shared' && seg.length === 2) return op === 'get' ? on : op !== 'list' && isAdmin && seg[1] === 'web';
    if (seg[0] === 'admin' && seg.length === 2) return op === 'get' && isAdmin;
    if (seg[0] === 'hh' && seg.length === 2) {
      if (op === 'get' || op === 'list') return isUs;
      return op === 'create' && isUs && seg[1] === 'migrated' && req.by === me && only(Object.keys(req), ['hid', 'by', 'at']);
    }
    if (seg[0] === 'months' && seg.length === 2) return (op === 'get' || op === 'list') && isUs;
    return false;
  }
  const now = (p) => docs[p];
  const canRead = (path, col) => (col ? can('list', path + '/_', null, null, now, now) : can('get', path, null, docs[path], now, now));
  const parent = (p) => p.slice(0, p.lastIndexOf('/'));
  const meta = (fromCache) => ({ fromCache: !!fromCache, hasPendingWrites: false });
  const snapDoc = (p, fromCache) => { const d = docs[p]; return { id: p.split('/').pop(), exists: d !== undefined, data: () => (d === undefined ? undefined : clone(d)), metadata: meta(fromCache) }; };
  const snapCol = (c, fromCache, empty) => {
    const ds = empty ? [] : Object.keys(docs).filter((p) => parent(p) === c).sort().map((p) => snapDoc(p, fromCache));
    return { docs: ds, size: ds.length, empty: !ds.length, metadata: meta(fromCache) };
  };
  const fire = (s) => setTimeout(() => {
    if (subs.indexOf(s) < 0) return;
    if (!canRead(s.path, s.col)) { subs = subs.filter((x) => x !== s); if (s.error) s.error(fail('permission-denied', 'Missing or insufficient permissions.')); return; }
    s.next(s.col ? snapCol(s.path, false) : snapDoc(s.path, false));
  }, 5);
  const notify = () => subs.forEach(fire);
  window.addEventListener('storage', (e) => { if (e.key === K_DB) { docs = load(K_DB, {}); notify(); } });
  const UNION = '__union';
  const isUnion = (v) => !!v && typeof v === 'object' && Array.isArray(v[UNION]);
  const unite = (cur, v) => { const out = Array.isArray(cur) ? clone(cur) : []; v[UNION].forEach((x) => { if (!out.some((y) => same(y, x))) out.push(clone(x)); }); return out; };
  function deepMerge(t, s) {
    Object.keys(s).forEach((k) => {
      const v = s[k];
      if (isUnion(v)) t[k] = unite(t[k], v);
      else if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) deepMerge(t[k], v);
      else t[k] = clone(v);
    });
  }
  const resolve = (d) => { const t = {}; deepMerge(t, d); return t; };
  function check(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw fail('invalid-argument', 'data must be an object');
    JSON.stringify(d, (k, v) => { if (v === undefined) throw fail('invalid-argument', 'Unsupported field value: undefined'); return v; });
    (function walk(o) { Object.keys(o).forEach((k) => { if (k === '') throw fail('invalid-argument', 'empty field name'); if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) && !isUnion(o[k])) walk(o[k]); }); })(d);
  }
  /* Applies writes to a copy of the database and checks each against the rules, before and after, like a batch. */
  function commit(ops) {
    docs = load(K_DB, {});
    const before = clone(docs), after = clone(docs);
    ops.forEach((o) => {
      if (o.kind === 'delete') { delete after[o.path]; return; }
      check(o.data);
      if (o.merge && after[o.path] !== undefined) deepMerge(after[o.path], o.data); else after[o.path] = resolve(o.data);
    });
    const pre = (p) => before[p], post = (p) => after[p];
    ops.forEach((o) => {
      const res = before[o.path], op = o.kind === 'delete' ? 'delete' : res === undefined ? 'create' : 'update';
      if (!can(op, o.path, after[o.path], res, pre, post)) throw fail('permission-denied', 'Missing or insufficient permissions.');
    });
    docs = after; save(K_DB, docs); window.__fbWrites = (window.__fbWrites || 0) + ops.length; notify();
  }
  function doc(path) {
    return {
      id: path.split('/').pop(), path,
      get: () => later(() => { if (!canRead(path)) throw fail('permission-denied'); return snapDoc(path, false); }),
      set: (d, opts) => later(() => commit([{ kind: 'set', path, data: d, merge: !!(opts && opts.merge) }])),
      update: () => Promise.reject(fail('unimplemented', 'the app should merge with set')),
      delete: () => later(() => commit([{ kind: 'delete', path }])),
      onSnapshot: (next, error) => { const s = { path, col: false, next, error }; subs.push(s); fire(s); return () => { subs = subs.filter((x) => x !== s); }; }
    };
  }
  function collection(path) {
    return {
      path,
      doc: (id) => doc(path + '/' + id),
      get: () => later(() => { if (!canRead(path, true)) throw fail('permission-denied'); return snapCol(path, false); }),
      onSnapshot: (next, error) => {
        const s = { path, col: true, next, error };
        subs.push(s);
        // Like Firestore: an empty answer from the local cache first, then the server's.
        setTimeout(() => { if (subs.indexOf(s) >= 0) next(snapCol(path, true, true)); }, 1);
        fire(s);
        return () => { subs = subs.filter((x) => x !== s); };
      }
    };
  }
  function batch() {
    const ops = [];
    const b = {
      set: (ref, d, opts) => { ops.push({ kind: 'set', path: ref.path, data: d, merge: !!(opts && opts.merge) }); return b; },
      delete: (ref) => { ops.push({ kind: 'delete', path: ref.path }); return b; },
      commit: () => later(() => commit(ops))
    };
    return b;
  }
  const firestore = { doc, collection, batch };
  const fb = {
    apps: [],
    initializeApp: (cfg) => { const app = { options: cfg }; fb.apps.push(app); return app; },
    app: () => fb.apps[0],
    auth: () => auth,
    firestore: Object.assign(() => firestore, { FieldValue: { arrayUnion: (...v) => ({ __union: v }) } })
  };
  Object.defineProperty(window, 'firebase', { value: fb, writable: false, configurable: false });
})();
