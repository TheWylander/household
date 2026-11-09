const L = require('../src/logic.js');
const assert = require('assert');
let passed = 0;
function t(name, fn) {
  try { fn(); passed++; } catch (e) { console.error('FAIL', name, '\n ', e.message); process.exitCode = 1; }
}

t('parseExpr sums', () => {
  const r = L.parseExpr('42.50 + 11 + 14');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.total, 6750);
  assert.deepStrictEqual(r.items, [4250, 1100, 1400]);
  assert.strictEqual(L.parseExpr('12.345').ok, false);
  assert.strictEqual(L.parseExpr('abc').ok, false);
  assert.strictEqual(L.parseExpr('').total, 0);
  assert.strictEqual(L.parseExpr('5+').total, 500);
  assert.strictEqual(L.parseExpr('$1,200 + 3').total, 120300);
  assert.strictEqual(L.parseExpr('12.').total, 1200);
  assert.strictEqual(L.parseExpr('0.1 + 0.2').total, 30);
});

t('money format', () => {
  assert.strictEqual(L.fmt(165700), '$1,657.00');
  assert.strictEqual(L.fmt(-11335), '-$113.35');
  assert.strictEqual(L.fmtRound(165749), '$1,657');
  assert.strictEqual(L.parseMoneyInput('$2,000'), 200000);
  assert.strictEqual(L.parseMoneyInput('2000.5'), 200050);
  assert.strictEqual(L.parseMoneyInput('abc'), null);
  assert.strictEqual(L.parseMoneyInput(''), null);
});

t('split and balances', () => {
  assert.deepStrictEqual(L.splitOwed(1001, 50), { a: 501, b: 500 });
  assert.deepStrictEqual(L.splitOwed(1000, 60), { a: 600, b: 400 });
  const seeds = Array.from({ length: 200 }, (_, i) => 'm-' + i).map((s) => L.splitOwed(1001, 50, s).a);
  const ups = seeds.filter((a) => a === 501).length;
  assert.ok(ups > 60 && ups < 140, 'odd cents spread between both: ' + ups);
  assert.strictEqual(L.splitOwed(1001, 50, 'x').a + L.splitOwed(1001, 50, 'x').b, 1001);
  const entries = [
    { kind: 'expense', status: 'shared', amount: 10000, paid: { b: 10000 }, owed: L.splitOwed(10000, 50) },
    { kind: 'expense', status: 'shared', amount: 2670, paid: { b: 2670 }, owed: L.splitOwed(2670, 50) },
    { kind: 'expense', status: 'personal', amount: 5000, paid: { b: 5000 }, owed: { b: 5000 } },
    { kind: 'expense', status: 'check', amount: 9000, paid: { b: 9000 }, owed: L.splitOwed(9000, 50) },
    { kind: 'expense', status: 'shared', amount: 4000, paid: { a: 2000, b: 2000 }, owed: { a: 2000, b: 2000 } }
  ];
  let n = L.netBalances(entries);
  assert.deepStrictEqual(n, { a: -6335, b: 6335 });
  entries.push({ kind: 'settlement', amount: 6335, paid: { a: 6335 }, owed: { b: 6335 } });
  n = L.netBalances(entries);
  assert.deepStrictEqual(n, { a: 0, b: 0 });
});

