/* Pure logic for the household app. No DOM, no storage. */
(function (root) {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { var p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(s, n) { var d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function addMonths(y, m, n) { var d = new Date(y, m + n, 1); return [d.getFullYear(), d.getMonth()]; }
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function daysBetweenInclusive(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000) + 1; }
  function clamp(n, lo, hi) { n = Number(n); if (!isFinite(n)) n = lo; return Math.min(hi, Math.max(lo, n)); }

  /* ---------- money (integer cents) ---------- */
  function toCents(x) { return Math.round(Number(x) * 100); }
  function fmt(c) {
    c = Math.round(c || 0);
    var neg = c < 0; c = Math.abs(c);
    var s = Math.floor(c / 100).toLocaleString('en-AU') + '.' + pad(c % 100);
    return (neg ? '-' : '') + '$' + s;
  }
  function fmtRound(c) {
    var neg = c < 0;
    return (neg ? '-' : '') + '$' + Math.round(Math.abs(c || 0) / 100).toLocaleString('en-AU');
  }
  function fmtShort(c) {
    var d = Math.abs(c || 0) / 100;
    if (d >= 10000) return '$' + Math.round(d / 1000) + 'k';
    if (d >= 1000) return '$' + (Math.round(d / 100) / 10) + 'k';
    return '$' + Math.round(d);
  }
  /* "$1,500" or "1500.50" -> cents, or null */
  function parseMoneyInput(s) {
    var t = String(s == null ? '' : s).replace(/[$,\s]/g, '');
    if (!t) return null;
    if (!/^\d+(\.\d{0,2})?$/.test(t)) return null;
    return toCents(parseFloat(t));
  }

  /* "42.50 + 11 + 14" -> {ok, total, items} */
  function parseExpr(expr) {
    var parts = String(expr || '').split('+').map(function (t) { return t.trim(); }).filter(function (t) { return t.length; });
    var items = [];
    for (var i = 0; i < parts.length; i++) {
      var clean = parts[i].replace(/[$,\s]/g, '');
      if (clean === '' || clean === '.' || !/^\d*\.?\d{0,2}$/.test(clean)) return { ok: false, total: 0, items: [] };
      var v = toCents(parseFloat(clean));
      if (v > 0) items.push(v);
    }
    var total = items.reduce(function (a, b) { return a + b; }, 0);
    return { ok: true, total: total, items: items };
  }

  /* ---------- splitting and balances ---------- */
  /* Shares in cents. A half cent left over goes to one of you based on the spend's id,
     so over many spends neither person always carries it. */
  function splitOwed(amount, ratioA, seed) {
    var exact = amount * clamp(ratioA, 0, 100) / 100, a = Math.floor(exact), frac = exact - a;
    if (Math.abs(frac - 0.5) < 1e-9) { if (seed == null || parseInt(hash(String(seed)).slice(-1), 36) % 2 === 0) a += 1; }
    else if (frac > 0.5) a += 1;
    return { a: a, b: amount - a };
  }
  function isSpend(e) { return !!e && e.kind === 'expense' && e.status === 'shared'; }
  /* Rent is one person paying the other: it moves the balance but isn't shared spending. */
  function counts(e) { return !!e && (e.kind === 'settlement' || e.kind === 'rent' || isSpend(e)); }
  /* Every date on a given weekday (0 = Sunday) from start to until, inclusive. */
  function weeklyDates(start, day, until) {
    var re = /^\d{4}-\d{2}-\d{2}$/, out = [];
    if (!re.test(start || '') || !re.test(until || '') || start > until) return out;
    var d = parseYmd(start), s;
    while (d.getDay() !== day) d.setDate(d.getDate() + 1);
    s = ymd(d);
    while (s <= until && out.length < 520) { out.push(s); d.setDate(d.getDate() + 7); s = ymd(d); }
    return out;
  }
  function netBalances(entries) {
    var a = 0, b = 0;
    (entries || []).forEach(function (e) {
      if (!counts(e)) return;
      var paid = e.paid || {}, owed = e.owed || {};
      a += (paid.a || 0) - (owed.a || 0);
      b += (paid.b || 0) - (owed.b || 0);
    });
    return { a: a, b: b };
  }

  /* ---------- budget periods ---------- */
  function periodFor(dateStr, resetDay) {
    var r = clamp(parseInt(resetDay || 1, 10), 1, 28);
    var d = parseYmd(dateStr);
    var y = d.getFullYear(), m = d.getMonth();
    if (d.getDate() < r) { var pm = addMonths(y, m, -1); y = pm[0]; m = pm[1]; }
    var nm = addMonths(y, m, 1);
    return { start: ymd(new Date(y, m, r)), end: ymd(new Date(nm[0], nm[1], r - 1)), y: y, m: m, r: r };
  }
  function shiftPeriod(p, n) {
    var t = addMonths(p.y, p.m, n);
    return periodFor(ymd(new Date(t[0], t[1], p.r)), p.r);
  }
  function periodLabel(p, todayStr) {
    var s = parseYmd(p.start), e = parseYmd(p.end);
    var thisYear = todayStr ? parseYmd(todayStr).getFullYear() : new Date().getFullYear();
    if (p.r === 1) return MONTHS_FULL[s.getMonth()] + (s.getFullYear() !== thisYear ? ' ' + s.getFullYear() : '');
    return s.getDate() + ' ' + MONTHS[s.getMonth()] + ' to ' + e.getDate() + ' ' + MONTHS[e.getMonth()];
  }
  function inPeriod(dateStr, p) { return dateStr >= p.start && dateStr <= p.end; }

  /* ---------- CSV ---------- */
  function detectDelimiter(text) {
    var line = (text.split(/\r?\n/).find(function (l) { return l.trim().length; }) || '');
    var counts = { ',': (line.match(/,/g) || []).length, ';': (line.match(/;/g) || []).length, '\t': (line.match(/\t/g) || []).length };
    var best = ',';
    Object.keys(counts).forEach(function (k) { if (counts[k] > counts[best]) best = k; });
    return best;
  }
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    var delim = detectDelimiter(text);
    var rows = [], row = [], field = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }

  var MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  function parseDate(s) {
    s = String(s || '').trim();
    var m;
    function mk(y, mo, d) {
      if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
      var dt = new Date(y, mo, d);
      return dt.getMonth() === mo ? ymd(dt) : null;
    }
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return mk(+m[1], +m[2] - 1, +m[3]);
    if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/))) { var y = +m[3]; if (y < 100) y += 2000; return mk(y, +m[2] - 1, +m[1]); }
    if ((m = s.match(/^(\d{1,2})[\s\-]+([A-Za-z]{3})[A-Za-z]*[\s\-]+(\d{2,4})/))) {
      var yy = +m[3]; if (yy < 100) yy += 2000;
      var mo = MON[m[2].toLowerCase()];
      return mo == null ? null : mk(yy, mo, +m[1]);
    }
    return null;
  }
  function parseMoney(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return null;
    var neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[$,\s]/g, '');
    if (s.charAt(0) === '-') { neg = !neg; s = s.slice(1); }
    if (s.charAt(0) === '+') s = s.slice(1);
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    var v = Math.round(parseFloat(s) * 100);
    return neg ? -v : v;
  }
  function mapColumns(header) {
    var h = header.map(function (x) { return String(x || '').trim().toLowerCase(); });
    function find(re, exclude) { return h.findIndex(function (x) { return re.test(x) && !(exclude && exclude.test(x)); }); }
    return {
      date: find(/(^|\s)date|^posted|^when$/),
      desc: find(/narrative|description|details|merchant|payee|particulars|memo|^transaction$/),
      debit: find(/debit|withdrawal|money out/),
      credit: find(/credit|deposit|money in/),
      amount: find(/amount|value/, /debit|credit|balance|withdrawal|deposit/)
    };
  }
  function guessColumns(rows) {
    var sample = rows.slice(0, 20), width = Math.max.apply(null, sample.map(function (r) { return r.length; }));
    var date = -1, amount = -1, desc = -1, bestLen = 0;
    for (var c = 0; c < width; c++) {
      var dates = 0, nums = 0, len = 0;
      sample.forEach(function (r) {
        var v = r[c];
        if (parseDate(v)) dates++;
        else if (parseMoney(v) != null) nums++;
        else len += String(v || '').length;
      });
      if (date < 0 && dates >= sample.length * 0.6) date = c;
      else if (amount < 0 && nums >= sample.length * 0.6) amount = c;
      else if (len > bestLen) { bestLen = len; desc = c; }
    }
    return { date: date, desc: desc, debit: -1, credit: -1, amount: amount };
  }
  /* rows -> {spends:[{date, desc, amount}], skipped, error?} */
  function rowsToSpends(rows) {
    if (!rows || !rows.length) return { error: 'That file looks empty.' };
    var hi = -1;
    for (var i = 0; i < Math.min(rows.length, 6); i++) {
      if (rows[i].some(function (c) { return /date/i.test(c); }) && rows[i].some(function (c) { return /amount|debit|credit|narrative|description|details/i.test(c); })) { hi = i; break; }
    }
    var map, data;
    if (hi >= 0) { map = mapColumns(rows[hi]); data = rows.slice(hi + 1); }
    else { map = guessColumns(rows); data = rows; }
    if (map.date < 0 || map.desc < 0 || (map.debit < 0 && map.amount < 0)) {
      return { error: "Couldn't find the date, description and amount columns in that file. Export it as CSV from online banking and try again." };
    }
    var negIsSpend = false;
    if (map.debit < 0) {
      negIsSpend = data.some(function (r) { var v = parseMoney(r[map.amount]); return v != null && v < 0; });
    }
    var spends = [], skipped = 0;
    data.forEach(function (r) {
      var date = parseDate(r[map.date]);
      var desc = String(r[map.desc] || '').replace(/\s+/g, ' ').trim();
      if (!date || !desc) { skipped++; return; }
      var amt = null;
      if (map.debit >= 0) {
        var d = parseMoney(r[map.debit]);
        if (d) amt = Math.abs(d);
      } else {
        var v = parseMoney(r[map.amount]);
        if (v != null && v !== 0) {
          if (negIsSpend) { if (v < 0) amt = -v; }
          else if (v > 0) amt = v;
        }
      }
      if (!amt) { skipped++; return; }
      spends.push({ date: date, desc: desc, amount: amt });
    });
    if (!spends.length) return { error: 'No spends found in that file. Payments and refunds are skipped.', skipped: skipped };
    return { spends: spends, skipped: skipped };
  }

  /* ---------- merchants ---------- */
  var NOISE = {};
  ('AUS AU AUSTRALIA NSW VIC QLD WA SA TAS ACT NT PTY LTD CARD PURCHASE EFTPOS VISA MASTERCARD DEBIT CREDIT POS TAP ' +
    'AND THE INT INTL REF VALUE DATE TRANSACTION PAYMENT SQ SP PAYPAL ZLR COM WWW HTTPS HTTP NET ORG HELP').split(' ')
    .forEach(function (w) { NOISE[w] = 1; });
  function tokens(desc) {
    var seen = {};
    return String(desc || '').toUpperCase().replace(/[^A-Z\s]/g, ' ').split(/\s+/)
      .filter(function (t) { if (t.length < 2 || NOISE[t] || seen[t]) return false; seen[t] = 1; return true; });
  }
  /* Stable key per shop, safe to use as a map key: "WOOLWORTHS", "UBER_EATS", "BP_CONNECT" */
  function merchantKey(desc) {
    var t = tokens(desc);
    if (!t.length) return String(desc || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) || 'UNKNOWN';
    if (t[0].length >= 4) return t[1] === 'EATS' ? t[0] + '_EATS' : t[0];
    return t.slice(0, 2).join('_');
  }
  function titleCase(s) { return s.toLowerCase().replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }); }
  /* "WOOLWORTHS 1234 NEWTOWN" -> "Woolworths Newtown"; short codes like BP or KFC stay in capitals. */
  function cleanTitle(desc) {
    var t = tokens(desc).slice(0, 3);
    if (!t.length) return String(desc || 'Spend').slice(0, 40);
    return t.map(function (w, i) {
      var acronym = w.length <= 3 && (!/[AEIOU]/.test(w) || (i === 0 && w.length === 2));
      return acronym ? w : titleCase(w);
    }).join(' ');
  }
  var HINTS = [
    ['groceries', ['WOOLWORTHS', 'COLES', 'ALDI', 'IGA', 'HARRIS', 'COSTCO', 'FOODWORKS', 'SUPERMARKET', 'GROCER']],
    ['eating out', ['CAFE', 'COFFEE', 'RESTAURANT', 'THAI', 'SUSHI', 'PIZZA', 'BURGER', 'EATS', 'MENULOG', 'DOORDASH', 'KITCHEN', 'BAR', 'BAKERY', 'NOODLE', 'DUMPLING', 'MCDONALDS', 'KFC', 'GUZMAN', 'BISTRO', 'GRILL', 'RAMEN', 'PUB', 'HOTEL BAR', 'BREWING']],
    ['date night', ['CINEMA', 'HOYTS', 'EVENT', 'PALACE', 'TICKETEK', 'TICKETMASTER', 'THEATRE', 'MOVIES']],
    ['home', ['BUNNINGS', 'IKEA', 'KMART', 'TARGET', 'BIGW', 'SPOTLIGHT', 'HARVEY', 'AMART', 'MITRE']],
    ['travel', ['QANTAS', 'JETSTAR', 'AIRBNB', 'BOOKING', 'EXPEDIA', 'AIRLINES', 'AIRWAYS']],
    ['transport', ['UBER', 'DIDI', 'OLA', 'OPAL', 'TRANSPORT', 'PARKING', 'WILSON', 'LINKT', 'BP', 'SHELL', 'AMPOL', 'CALTEX', 'METRO', 'TAXI', 'CABS']]
  ];
  var SYNONYMS = {
    'groceries': ['groceries', 'grocery', 'food shopping', 'supermarket'],
    'eating out': ['eating out', 'dining out', 'dining', 'restaurants', 'takeaway', 'food and drink'],
    'date night': ['date night', 'entertainment', 'fun', 'music'],
    'home': ['home', 'household', 'house'],
    'travel': ['travel', 'hotel', 'holiday', 'holidays', 'trips'],
    'transport': ['transport', 'gas/fuel', 'fuel', 'petrol', 'car', 'parking']
  };
  function guessCategory(desc, categories) {
    var t = tokens(desc), joined = ' ' + t.join(' ') + ' ';
    var cats = (categories || []).map(function (c) { return String(c); });
    for (var i = 0; i < HINTS.length; i++) {
      var hit = HINTS[i][1].some(function (w) { return joined.indexOf(' ' + w + ' ') >= 0; });
      if (hit) {
        var names = SYNONYMS[HINTS[i][0]] || [HINTS[i][0]];
        for (var j = 0; j < names.length; j++) {
          var match = cats.find(function (c) { return c.toLowerCase() === names[j]; });
          if (match) return match;
        }
        break;
      }
    }
    return 'Other';
  }

  function hash(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36);
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /* ---------- Splitwise exports ----------
     Date,Description,Category,Cost,Currency,<person>,<person>, then a "Total balance" row per currency.
     Each person column is what that person is up (+) or down (-) on the expense. */
  function isSplitwise(rows) {
    var h = (rows && rows[0] || []).map(function (x) { return String(x || '').trim().toLowerCase(); });
    return h.indexOf('cost') >= 0 && h.indexOf('currency') >= 0 && h.indexOf('description') >= 0 && h.indexOf('date') >= 0;
  }
  function parseSplitwise(rows) {
    if (!isSplitwise(rows)) return { error: "That doesn't look like a Splitwise export." };
    var h = rows[0].map(function (x) { return String(x || '').trim(); });
    var low = h.map(function (x) { return x.toLowerCase(); });
    var iD = low.indexOf('date'), iDesc = low.indexOf('description'), iCat = low.indexOf('category'), iCost = low.indexOf('cost'), iCur = low.indexOf('currency');
    var cols = [];
    for (var i = Math.max(iCost, iCur) + 1; i < h.length; i++) if (h[i]) cols.push(i);
    if (cols.length !== 2) {
      return { error: cols.length > 2 ? 'That Splitwise group has ' + cols.length + ' people. The app is for the two of you, so export a group with just you two.' : "Couldn't find the two people's columns in that Splitwise file." };
    }
    var people = [h[cols[0]], h[cols[1]]], out = [], totals = {}, seen = {}, from = null, to = null, curs = {};
    rows.slice(1).forEach(function (r) {
      if (!r || !r.some(function (x) { return String(x).trim() !== ''; })) return;
      var desc = String(r[iDesc] || '').trim(), cur = String(r[iCur] || '').trim().toUpperCase() || 'AUD';
      var n0 = parseMoney(r[cols[0]]), n1 = parseMoney(r[cols[1]]);
      if (/^total balance$/i.test(desc)) { totals[cur] = {}; totals[cur][people[0]] = n0 || 0; totals[cur][people[1]] = n1 || 0; return; }
      var date = parseDate(r[iD]), cost = parseMoney(r[iCost]);
      if (!date || !cost || n0 == null || n1 == null) return;
      cost = Math.abs(cost);
      var base = date + '|' + desc.toLowerCase() + '|' + cost + '|' + cur + '|' + Math.abs(n0);
      seen[base] = (seen[base] || 0) + 1;
      var nets = {}; nets[people[0]] = n0; nets[people[1]] = n1;
      out.push({ id: 'sw-' + hash(base) + '-' + seen[base], date: date, desc: desc.slice(0, 80), category: iCat >= 0 ? String(r[iCat] || '').trim() : '', cost: cost, currency: cur, nets: nets });
      curs[cur] = 1;
      if (!from || date < from) from = date;
      if (!to || date > to) to = date;
    });
    if (!out.length) return { error: 'No expenses found in that Splitwise file.' };
    return { people: people, rows: out, totals: totals, from: from, to: to, currencies: Object.keys(curs) };
  }
  /* Match Splitwise names to the app's two people by first name. Falls back to file order. */
  function mapPeople(people, names) {
    var first = function (s) { return String(s || '').trim().split(/\s+/)[0].toLowerCase(); };
    var map = {}, a = first(names.a), b = first(names.b);
    var pa = people.filter(function (p) { return first(p) === a; }), pb = people.filter(function (p) { return first(p) === b; });
    if (pa.length === 1 && pb.length === 1 && pa[0] !== pb[0]) { map[pa[0]] = 'a'; map[pb[0]] = 'b'; return { map: map, sure: true }; }
    map[people[0]] = 'a'; map[people[1]] = 'b';
    return { map: map, sure: false };
  }
  /* Turn parsed Splitwise groups into app entries. rates: units of each foreign currency per A$1.
     Foreign amounts are converted with running totals so the converted balance matches the total. */
  function buildSplitwise(groups, maps, rates) {
    var entries = [], net = { a: 0, b: 0 }, cats = {}, missing = {};
    groups.forEach(function (g, gi) {
      var map = maps[gi], nameA = Object.keys(map).filter(function (k) { return map[k] === 'a'; })[0];
      var run = {};
      g.rows.forEach(function (r) {
        var nA = r.nets[nameA], cost = r.cost, nAud = nA, costAud = cost;
        if (r.currency !== 'AUD') {
          var rate = rates && rates[r.currency];
          if (!(rate > 0)) { missing[r.currency] = 1; return; }
          var c = run[r.currency] || (run[r.currency] = { cost: 0, net: 0, costOut: 0, netOut: 0 });
          c.cost += cost; c.net += nA;
          var co = Math.round(c.cost / rate), no = Math.round(c.net / rate);
          costAud = co - c.costOut; nAud = no - c.netOut; c.costOut = co; c.netOut = no;
          if (costAud <= 0) costAud = 1;
          if (Math.abs(nAud) > costAud) nAud = nAud > 0 ? costAud : -costAud;
        }
        var paid, owed;
        if (nAud > 0) { paid = { a: costAud, b: 0 }; owed = { a: costAud - nAud, b: nAud }; }
        else if (nAud < 0) { paid = { a: 0, b: costAud }; owed = { a: -nAud, b: costAud + nAud }; }
        else { var half = Math.round(costAud / 2); paid = { a: half, b: costAud - half }; owed = { a: half, b: costAud - half }; }
        var isPay = /^payment$/i.test(r.category);
        /* Rent owed in full by one person is that person paying the other, not a shared spend. */
        var isRent = !isPay && /^rent$/i.test(r.category) && nAud !== 0 && Math.abs(nAud) === costAud;
        var cat = isPay ? null : isRent ? 'Rent' : (!r.category || /^general$/i.test(r.category) ? 'Other' : r.category.slice(0, 24));
        if (cat && cat !== 'Other' && !isRent) cats[cat] = (cats[cat] || 0) + 1;
        entries.push({
          id: r.id, kind: isPay ? 'settlement' : isRent ? 'rent' : 'expense', source: 'splitwise', status: 'shared', date: r.date, title: r.desc,
          raw: null, key: null, amount: costAud, items: null, parts: null,
          payer: isRent ? (nAud > 0 ? 'b' : 'a') : nAud > 0 ? 'a' : nAud < 0 ? 'b' : 'both', splitA: costAud ? Math.round(owed.a / costAud * 100) : 50,
          paid: paid, owed: owed, onCard: false, category: cat, dupOf: null,
          orig: r.currency !== 'AUD' ? { amount: cost, currency: r.currency, rate: rates[r.currency] } : null, by: null
        });
        net.a += paid.a - owed.a; net.b += paid.b - owed.b;
      });
    });
    return { entries: entries, net: net, cats: Object.keys(cats).sort(function (x, y) { return cats[y] - cats[x]; }), missing: Object.keys(missing) };
  }

  /* ---------- card points ----------
     Westpac Altitude Black, published rates from 30 Sep 2026. Dining moved to "all other purchases" on that date. */
  var CARD_PRESETS = {
    qantas: { unit: 'Qantas Points', program: 'Qantas', rates: { intl: 1.5, everyday: 0.8, other: 0.4, after: 0.25 }, ratio: 1 },
    velocity: { unit: 'Velocity Points', program: 'Velocity', rates: { intl: 1.5, everyday: 0.8, other: 0.4, after: 0.25 }, ratio: 1 },
    altitude: { unit: 'Altitude Points', program: 'Velocity', rates: { intl: 3, everyday: 2, other: 1, after: 0.5 }, ratio: 3 }
  };
  var THRESHOLD = 1000000; /* $10,000 per statement cycle, in cents */
  var EVERYDAY_SHOPS = ['WOOLWORTHS', 'WOOLIES', 'COLES', 'IGA', 'HARRIS', 'ALDI', 'KMART', 'TARGET', 'BIGW', 'MYER', 'JONES',
    'ELEVEN', 'SHELL', 'AMPOL', 'CALTEX', 'BP', 'PETROLEUM', 'ORIGIN', 'AGL', 'ENERGYAUSTRALIA', 'TELSTRA', 'OPTUS', 'VODAFONE',
    'TPG', 'IINET', 'BELONG', 'NETFLIX', 'SPOTIFY', 'STAN', 'BINGE', 'FOXTEL', 'KAYO'];
  var EVERYDAY_CATS = ['groceries', 'grocery', 'supermarket', 'supermarkets', 'gas/fuel', 'fuel', 'petrol', 'water', 'heat/gas',
    'electricity', 'power', 'utilities', 'tv/phone/internet', 'internet', 'phone', 'mobile', 'streaming', 'department stores'];
  /* intl: paid in another currency; everyday: supermarkets, department stores, petrol, utilities; other: the rest */
  function spendType(e) {
    if (e.orig && e.orig.currency && e.orig.currency !== 'AUD') return 'intl';
    if (e.raw) {
      var t = ' ' + tokens(e.raw).join(' ') + ' ';
      if (EVERYDAY_SHOPS.some(function (w) { return t.indexOf(' ' + w + ' ') >= 0; }) || /\bBIG W\b|DAVID JONES|7-ELEVEN/i.test(e.raw)) return 'everyday';
    }
    return EVERYDAY_CATS.indexOf(String(e.category || '').toLowerCase()) >= 0 ? 'everyday' : 'other';
  }
  /* Points for spends on the card. The $10,000 step-down is applied per calendar month, as statement dates aren't known. */
  function estimatePoints(entries, card) {
    var preset = card && CARD_PRESETS[card.earns];
    var rates = card && card.rates && typeof card.rates === 'object' ? card.rates : preset ? preset.rates : null;
    if (!rates && card && card.rate > 0) rates = { intl: card.rate, everyday: card.rate, other: card.rate, after: card.rate };
    if (!rates) return null;
    var ratio = card.earns === 'altitude' ? (card.ratio > 0 ? card.ratio : 3) : 1;
    var used = {}, out = { points: 0, ratio: ratio, byType: { intl: 0, everyday: 0, other: 0 }, over: 0 };
    entries.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }).forEach(function (e) {
      var type = spendType(e), m = e.date.slice(0, 7), u = used[m] || 0;
      var under = Math.max(0, Math.min(e.amount, THRESHOLD - u)), over = e.amount - under;
      used[m] = u + e.amount;
      out.points += under / 100 * (Number(rates[type]) || 0) + over / 100 * (rates.after != null ? Number(rates.after) || 0 : Number(rates[type]) || 0);
      out.byType[type] += e.amount; out.over += over;
    });
    out.points = Math.round(out.points);
    out.velocity = Math.round(out.points / ratio);
    return out;
  }

  /* Import ids are deterministic so the same statement can be imported twice safely. */
  function importIds(spends) {
    var seen = {};
    return spends.map(function (s) {
      var base = s.date + '|' + s.amount + '|' + s.desc.toUpperCase();
      seen[base] = (seen[base] || 0) + 1;
      return 'imp-' + hash(base) + '-' + seen[base];
    });
  }

  /* Monday-first month grid: date strings with null padding. */
  function monthGrid(y, m) {
    var lead = (new Date(y, m, 1).getDay() + 6) % 7, n = daysInMonth(y, m), cells = [], i;
    for (i = 0; i < lead; i++) cells.push(null);
    for (i = 1; i <= n; i++) cells.push(ymd(new Date(y, m, i)));
    while (cells.length % 7) cells.push(null);
    return cells;
  }
  function fmtDay(s) { var d = parseYmd(s); return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function fmtDayLong(s) { var d = parseYmd(s); return DAYS_FULL[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS_FULL[d.getMonth()]; }

  function entriesToCSV(entries, names) {
    var head = ['Date', 'What', 'Category', 'Amount', 'Status', names.a + ' paid', names.b + ' paid', names.a + "'s share", names.b + "'s share", 'Source', 'Bank description', 'Lines'];
    var rows = (entries || []).slice().sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; }).map(function (e) {
      var p = e.paid || {}, o = e.owed || {};
      var status = e.kind === 'settlement' ? 'Payment between you' : e.kind === 'rent' ? 'Rent' : e.status === 'shared' ? 'Shared' : e.status === 'personal' ? 'Personal' : 'To check';
      function d(c) { return ((c || 0) / 100).toFixed(2); }
      var lines = e.items && e.items.length > 1 ? e.items.map(function (a, i) { var n = e.notes && e.notes[i]; return (n ? n + ' ' : '') + d(a); }).join('; ')
        : e.parts && e.parts.length > 1 ? e.parts.map(function (x) { return (x.label ? x.label + ' ' : '') + d(x.amount); }).join('; ') : '';
      return [e.date, e.title, e.category || '', d(e.amount), status, d(p.a), d(p.b), d(o.a), d(o.b), e.source || '', e.raw || '', lines].map(csvCell).join(',');
    });
    return head.map(csvCell).join(',') + '\n' + rows.join('\n') + '\n';
  }

  /* ---------- deals ---------- */
  var ORD = ['1st', '2nd', '3rd', '4th', 'Last'];
  /* The date of the nth weekday (0 = Sunday) in a month. n = 5 means the last one. */
  function nthWeekday(y, m, n, dow) {
    var d;
    if (n >= 5) { d = new Date(y, m + 1, 0); while (d.getDay() !== dow) d.setDate(d.getDate() - 1); return ymd(d); }
    d = new Date(y, m, 1);
    while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
    d.setDate(d.getDate() + 7 * (Math.max(1, n) - 1));
    return d.getMonth() === m ? ymd(d) : null;
  }
  /* Every date a sale day falls on from one date to another, inclusive. A rule is once on a date, every week on a
     weekday, every month on a date (the last day in shorter months), or every month on the nth weekday. */
  function saleDates(rule, from, to) {
    var re = /^\d{4}-\d{2}-\d{2}$/, out = [];
    if (!rule || !re.test(from || '') || !re.test(to || '') || from > to) return out;
    var lo = re.test(rule.start || '') && rule.start > from ? rule.start : from;
    var hi = re.test(rule.until || '') && rule.until < to ? rule.until : to;
    if (lo > hi) return out;
    if (rule.k === 'once') return re.test(rule.date || '') && rule.date >= lo && rule.date <= hi ? [rule.date] : out;
    if (rule.k === 'weekly') return weeklyDates(lo, clamp(rule.dow, 0, 6), hi);
    if (rule.k !== 'nth' && rule.k !== 'monthly') return out;
    var a = parseYmd(lo), y = a.getFullYear(), m = a.getMonth(), g = 0, d, nx;
    while (g++ < 240 && ymd(new Date(y, m, 1)) <= hi) {
      d = rule.k === 'nth' ? nthWeekday(y, m, clamp(rule.n, 1, 5), clamp(rule.dow, 0, 6))
        : ymd(new Date(y, m, Math.min(clamp(rule.day, 1, 31), daysInMonth(y, m))));
      if (d && d >= lo && d <= hi) out.push(d);
      nx = addMonths(y, m, 1); y = nx[0]; m = nx[1];
    }
    return out;
  }
  function ordinalDay(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function saleRuleLabel(rule) {
    if (!rule) return '';
    if (rule.k === 'once') return 'One day only';
    if (rule.k === 'weekly') return 'Every ' + DAYS_FULL[clamp(rule.dow, 0, 6)];
    if (rule.k === 'monthly') return 'The ' + ordinalDay(clamp(rule.day, 1, 31)) + ' of every month';
    if (rule.k === 'nth') return ORD[clamp(rule.n, 1, 5) - 1] + ' ' + DAYS_FULL[clamp(rule.dow, 0, 6)] + ' of every month';
    return '';
  }
  /* One name per store, so "WW", "Woolies" and "WOOLWORTHS 1234 MACQUARIE" all count as Woolworths. */
  var STORES = [
    ['Coles', /\bcoles\b|^cl$/i], ['Woolworths', /\bwoolworths\b|\bwoolies\b|^ww$/i], ['Harris Farm', /\bharris ?farm/i],
    ['ALDI', /\baldi\b/i], ['Costco', /\bcostco\b/i], ['IGA', /\biga\b/i], ['Lucky Mart', /\blucky ?mart\b/i], ['Umall', /\bumall\b/i]
  ];
  function storeName(s) {
    s = String(s || '').trim();
    for (var i = 0; i < STORES.length; i++) if (STORES[i][1].test(s)) return STORES[i][0];
    return s;
  }
  /* Which watch words a special's name matches. A word matches at the start of a word in the name, ignoring case,
     punctuation and a plural s, so "tim tams" finds "Tim Tam Original". Longer single words also match run together,
     so "weetbix" finds "Weet-Bix". */
  var squash = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); };
  function watchHits(name, words) {
    var n = ' ' + String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ', flat = squash(name), out = [];
    (words || []).forEach(function (w) {
      var k = String(w || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (k.length > 3) k = k.replace(/s$/, '');
      if (!k) return;
      if (n.indexOf(' ' + k) >= 0 || (k.indexOf(' ') < 0 && k.length >= 6 && flat.indexOf(squash(k)) >= 0)) out.push(w);
    });
    return out;
  }
  /* How long since an item was last this cheap, in weeks, from text like "11 weeks ago @ WW". Never counts as long ago. */
  function weeksSince(s) {
    s = String(s || '');
    if (/never|first/i.test(s)) return 99;
    var m = /(\d+)\s*(day|week|wk|month|year)/i.exec(s);
    if (!m) return 0;
    var n = Number(m[1]), u = m[2].toLowerCase();
    return u === 'day' ? n / 7 : u === 'month' ? n * 4.3 : u === 'year' ? n * 52 : n;
  }
  /* Specials in the order worth looking at: ones on your watch list first, then the biggest saving by percent,
     then the ones that haven't been this cheap for longest. */
  function sortSpecials(list, words) {
    return (list || []).map(function (x, i) { return { x: x, i: i, hit: watchHits(x.n, words).length ? 1 : 0 }; })
      .sort(function (a, b) { return (b.hit - a.hit) || ((b.x.off || 0) - (a.x.off || 0)) || (weeksSince(b.x.last) - weeksSince(a.x.last)) || (a.i - b.i); })
      .map(function (o) { return o.x; });
  }
  /* The Wednesday-to-Tuesday week that supermarket specials run in, for a date. */
  function specialsWeek(s) {
    var back = (parseYmd(s).getDay() + 4) % 7, from = addDays(s, -back);
    return { from: from, to: addDays(from, 6) };
  }

  var L = {
    MONTHS: MONTHS, MONTHS_FULL: MONTHS_FULL, DAYS: DAYS, DAYS_FULL: DAYS_FULL,
    nthWeekday: nthWeekday, saleDates: saleDates, saleRuleLabel: saleRuleLabel, ordinalDay: ordinalDay, storeName: storeName,
    watchHits: watchHits, weeksSince: weeksSince, sortSpecials: sortSpecials, specialsWeek: specialsWeek,
    pad: pad, ymd: ymd, parseYmd: parseYmd, addDays: addDays, addMonths: addMonths, daysInMonth: daysInMonth,
    daysBetweenInclusive: daysBetweenInclusive, clamp: clamp,
    toCents: toCents, fmt: fmt, fmtRound: fmtRound, fmtShort: fmtShort, parseMoneyInput: parseMoneyInput, parseExpr: parseExpr,
    splitOwed: splitOwed, isSpend: isSpend, counts: counts, netBalances: netBalances, weeklyDates: weeklyDates,
    periodFor: periodFor, shiftPeriod: shiftPeriod, periodLabel: periodLabel, inPeriod: inPeriod,
    parseCSV: parseCSV, parseDate: parseDate, parseMoney: parseMoney, mapColumns: mapColumns, rowsToSpends: rowsToSpends,
    merchantKey: merchantKey, cleanTitle: cleanTitle, guessCategory: guessCategory, hash: hash, csvCell: csvCell,
    importIds: importIds, monthGrid: monthGrid, fmtDay: fmtDay, fmtDayLong: fmtDayLong, entriesToCSV: entriesToCSV,
    isSplitwise: isSplitwise, parseSplitwise: parseSplitwise, mapPeople: mapPeople, buildSplitwise: buildSplitwise,
    CARD_PRESETS: CARD_PRESETS, spendType: spendType, estimatePoints: estimatePoints
  };
  root.L = L;
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
})(typeof window !== 'undefined' ? window : globalThis);
