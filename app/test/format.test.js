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

test('formatDate: current output is MM/DD/YYYY (characterization, BILL-482)', function () {
  assert.equal(format.formatDate('2026-03-09'), '03/09/2026');
  assert.equal(format.formatDate('2026-12-31T23:00:00Z'), '12/31/2026');
  assert.equal(format.formatDate(new Date(Date.UTC(2026, 0, 5))), '01/05/2026');
  assert.equal(format.formatDate(''), '');
  assert.equal(format.formatDate('not a date'), '');
});

test('formatDateUk: DD.MM.YYYY for customer-facing dates (BILL-482)', function () {
  assert.equal(format.formatDateUk('2026-03-09'), '09.03.2026');
  assert.equal(format.formatDateUk('2026-12-31T23:00:00Z'), '31.12.2026');
  assert.equal(format.formatDateUk(new Date(Date.UTC(2026, 0, 5))), '05.01.2026');
  assert.equal(format.formatDateUk(''), '');
  assert.equal(format.formatDateUk('not a date'), '');
});

test('formatDate/formatDateUk use the UTC date, whatever the server time zone', function () {
  // 23:30Z is already tomorrow east of UTC (Kyiv), 00:30Z is still yesterday west of it
  var late = new Date(Date.UTC(2026, 0, 1, 23, 30));
  var early = new Date(Date.UTC(2026, 0, 1, 0, 30));
  assert.equal(format.formatDate(late), '01/01/2026');
  assert.equal(format.formatDate(early), '01/01/2026');
  assert.equal(format.formatDateUk(late), '01.01.2026');
  assert.equal(format.formatDateUk(early), '01.01.2026');
});

test('formatDecimal rounds fractional kopecks, does not truncate', function () {
  assert.equal(format.formatDecimal(123.6), '1.24');
  assert.equal(format.formatDecimal(-123.6), '-1.24');
});