t('budget periods', () => {
  let p = L.periodFor('2026-11-08', 1);
  assert.strictEqual(p.start, '2026-11-01'); assert.strictEqual(p.end, '2026-11-30');
  p = L.periodFor('2026-11-08', 15);
  assert.strictEqual(p.start, '2026-10-15'); assert.strictEqual(p.end, '2026-11-14');
  p = L.periodFor('2026-11-15', 15);
  assert.strictEqual(p.start, '2026-11-15'); assert.strictEqual(p.end, '2026-12-14');
  p = L.periodFor('2027-01-03', 8);
  assert.strictEqual(p.start, '2026-12-08'); assert.strictEqual(p.end, '2027-01-07');
  const n1 = L.shiftPeriod(p, 1);
  assert.strictEqual(n1.start, '2027-01-08'); assert.strictEqual(n1.end, '2027-02-07');
  const prev = L.shiftPeriod(L.periodFor('2026-11-08', 1), -1);
  assert.strictEqual(prev.start, '2026-10-01'); assert.strictEqual(prev.end, '2026-10-31');
  assert.strictEqual(L.periodLabel(L.periodFor('2026-11-08', 1), '2026-11-08'), 'November');
  assert.strictEqual(L.periodLabel(L.periodFor('2026-11-08', 8), '2026-11-08'), '8 Nov to 7 Dec');
  assert.strictEqual(L.daysBetweenInclusive('2026-11-08', '2026-11-30'), 23);
  const feb = L.periodFor('2027-02-20', 1);
  assert.strictEqual(feb.end, '2027-02-28');
});

t('dates', () => {
  assert.strictEqual(L.parseDate('07/11/2026'), '2026-11-07');
  assert.strictEqual(L.parseDate('7/11/26'), '2026-11-07');
  assert.strictEqual(L.parseDate('2026-11-07'), '2026-11-07');
  assert.strictEqual(L.parseDate('07 Nov 2026'), '2026-11-07');
  assert.strictEqual(L.parseDate('31/02/2026'), null);
  assert.strictEqual(L.parseDate('hello'), null);
  assert.strictEqual(L.fmtDay('2026-11-08'), 'Sun 8 Nov');
  const g = L.monthGrid(2026, 10);
  assert.strictEqual(g.length % 7, 0);
  assert.strictEqual(g[6], '2026-11-01'); // Nov 2026 starts on a Sunday
  assert.strictEqual(g.filter(Boolean).length, 30);
});

const westpac = [
  'Bank Account,Date,Narrative,Debit Amount,Credit Amount,Balance,Categories,Serial',
  '123456789,07/11/2026,"WOOLWORTHS 1234 SYDNEY NSW AUS",86.40,,,OTHER,',
  '123456789,07/11/2026,"UBER *EATS HELP.UBER.COM AUS",32.10,,,OTHER,',
  '123456789,07/11/2026,"UBER *EATS HELP.UBER.COM AUS",32.10,,,OTHER,',
  '123456789,06/11/2026,"PAYMENT RECEIVED, THANK YOU",,"1,500.00",,PAYMENT,',
  '123456789,05/11/2026,"BUNNINGS 382000 ALEXANDRIA",54.95,,,OTHER,',
  '123456789,04/11/2026,"SQ *BEAN THERE CAFE SYDNEY",9.50,,,OTHER,',
  '123456789,03/11/2026,"BP CONNECT ERSKINEVILLE",61.20,,,OTHER,'
].join('\r\n');

t('Westpac CSV', () => {
  const rows = L.parseCSV('﻿' + westpac);
  assert.strictEqual(rows.length, 8);
  const r = L.rowsToSpends(rows);
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.spends.length, 6);
  assert.strictEqual(r.skipped, 1);
  assert.deepStrictEqual(r.spends[0], { date: '2026-11-07', desc: 'WOOLWORTHS 1234 SYDNEY NSW AUS', amount: 8640 });
  const ids = L.importIds(r.spends);
  assert.notStrictEqual(ids[1], ids[2]);
  assert.deepStrictEqual(L.importIds(r.spends), ids); // stable on re-import
  assert.strictEqual(L.merchantKey('WOOLWORTHS 1234 SYDNEY NSW AUS'), 'WOOLWORTHS');
  assert.strictEqual(L.merchantKey('UBER *EATS HELP.UBER.COM AUS'), 'UBER_EATS');
  assert.strictEqual(L.merchantKey('UBER *TRIP HELP.UBER.COM'), 'UBER');
  assert.strictEqual(L.merchantKey('BP CONNECT ERSKINEVILLE'), 'BP_CONNECT');
  assert.strictEqual(L.merchantKey('SQ *BEAN THERE CAFE SYDNEY'), 'BEAN');
  assert.strictEqual(L.cleanTitle('UBER *EATS HELP.UBER.COM AUS'), 'Uber Eats');
  assert.strictEqual(L.cleanTitle('WOOLWORTHS 1234 SYDNEY NSW AUS'), 'Woolworths Sydney');
  const cats = ['Groceries', 'Eating out', 'Home'];
  assert.strictEqual(L.guessCategory('WOOLWORTHS 1234 SYDNEY', cats), 'Groceries');
  assert.strictEqual(L.guessCategory('UBER *EATS', cats), 'Eating out');
  assert.strictEqual(L.guessCategory('BUNNINGS 382000', cats), 'Home');
  assert.strictEqual(L.guessCategory('BP CONNECT', cats), 'Other'); // no Transport category set
  assert.strictEqual(L.guessCategory('WOOLWORTHS', []), 'Other');
});

