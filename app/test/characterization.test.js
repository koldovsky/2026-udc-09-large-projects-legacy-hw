/**
 * Characterization tests (BILL-482): pin the current output of every consumer
 * of lib/format.js formatDate against golden files in test/golden/.
 *
 * Read-only on data/*.json. To regenerate after an intended change:
 *   UPDATE_GOLDEN=1 node --test test/characterization.test.js
 */
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var render = require('../lib/invoices/render');
var reminders = require('../lib/notifications/reminders');
var accounting = require('../lib/export/accounting');

var DATA = path.join(__dirname, '..', 'data');
var GOLDEN = path.join(__dirname, 'golden');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA, name + '.json'), 'utf8'));
}

function byId(rows) {
  var out = {};
  rows.forEach(function (r) { out[r.id] = r; });
  return out;
}

function golden(name, actual) {
  var file = path.join(GOLDEN, name);
  if (process.env.UPDATE_GOLDEN) fs.writeFileSync(file, actual, 'utf8');
  assert.equal(actual, fs.readFileSync(file, 'utf8'));
}

var invoices = load('invoices');
var customers = byId(load('customers'));

test('invoice HTML for every invoice (customer-facing)', function () {
  var out = invoices.map(function (inv) {
    return render.renderInvoiceHtml(inv, customers[inv.customer_id]);
  });
  golden('invoices.html', out.join('\n') + '\n');
});

test('reminder mails on 2026-03-12, 2026-03-20, 2026-04-01 (customer-facing)', function () {
  var out = [];
  ['2026-03-12', '2026-03-20', '2026-04-01'].forEach(function (today) {
    reminders.buildReminders(invoices, customers, today).forEach(function (m) {
      out.push('### ' + today + ' ' + m.kind + ' ' + m.invoice_id + '\nTo: ' + m.to + '\nSubject: ' + m.subject + '\n\n' + m.text + '\n');
    });
  });
  golden('reminders.txt', out.join('\n'));
});

test('Oblik Plus accounting CSV, byte for byte (read by another system)', function () {
  golden('oblik.csv', accounting.buildAccountingFile(invoices, customers));
});

test('Oblik Plus CSV leaves out draft invoices (data/ has none, so pin it inline)', function () {
  var draft = { id: 999, number: 'INV-2026-99999', customer_id: 1, status: 'draft', issued_at: '2026-03-01', due_at: '2026-03-15', subtotal_kopecks: 100, vat_kopecks: 20, total_kopecks: 120 };
  var withDraft = accounting.buildAccountingFile(invoices.concat([draft]), customers);
  assert.equal(withDraft, accounting.buildAccountingFile(invoices, customers));
  assert.equal(withDraft.indexOf('INV-2026-99999'), -1);
});
