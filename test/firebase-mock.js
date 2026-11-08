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
  const allowed = () => {
    const rules = load(K_RULES, null);
    return !rules || !!(current && current.emailVerified && rules.indexOf(current.email) >= 0);
  };
  const parent = (p) => p.slice(0, p.lastIndexOf('/'));
  const meta = (fromCache) => ({ fromCache: !!fromCache, hasPendingWrites: false });
  const snapDoc = (p, fromCache) => { const d = docs[p]; return { id: p.split('/').pop(), exists: d !== undefined, data: () => (d === undefined ? undefined : clone(d)), metadata: meta(fromCache) }; };
  const snapCol = (c, fromCache, empty) => {
    const ds = empty ? [] : Object.keys(docs).filter((p) => parent(p) === c).sort().map((p) => snapDoc(p, fromCache));
    return { docs: ds, size: ds.length, empty: !ds.length, metadata: meta(fromCache) };
  };
  const fire = (s) => setTimeout(() => {
    if (subs.indexOf(s) < 0) return;
    if (!allowed()) { subs = subs.filter((x) => x !== s); if (s.error) s.error(fail('permission-denied', 'Missing or insufficient permissions.')); return; }
    s.next(s.col ? snapCol(s.path, false) : snapDoc(s.path, false));
  }, 5);
  const notify = () => subs.forEach(fire);
  window.addEventListener('storage', (e) => { if (e.key === K_DB) { docs = load(K_DB, {}); notify(); } });
  function deepMerge(t, s) {
    Object.keys(s).forEach((k) => {
      const v = s[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) deepMerge(t[k], v);
      else t[k] = clone(v);
    });
  }
  function check(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw fail('invalid-argument', 'data must be an object');
    JSON.stringify(d, (k, v) => { if (v === undefined) throw fail('invalid-argument', 'Unsupported field value: undefined'); return v; });
    (function walk(o) { Object.keys(o).forEach((k) => { if (k === '') throw fail('invalid-argument', 'empty field name'); if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) walk(o[k]); }); })(d);
  }
  function doc(path) {
    return {
      id: path.split('/').pop(), path,
      get: () => later(() => { if (!allowed()) throw fail('permission-denied'); return snapDoc(path, false); }),
      set: (d, opts) => later(() => {
        if (!allowed()) throw fail('permission-denied');
        check(d);
        docs = load(K_DB, {});
        if (opts && opts.merge && docs[path] !== undefined) deepMerge(docs[path], d); else docs[path] = clone(d);
        save(K_DB, docs); window.__fbWrites = (window.__fbWrites || 0) + 1; notify();
      }),
      update: () => Promise.reject(fail('unimplemented', 'the app should merge with set')),
      delete: () => later(() => { docs = load(K_DB, {}); delete docs[path]; save(K_DB, docs); notify(); }),
      onSnapshot: (next, error) => { const s = { path, col: false, next, error }; subs.push(s); fire(s); return () => { subs = subs.filter((x) => x !== s); }; }
    };
  }
  function collection(path) {
    return {
      path,
      doc: (id) => doc(path + '/' + id),
      get: () => later(() => { if (!allowed()) throw fail('permission-denied'); return snapCol(path, false); }),
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
  const firestore = { doc, collection };
  const fb = {
    apps: [],
    initializeApp: (cfg) => { const app = { options: cfg }; fb.apps.push(app); return app; },
    app: () => fb.apps[0],
    auth: () => auth,
    firestore: () => firestore
  };
  Object.defineProperty(window, 'firebase', { value: fb, writable: false, configurable: false });
})();