t('single amount column, negatives are spends', () => {
  const csv = 'Date,Description,Amount\n07/11/2026,COLES 0812,-45.20\n06/11/2026,REFUND COLES,12.00\n';
  const r = L.rowsToSpends(L.parseCSV(csv));
  assert.strictEqual(r.spends.length, 1);
  assert.strictEqual(r.spends[0].amount, 4520);
  assert.strictEqual(r.skipped, 1);
});

t('headerless file', () => {
  const csv = '07/11/2026,"COLES 0812 NEWTOWN",45.20\n06/11/2026,"ALDI STORES",30.00\n05/11/2026,"IGA X",12.00\n';
  const r = L.rowsToSpends(L.parseCSV(csv));
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.spends.length, 3);
  assert.strictEqual(r.spends[0].desc, 'COLES 0812 NEWTOWN');
});

t('bad file', () => {
  assert.ok(L.rowsToSpends(L.parseCSV('just some text\nmore text')).error);
  assert.ok(L.rowsToSpends([]).error);
});

t('csv export', () => {
  const out = L.entriesToCSV([{ date: '2026-11-07', title: 'Dinner, "Mama\'s"', category: 'Eating out', amount: 6750, kind: 'expense', status: 'shared', paid: { b: 6750 }, owed: { a: 3375, b: 3375 }, source: 'manual' }], { a: 'Robin', b: 'Jules' });
  assert.ok(out.includes('"Dinner, ""Mama\'s"""'));
  assert.ok(out.startsWith('Date,What,Category,Amount,Status,Robin paid'));
});

t('Altitude Black points', () => {
  const d = (date, amount, extra) => Object.assign({ date, amount, kind: 'expense', status: 'shared' }, extra);
  assert.strictEqual(L.spendType(d('2026-11-01', 100, { raw: 'WOOLWORTHS 1234 NEWTOWN', category: 'Other' })), 'everyday');
  assert.strictEqual(L.spendType(d('2026-11-01', 100, { raw: 'BP CONNECT ERSKINEVILLE' })), 'everyday');
  assert.strictEqual(L.spendType(d('2026-11-01', 100, { raw: 'SQ *BEAN THERE CAFE', category: 'Dining out' })), 'other');
  assert.strictEqual(L.spendType(d('2026-11-01', 100, { category: 'Groceries' })), 'everyday');
  assert.strictEqual(L.spendType(d('2026-11-01', 100, { category: 'Water' })), 'everyday');
  assert.strictEqual(L.spendType(d('2026-11-01', 100, { category: 'Rent' })), 'other');
  assert.strictEqual(L.spendType(d('2025-12-16', 100, { orig: { currency: 'JPY', amount: 926000 } })), 'intl');
  const list = [d('2026-11-01', 10000, { category: 'Groceries' }), d('2026-11-02', 10000, { category: 'Dining out' }), d('2026-11-03', 10000, { orig: { currency: 'JPY' } })];
  const v = L.estimatePoints(list, { earns: 'velocity' });
  assert.strictEqual(v.points, 80 + 40 + 150); assert.strictEqual(v.velocity, 270);
  const a = L.estimatePoints(list, { earns: 'altitude', ratio: 3 });
  assert.strictEqual(a.points, 200 + 100 + 300); assert.strictEqual(a.velocity, 200);
  // above $10,000 in a month earns the lower rate
  const big = L.estimatePoints([d('2026-11-01', 900000, { category: 'Groceries' }), d('2026-11-05', 300000, { category: 'Groceries' })], { earns: 'velocity' });
  assert.strictEqual(big.points, Math.round(9000 * 0.8 + 1000 * 0.8 + 2000 * 0.25));
  assert.strictEqual(L.estimatePoints(list, { earns: 'qantas' }).points, 270);
  assert.strictEqual(L.estimatePoints(list, { earns: null }), null);
  assert.strictEqual(L.estimatePoints(list, { rate: 0.5 }).points, 150);
});

