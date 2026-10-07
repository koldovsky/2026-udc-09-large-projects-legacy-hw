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

test('formatDateUa: DD.MM.YYYY for customers (BILL-482)', function () {
  assert.equal(format.formatDateUa('2026-03-09'), '09.03.2026');
  assert.equal(format.formatDateUa('2026-12-31T23:30:00Z'), '31.12.2026');
  assert.equal(format.formatDateUa(''), '');
  assert.equal(format.formatDateUa('not a date'), '');
});
