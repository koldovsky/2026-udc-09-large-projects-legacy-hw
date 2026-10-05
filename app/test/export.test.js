var test = require('node:test');
var assert = require('node:assert/strict');
var accounting = require('../lib/export/accounting');

test('accounting CSV keeps MM/DD/YYYY for configured Date columns', function () {
  var csv = accounting.buildAccountingFile(
    [{
      number: 'INV-2026-00007',
      issued_at: '2026-03-09',
      due_at: '2026-03-23',
      customer_id: 1,
      subtotal_kopecks: 100000,
      vat_kopecks: 20000,
      total_kopecks: 120000,
      status: 'issued',
    }],
    { 1: { edrpou: '10000001', name: 'ТОВ «Зелений Кут»' } },
  );

  assert.equal(
    csv,
    'DocNo;DocDate;PayUntil;Edrpou;Counterparty;NetAmount;Vat;Amount\r\n' +
      'INV-2026-00007;03/09/2026;03/23/2026;10000001;ТОВ «Зелений Кут»;1000.00;200.00;1200.00\r\n',
  );
});
