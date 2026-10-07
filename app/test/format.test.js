var test = require('node:test');
var assert = require('node:assert/strict');
var format = require('../lib/format');

test('formatMoney: kopecks to hryvnia with thousands separator', function () {
  assert.equal(format.formatMoney(123450), '1 234,50 грн');
  assert.equal(format.formatMoney(5), '0,05 грн');
  assert.equal(format.formatMoney(-12000), '-120,00 грн');
  assert.equal(format.formatMoney(null), '');
});

test('formatDecimal: kopecks to a machine-readable amount', function () {
  assert.equal(format.formatDecimal(123450), '1234.50');
  assert.equal(format.formatDecimal(7), '0.07');
  assert.equal(format.formatDecimal(0), '0.00');
});

test('formatText: trims and strips separators', function () {
  assert.equal(format.formatText('  ТОВ «Зелений Кут»; філія\n2 '), 'ТОВ «Зелений Кут» філія 2');
  assert.equal(format.formatText(undefined), '');
});

test('formatPercent', function () {
  assert.equal(format.formatPercent(20), '20%');
});

// Characterization (BILL-482): pins formatDate's current MM/DD/YYYY output
// before the switch to the Ukrainian дд.мм.рррр format. See docs/impact.md —
// lib/export/accounting.js depends on exactly this shape and must keep
// receiving it even after the ticket.
test('formatDate: current output is MM/DD/YYYY (characterization, BILL-482)', function () {
  assert.equal(format.formatDate('2026-03-09'), '03/09/2026');
  assert.equal(format.formatDate('2026-01-05'), '01/05/2026');
  assert.equal(format.formatDate(new Date('2026-03-09T00:00:00Z')), '03/09/2026');
  assert.equal(format.formatDate(''), '');
  assert.equal(format.formatDate(null), '');
  assert.equal(format.formatDate('not-a-date'), '');
});

// BILL-482: the new customer-facing formatter. Same inputs as formatDate
// above, so the two can be read side by side; same empty/invalid handling.
test('formatDateUa: дд.мм.рррр for customers (BILL-482)', function () {
  assert.equal(format.formatDateUa('2026-03-09'), '09.03.2026');
  assert.equal(format.formatDateUa('2026-01-05'), '05.01.2026');
  assert.equal(format.formatDateUa('2026-12-03'), '03.12.2026');
  assert.equal(format.formatDateUa(new Date('2026-03-09T00:00:00Z')), '09.03.2026');
  assert.equal(format.formatDateUa(''), '');
  assert.equal(format.formatDateUa(null), '');
  assert.equal(format.formatDateUa('not-a-date'), '');
});

// Task E (mutation testing, docs/task-e-bonus.md): two mutants in lib/format.js
// survived the tests above — `pad`: n < 10 -> n <= 10 (no test used a day,
// month or kopeck value of exactly 10) and `toDate`: dropping .slice(0, 10)
// (no test passed a full timestamp). Both are pinned here.
test('formatDate/formatDateUa: 10 is not zero-padded, timestamps are cut to the date (Task E)', function () {
  assert.equal(format.formatDate('2026-10-10'), '10/10/2026');
  assert.equal(format.formatDateUa('2026-10-10'), '10.10.2026');
  assert.equal(format.formatMoney(1010), '10,10 грн');
  assert.equal(format.formatDate('2026-03-09T15:30:00Z'), '03/09/2026');
  assert.equal(format.formatDateUa('2026-03-09T15:30:00Z'), '09.03.2026');
});