t('weekly dates for rent', () => {
  assert.deepStrictEqual(L.weeklyDates('2026-11-01', 0, '2026-11-08'), ['2026-11-01', '2026-11-08']);
  assert.deepStrictEqual(L.weeklyDates('2026-11-02', 0, '2026-11-08'), ['2026-11-08']);
  assert.deepStrictEqual(L.weeklyDates('2026-11-01', 0, '2026-11-07'), ['2026-11-01']);
  assert.deepStrictEqual(L.weeklyDates('2026-11-09', 0, '2026-11-08'), []);
  assert.deepStrictEqual(L.weeklyDates('', 0, '2026-11-08'), []);
  assert.deepStrictEqual(L.weeklyDates('2026-03-29', 0, '2026-04-12'), ['2026-03-29', '2026-04-05', '2026-04-12'], 'steps over the daylight saving change');
  assert.deepStrictEqual(L.weeklyDates('2026-11-01', 3, '2026-11-19'), ['2026-11-04', '2026-11-11', '2026-11-18']);
});

t('sale days repeat by rule', () => {
  assert.strictEqual(L.nthWeekday(2026, 10, 2, 6), '2026-11-14', '2nd Saturday of November 2026');
  assert.strictEqual(L.nthWeekday(2026, 11, 2, 6), '2026-12-12');
  assert.strictEqual(L.nthWeekday(2027, 0, 2, 6), '2027-01-09');
  assert.strictEqual(L.nthWeekday(2026, 10, 5, 5), '2026-11-27', 'last Friday');
  assert.strictEqual(L.nthWeekday(2026, 10, 1, 0), '2026-11-01', 'a month that starts on the day');
  const lucky = { k: 'nth', n: 2, dow: 6 };
  assert.deepStrictEqual(L.saleDates(lucky, '2026-11-01', '2027-01-31'), ['2026-11-14', '2026-12-12', '2027-01-09']);
  assert.deepStrictEqual(L.saleDates(Object.assign({ start: '2026-11-15' }, lucky), '2026-11-01', '2027-01-31'), ['2026-12-12', '2027-01-09'], 'not before it was added');
  assert.deepStrictEqual(L.saleDates(Object.assign({ until: '2026-12-31' }, lucky), '2026-11-01', '2027-01-31'), ['2026-11-14', '2026-12-12']);
  assert.deepStrictEqual(L.saleDates({ k: 'monthly', day: 31 }, '2027-01-01', '2027-03-31'), ['2027-01-31', '2027-02-28', '2027-03-31'], 'short months use their last day');
  assert.deepStrictEqual(L.saleDates({ k: 'weekly', dow: 3 }, '2026-11-09', '2026-11-22'), ['2026-11-11', '2026-11-18']);
  assert.deepStrictEqual(L.saleDates({ k: 'once', date: '2026-11-28' }, '2026-11-01', '2026-11-30'), ['2026-11-28']);
  assert.deepStrictEqual(L.saleDates({ k: 'once', date: '2026-12-28' }, '2026-11-01', '2026-11-30'), []);
  assert.deepStrictEqual(L.saleDates({ k: 'nope' }, '2026-11-01', '2026-11-30'), []);
  assert.deepStrictEqual(L.saleDates(lucky, '2026-11-30', '2026-11-01'), []);
  assert.strictEqual(L.saleRuleLabel(lucky), '2nd Saturday of every month');
  assert.strictEqual(L.saleRuleLabel({ k: 'nth', n: 5, dow: 5 }), 'Last Friday of every month');
  assert.strictEqual(L.saleRuleLabel({ k: 'weekly', dow: 3 }), 'Every Wednesday');
  assert.strictEqual(L.saleRuleLabel({ k: 'monthly', day: 22 }), 'The 22nd of every month');
  assert.strictEqual(L.saleRuleLabel({ k: 'monthly', day: 11 }), 'The 11th of every month');
  assert.strictEqual(L.saleRuleLabel({ k: 'once', date: '2026-11-28' }), 'One day only');
});

