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
