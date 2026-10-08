var test = require('node:test');
var assert = require('node:assert/strict');
var format = require('../lib/format');
var render = require('../lib/invoices/render');
var reminders = require('../lib/notifications/reminders');
var accounting = require('../lib/export/accounting');

var invoice = {
  id: 7,
  number: 'INV-2026-00007',
  issued_at: '2026-03-09',
  due_at: '2026-03-23',
  vat_rate: 20,
  subtotal_kopecks: 100000,
  vat_kopecks: 20000,
  total_kopecks: 120000,
  status: 'issued',
  customer_id: 1,
  lines: [{ title: 'Папір А4', qty: 4, unit_price_kopecks: 25000 }],
};

var customer = { id: 1, name: 'ТОВ «Зелений Кут»', edrpou: '10000001', email: 'client@example.invalid', contact_name: 'Ірина' };

test('formatDate produces DD.MM.YYYY after BILL-482', function () {
  assert.equal(format.formatDate('2026-03-09'), '09.03.2026');
  assert.equal(format.formatDate('2026-12-25'), '25.12.2026');
  assert.equal(format.formatDate('2026-01-01'), '01.01.2026');
});

test('invoice HTML contains dates in DD.MM.YYYY after BILL-482', function () {
  var html = render.renderInvoiceHtml(invoice, customer);
  assert.ok(html.includes('09.03.2026'), 'issued_at should be DD.MM.YYYY');
  assert.ok(html.includes('23.03.2026'), 'due_at should be DD.MM.YYYY');
});

test('reminder body contains due date in DD.MM.YYYY after BILL-482', function () {
  var customersById = { 1: customer };
  var mails = reminders.buildReminders([invoice], customersById, '2026-03-20');
  assert.equal(mails.length, 1);
  assert.ok(mails[0].text.includes('23.03.2026'), 'due_at in upcoming reminder should be DD.MM.YYYY');
});

test('overdue reminder contains due date in DD.MM.YYYY after BILL-482', function () {
  var customersById = { 1: customer };
  var mails = reminders.buildReminders([invoice], customersById, '2026-03-24');
  assert.equal(mails.length, 1);
  assert.ok(mails[0].text.includes('23.03.2026'), 'due_at in overdue reminder should be DD.MM.YYYY');
});

test('accounting CSV contains dates in MM/DD/YYYY for Oblik-Plus', function () {
  var customersById = { 1: customer };
  var csv = accounting.buildAccountingFile([invoice], customersById);
  assert.ok(csv.includes('03/09/2026'), 'issued_at in CSV should be MM/DD/YYYY');
  assert.ok(csv.includes('03/23/2026'), 'due_at in CSV should be MM/DD/YYYY');
  assert.ok(csv.includes(';'), 'CSV uses semicolon separator');
  assert.ok(csv.includes('1000.00'), 'amounts should be decimal (not kopecks, not hryvnia text)');
});
