var test = require('node:test');
var assert = require('node:assert/strict');
var renderInvoice = require('../lib/invoices/render').renderInvoiceHtml;
var buildReminders = require('../lib/notifications/reminders').buildReminders;
var buildAccountingFile = require('../lib/export/accounting').buildAccountingFile;

var invoice = {
  id: 7,
  number: 'INV-2026-00007',
  customer_id: 1,
  status: 'issued',
  issued_at: '2026-03-09',
  due_at: '2026-03-12',
  subtotal_kopecks: 100000,
  vat_kopecks: 20000,
  total_kopecks: 120000,
  vat_rate: 20,
  lines: [],
};
var customer = { id: 1, name: 'ТОВ «Зелений Кут»', edrpou: '10000001', email: 'client@example.invalid', contact_name: 'Ірина' };

test('invoice HTML dates use Ukrainian format', function () {
  var html = renderInvoice(invoice, customer);
  assert.match(html, /Дата: <b>09\.03\.2026<\/b>/);
  assert.match(html, /Сплатити до: <b>12\.03\.2026<\/b>/);
});

test('upcoming and overdue reminders use Ukrainian date format', function () {
  var upcoming = buildReminders([invoice], { 1: customer }, '2026-03-09');
  var overdue = buildReminders([invoice], { 1: customer }, '2026-03-13');
  assert.equal(upcoming.length, 1);
  assert.ok(upcoming[0].text.indexOf('слід сплатити до 12.03.2026.') !== -1);
  assert.equal(overdue.length, 1);
  assert.ok(overdue[0].text.indexOf('мав бути сплачений до 12.03.2026.') !== -1);
});

test('accounting CSV keeps its contracted date output', function () {
  var csv = buildAccountingFile([invoice], { 1: customer });
  assert.equal(
    csv,
    'DocNo;DocDate;PayUntil;Edrpou;Counterparty;NetAmount;Vat;Amount\r\n' +
      'INV-2026-00007;03/09/2026;03/12/2026;10000001;ТОВ «Зелений Кут»;1000.00;200.00;1200.00\r\n',
  );
});
