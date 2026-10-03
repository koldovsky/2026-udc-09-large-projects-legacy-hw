/**
 * Characterization tests for the Облік-Плюс nightly export (BILL-482).
 *
 * This output is read by a MACHINE, not a person: the accounting server picks
 * out/export/oblik-YYYY-MM-DD.csv up at 06:00 and expects MM/DD/YYYY dates
 * (docs/integrations/oblik-plus.md). A row with any other date format is
 * SILENTLY SKIPPED on their side — no error here, no mail from them. That is
 * how 40 invoices were lost in February 2021.
 *
 * Nothing in this file may change when BILL-482 changes the customer-facing
 * date format. If a test here goes red, that is a regression, not progress.
 */
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var store = require('../../lib/store');
var accounting = require('../../lib/export/accounting');

var GOLDEN = path.join(__dirname, '..', 'golden', 'oblik-export.csv');

function buildFromData() {
  var customers = store.loadSync('customers');
  var invoices = store.loadSync('invoices');
  var byId = {};
  customers.forEach(function (c) {
    byId[c.id] = c;
  });
  return accounting.buildAccountingFile(invoices, byId);
}

test('golden master: the whole export file over data/ is byte-for-byte unchanged', function () {
  assert.equal(buildFromData(), fs.readFileSync(GOLDEN, 'utf8'));
});

test('export contract: CRLF line endings, ";" separator, header row first', function () {
  var out = buildFromData();
  assert.ok(out.indexOf('\r\n') !== -1, 'must use CRLF');
  assert.equal(out.split('\r\n')[0], 'DocNo;DocDate;PayUntil;Edrpou;Counterparty;NetAmount;Vat;Amount');
  assert.ok(/\r\n$/.test(out), 'must end with CRLF');
});

test('export contract: DocDate and PayUntil stay MM/DD/YYYY', function () {
  var rows = buildFromData().split('\r\n').slice(1).filter(Boolean);
  assert.ok(rows.length > 0);
  rows.forEach(function (row) {
    var c = row.split(';');
    assert.match(c[1], /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/, 'DocDate in ' + c[0]);
    assert.match(c[2], /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/, 'PayUntil in ' + c[0]);
  });
});

test('export contract: a known invoice renders exactly as accounting expects', function () {
  // issued 2026-03-07, due 2026-03-21 -> American order, not 07.03.2026
  var invoice = {
    number: 'INV-2026-00007',
    customer_id: 7,
    issued_at: '2026-03-07',
    due_at: '2026-03-21',
    subtotal_kopecks: 352500,
    vat_kopecks: 70500,
    total_kopecks: 423000,
    status: 'issued',
  };
  var out = accounting.buildAccountingFile([invoice], { 7: { edrpou: '10000007', name: 'ФОП Приклад-5' } });
  assert.equal(
    out,
    'DocNo;DocDate;PayUntil;Edrpou;Counterparty;NetAmount;Vat;Amount\r\n' +
      'INV-2026-00007;03/07/2026;03/21/2026;10000007;ФОП Приклад-5;3525.00;705.00;4230.00\r\n',
  );
});

test('export contract: drafts are left out, other statuses are kept', function () {
  var base = { customer_id: 1, issued_at: '2026-03-01', due_at: '2026-03-15', subtotal_kopecks: 100, vat_kopecks: 20, total_kopecks: 120 };
  var rows = accounting
    .buildAccountingFile(
      [
        Object.assign({ number: 'A', status: 'draft' }, base),
        Object.assign({ number: 'B', status: 'issued' }, base),
        Object.assign({ number: 'C', status: 'paid' }, base),
        Object.assign({ number: 'D', status: 'cancelled' }, base),
      ],
      { 1: { edrpou: '1', name: 'X' } },
    )
    .split('\r\n')
    .slice(1)
    .filter(Boolean);
  assert.deepEqual(
    rows.map(function (r) {
      return r.split(';')[0];
    }),
    ['B', 'C', 'D'],
  );
});

test('export columns are resolved by type through lib/format.js', function () {
  // config/export-columns.json type "Date" -> format.formatDate. This dynamic
  // lookup is why grepping for "formatDate" does not find this consumer.
  var columns = require('../../config/export-columns.json');
  var types = columns.map(function (c) {
    return c.type;
  });
  assert.deepEqual(types, ['Text', 'Date', 'Date', 'Text', 'Text', 'Decimal', 'Decimal', 'Decimal']);
  var format = require('../../lib/format');
  types.forEach(function (t) {
    assert.equal(typeof format['format' + t], 'function', 'format.format' + t + ' must exist');
  });
});
