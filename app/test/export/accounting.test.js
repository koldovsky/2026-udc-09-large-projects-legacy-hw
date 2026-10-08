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

// Task E (mutation testing, docs/task-e-bonus.md): the draft filter and the
// "unknown customer" cells had no test — mutants `inv.status !== 'draft'` ->
// `true` and `customer ? customer.edrpou : ''` -> garbage survived. Both matter
// for Облік-Плюс: drafts must never reach accounting, and a missing customer
// must give empty cells, not junk or a thrown error.
test('accounting export: drafts are skipped, unknown customer gives empty cells (Task E)', function () {
  var draft = Object.assign({}, invoice, { number: 'INV-2026-00008', status: 'draft' });
  var orphan = Object.assign({}, invoice, { number: 'INV-2026-00009', customer_id: 999 });
  var csv = accounting.buildAccountingFile([invoice, draft, orphan], { 1: customer });
  var rows = csv.split('\r\n').filter(Boolean);
  assert.equal(rows.length, 3); // header + 2 rows: the draft is gone
  assert.ok(csv.indexOf('INV-2026-00008') === -1);
  assert.equal(rows[2], 'INV-2026-00009;03/09/2026;03/23/2026;;;1000.00;200.00;1200.00');
});