t('specials: stores, watch words and order', () => {
  assert.strictEqual(L.storeName('WW'), 'Woolworths');
  assert.strictEqual(L.storeName('Woolies'), 'Woolworths');
  assert.strictEqual(L.storeName('WOOLWORTHS 1234 MACQUARIE PARK'), 'Woolworths');
  assert.strictEqual(L.storeName('Liquorland via Coles Online'), 'Liquorland', 'Liquorland, even when it is sold through Coles Online');
  assert.strictEqual(L.storeName('Coles Online'), 'Coles');
  assert.strictEqual(L.storeName('Australian Meat Emporium'), 'Meat Emporium');
  assert.strictEqual(L.storeName('United Meat Co'), 'United Meat Co');
  assert.strictEqual(L.storeName('CL'), 'Coles');
  assert.strictEqual(L.storeName('Harris Farm Markets'), 'Harris Farm');
  assert.strictEqual(L.storeName('Some Deli'), 'Some Deli');
  assert.deepStrictEqual(L.watchHits('Sanitarium Weet-Bix 575g', ['weetbix', 'milk']), ['weetbix']);
  assert.deepStrictEqual(L.watchHits('Buttermilk Pancake Mix', ['milk']), [], 'milk is not buttermilk');
  assert.deepStrictEqual(L.watchHits('Pauls Full Cream Milk 2L', ['Milk']), ['Milk']);
  assert.deepStrictEqual(L.watchHits("Arnott's Tim Tam Original 200g", ['tim tams']), ['tim tams'], 'plural s');
  assert.deepStrictEqual(L.watchHits('Vittoria Espresso Coffee Beans 1kg', ['coffee beans', 'tea']), ['coffee beans']);
  assert.deepStrictEqual(L.watchHits('Anything', ['', '  ']), []);
  assert.strictEqual(L.weeksSince('11 weeks ago @ WW'), 11);
  assert.strictEqual(L.weeksSince('Never'), 99);
  assert.ok(Math.abs(L.weeksSince('3 months ago @ CL') - 12.9) < 1e-9);
  assert.strictEqual(L.weeksSince(''), 0);
  const list = [
    { n: 'Muffins', off: 50, last: '1 week ago @ WW' },
    { n: 'Nappies', off: 50, last: '6 weeks ago @ CL' },
    { n: 'Weet-Bix 575g', off: 50, last: '11 weeks ago @ WW' },
    { n: 'Coffee pods', off: 40, last: '' },
    { n: 'Chocolate', off: 55, last: '' }
  ];
  assert.deepStrictEqual(L.sortSpecials(list, ['coffee']).map((x) => x.n), ['Coffee pods', 'Chocolate', 'Weet-Bix 575g', 'Nappies', 'Muffins']);
  assert.deepStrictEqual(L.specialsWeek('2026-11-09'), { from: '2026-11-04', to: '2026-11-10' }, 'Monday is in the week from last Wednesday');
  assert.deepStrictEqual(L.specialsWeek('2026-11-11'), { from: '2026-11-11', to: '2026-11-17' }, 'Wednesday starts a new week');
  assert.deepStrictEqual(L.specialsWeek('2026-11-10'), { from: '2026-11-04', to: '2026-11-10' });
});

console.log(passed + ' groups passed');
