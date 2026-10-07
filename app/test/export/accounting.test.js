var test = require('node:test');
var assert = require('node:assert/strict');
var accounting = require('../../lib/export/accounting');

var customer = { id: 1, name: 'ТОВ «Зелений Кут»', edrpou: '10000001' };
var invoice = {
  number: 'INV-2026-00007',
  issued_at: '2026-03-09',
  due_at: '2026-03-23',
  customer_id: 1,
  vat_rate: 20,
  subtotal_kopecks: 100000,
  vat_kopecks: 20000,
  total_kopecks: 120000,
};

// Characterization (BILL-482): golden master for the nightly "Облік-Плюс"
// file. This column is NOT in scope for the ticket — the accounting server
// requires exactly MM/DD/YYYY and silently drops any row whose date column
// doesn't match it (see docs/impact.md and app/docs/integrations/oblik-plus.md,
// "лютий 2021"). This test must still pass after BILL-482 is done.
test('accounting export: DocDate/PayUntil stay MM/DD/YYYY (characterization, BILL-482)', function () {
  var csv = accounting.buildAccountingFile([invoice], { 1: customer });
  assert.equal(
    csv,
    'DocNo;DocDate;PayUntil;Edrpou;Counterparty;NetAmount;Vat;Amount\r\n' +
      'INV-2026-00007;03/09/2026;03/23/2026;10000001;ТОВ «Зелений Кут»;1000.00;200.00;1200.00\r\n',
  );
});

test('accounting export: missing dates render as empty cells, not a thrown error', function () {
  var csv = accounting.buildAccountingFile([Object.assign({}, invoice, { due_at: null })], { 1: customer });
  assert.match(csv, /INV-2026-00007;03\/09\/2026;;10000001/);
});
