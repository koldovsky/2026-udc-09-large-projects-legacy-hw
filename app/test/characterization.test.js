var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var renderInvoice = require('../lib/invoices/render').renderInvoiceHtml;
var buildReminders = require('../lib/notifications/reminders').buildReminders;
var buildAccountingFile = require('../lib/export/accounting').buildAccountingFile;

var testInvoice = {
  id: 'INV-1',
  number: 'INV-TEST-01',
  issued_at: '2026-03-09',
  due_at: '2026-03-23',
  subtotal_kopecks: 100000,
  vat_rate: 20,
  vat_kopecks: 20000,
  total_kopecks: 120000,
  status: 'issued',
  customer_id: 'CUST-1',
  lines: [
    { title: 'Test line', qty: 1, unit_price_kopecks: 100000 }
  ]
};

var testCustomer = {
  id: 'CUST-1',
  name: 'Test Customer',
  edrpou: '12345678',
  email: 'test@example.com',
  contact: 'Test Contact'
};

var customersById = { 'CUST-1': testCustomer };

test('Characterization: invoice render output', function() {
  var html = renderInvoice(testInvoice, testCustomer);
  var expected = fs.readFileSync(path.join(__dirname, 'fixtures', 'invoice.golden.html'), 'utf8');
  assert.equal(html, expected);
});

test('Characterization: reminders output', function() {
  var reminders = buildReminders([testInvoice], customersById, '2026-03-26');
  var expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'reminders.golden.json'), 'utf8'));
  assert.deepEqual(reminders, expected);
});

test('Characterization: accounting export output', function() {
  var exportData = buildAccountingFile([testInvoice], customersById);
  var expected = fs.readFileSync(path.join(__dirname, 'fixtures', 'accounting.golden.csv'), 'utf8');
  assert.equal(exportData, expected);
});
