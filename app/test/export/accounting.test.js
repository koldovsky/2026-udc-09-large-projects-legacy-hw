var test = require('node:test');
var assert = require('node:assert/strict');
var accounting = require('../../lib/export/accounting');

var customersById = {
  1: { id: 1, name: 'ТОВ «Тестовий Ліс»', edrpou: '10000901' },
  2: { id: 2, name: 'ФОП Тест-2', edrpou: '10000902' },
};

var invoices = [
  {
    id: 1,
    number: 'INV-2026-00001',
    customer_id: 1,
    issued_at: '2026-01-15',
    due_at: '2026-01-29',
    subtotal_kopecks: 100000,
    vat_kopecks: 20000,
    total_kopecks: 120000,
    status: 'issued',
  },
  {
    id: 2,
    number: 'INV-2026-00002',
    customer_id: 2,
    issued_at: '2026-02-28',
    due_at: '2026-03-14',
    subtotal_kopecks: 50000,
    vat_kopecks: 10000,
    total_kopecks: 60000,
    status: 'paid',
  },
  {
    id: 3,
    number: 'INV-2026-00003',
    customer_id: 1,
    issued_at: '2026-03-01',
    due_at: '2026-03-15',
    subtotal_kopecks: 77700,
    vat_kopecks: 15540,
    total_kopecks: 93240,
    status: 'draft',
  },
];

test('buildAccountingFile: golden master — CSV format for Облік-Плюс (MM/DD/YYYY dates, decimal with dot)', function () {
  var csv = accounting.buildAccountingFile(invoices, customersById);

  // Header row
  var lines = csv.split('\r\n');
  assert.equal(lines[0], 'DocNo;DocDate;PayUntil;Edrpou;Counterparty;NetAmount;Vat;Amount');

  // Row 1: INV-2026-00001 (issued)
  assert.equal(lines[1], 'INV-2026-00001;01/15/2026;01/29/2026;10000901;ТОВ «Тестовий Ліс»;1000.00;200.00;1200.00');

  // Row 2: INV-2026-00002 (paid)
  assert.equal(lines[2], 'INV-2026-00002;02/28/2026;03/14/2026;10000902;ФОП Тест-2;500.00;100.00;600.00');

  // Row 3: draft invoice should be SKIPPED (status !== 'draft' filter)
  assert.equal(lines.length, 3 + 1); // header + 2 data rows + trailing empty line
  assert.equal(lines[3], ''); // trailing CRLF
});

test('buildAccountingFile: decimal amounts use dot, not comma; no currency symbol; no thousands separator', function () {
  var csv = accounting.buildAccountingFile(invoices, customersById);
  var lines = csv.split('\r\n');
  var dataRow = lines[1];

  // Amounts: 1000.00 (not 1 000,00 or 1000,00) - formatDecimal has no thousands separator
  assert.match(dataRow, /;1000\.00;200\.00;1200\.00$/);
  assert.ok(!dataRow.includes(','), 'no commas in amounts');
  // Only check amount fields for spaces (customer name has spaces)
  var amountPart = dataRow.split(';').slice(-3).join(';');
  assert.ok(!amountPart.includes(' '), 'no spaces in amount fields');
  assert.ok(!dataRow.includes('грн'), 'no currency symbol');
});

test('buildAccountingFile: dates are MM/DD/YYYY (not DD/MM/YYYY or ISO)', function () {
  var csv = accounting.buildAccountingFile(invoices, customersById);
  var lines = csv.split('\r\n');

  // issued_at = 2026-01-15 -> 01/15/2026
  assert.match(lines[1], /;01\/15\/2026;/);
  // due_at = 2026-01-29 -> 01/29/2026
  assert.match(lines[1], /;01\/29\/2026;/);

  // issued_at = 2026-02-28 -> 02/28/2026
  assert.match(lines[2], /;02\/28\/2026;/);
  // due_at = 2026-03-14 -> 03/14/2026
  assert.match(lines[2], /;03\/14\/2026;/);
});

test('buildAccountingFile: CRLF line endings, semicolon separator, UTF-8', function () {
  var csv = accounting.buildAccountingFile(invoices, customersById);

  assert.match(csv, /\r\n$/); // ends with CRLF
  assert.ok(csv.includes(';'), 'semicolon separator');
  // Ukrainian company name should be preserved
  assert.ok(csv.includes('ТОВ «Тестовий Ліс»'));
});