/**
 * Characterization tests (golden master) for every consumer of format.formatDate.
 * They pin the CURRENT output. See docs/impact.md.
 *
 * Golden files live in test/golden/. To regenerate one deliberately:
 *   GOLDEN_WRITE=1 node --test test/characterization.test.js
 */
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var store = require('../lib/store');
var render = require('../lib/invoices/render');
var reminders = require('../lib/notifications/reminders');
var accounting = require('../lib/export/accounting');

var GOLDEN = path.join(__dirname, 'golden');

function expectGolden(name, actual) {
  var file = path.join(GOLDEN, name);
  if (process.env.GOLDEN_WRITE) {
    fs.mkdirSync(GOLDEN, { recursive: true });
    fs.writeFileSync(file, actual, 'utf8');
  }
  // read as a Buffer-faithful string: CRLF in the export must be preserved
  assert.equal(fs.readFileSync(file, 'utf8'), actual);
}

function seed() {
  store.open();
  var customers = store.loadSync('customers');
  var byId = {};
  customers.forEach(function (c) { byId[c.id] = c; });
  return { invoices: store.loadSync('invoices'), customers: byId };
}

test('consumer 1 (human): invoice HTML shows issue and due dates', function () {
  var s = seed();
  var inv = s.invoices.filter(function (i) { return i.number === 'INV-2026-00007'; })[0];
  expectGolden('invoice-INV-2026-00007.html', render.renderInvoiceHtml(inv, s.customers[inv.customer_id]));
});

test('consumer 2 (human): reminder mails, upcoming and overdue', function () {
  var customers = { 1: { id: 1, email: 'client1@example.invalid', contact_name: 'Ірина' } };
  var inv = { id: 5, number: 'INV-2026-00005', status: 'issued', due_at: '2026-03-12', total_kopecks: 99900, customer_id: 1 };
  var upcoming = reminders.buildReminders([inv], customers, '2026-03-09');
  var overdue = reminders.buildReminders([inv], customers, '2026-03-13');
  assert.equal(upcoming[0].kind, 'upcoming');
  assert.equal(overdue[0].kind, 'overdue');
  expectGolden('reminders.txt', JSON.stringify(upcoming.concat(overdue), null, 2) + '\n');
});

test('consumer 3 (machine): nightly accounting CSV for Облік-Плюс stays MM/DD/YYYY', function () {
  var s = seed();
  var file = accounting.buildAccountingFile(s.invoices, s.customers);
  expectGolden('accounting-export.csv', file);
  // the contract with the accounting server, stated explicitly
  var rows = file.split('\r\n').slice(1, -1);
  assert.ok(rows.length > 0);
  rows.forEach(function (row) {
    var cols = row.split(';');
    assert.match(cols[1], /^\d{2}\/\d{2}\/\d{4}$/, 'DocDate: ' + row);
    assert.match(cols[2], /^\d{2}\/\d{2}\/\d{4}$/, 'PayUntil: ' + row);
  });
});
