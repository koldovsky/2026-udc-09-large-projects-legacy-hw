/**
 * BILL-482 characterization tests: pin what every consumer of
 * format.formatDate prints today, before the date format is touched.
 * Consumers and who reads them: docs/impact.md (repo root).
 *
 * Golden files in ./golden are compared byte for byte (.gitattributes there
 * keeps git from touching line endings — the CSV must stay CRLF).
 * Regenerate ONLY for outputs the ticket is meant to change, and say why in
 * docs/impact.md, section 5:
 *   UPDATE_GOLDEN=1 node --test test/characterization/bill-482.test.js
 */
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');
var store = require('../../lib/store');
var format = require('../../lib/format');
var render = require('../../lib/invoices/render');
var invoiceRoutes = require('../../lib/invoices/routes');
var reminders = require('../../lib/notifications/reminders');
var accounting = require('../../lib/export/accounting');

var APP = path.join(__dirname, '..', '..');
var GOLDEN = path.join(__dirname, 'golden');
var UPDATE = process.env.UPDATE_GOLDEN === '1';

function golden(name, actual) {
  var file = path.join(GOLDEN, name);
  if (UPDATE) fs.writeFileSync(file, actual, 'utf8');
  assert.equal(actual, fs.readFileSync(file, 'utf8'), 'golden/' + name);
}

// The same inputs bin/*.js build from data/*.json.
function seeded(cb) {
  store.open();
  store.all('customers', function (err, customers) {
    if (err) return cb(err);
    store.all('invoices', function (err2, invoices) {
      if (err2) return cb(err2);
      var byId = {};
      customers.forEach(function (c) { byId[c.id] = c; });
      cb(null, invoices, byId);
    });
  });
}

function byNumber(invoices, number) {
  return invoices.filter(function (i) { return i.number === number; })[0];
}

test('formatDate: current output for every input shape', function () {
  assert.equal(format.formatDate('2026-03-09'), '03/09/2026');
  assert.equal(format.formatDate('2026-12-31'), '12/31/2026');
  assert.equal(format.formatDate('2026-03-09T23:30:00+02:00'), '03/09/2026');
  assert.equal(format.formatDate(new Date(Date.UTC(2026, 2, 9))), '03/09/2026');
  assert.equal(format.formatDate(''), '');
  assert.equal(format.formatDate(null), '');
  assert.equal(format.formatDate(undefined), '');
  assert.equal(format.formatDate('not a date'), '');
});

test('formatDateUa: dd.mm.yyyy for people (BILL-482)', function () {
  assert.equal(format.formatDateUa('2026-03-09'), '09.03.2026');
  assert.equal(format.formatDateUa('2026-12-31'), '31.12.2026');
  assert.equal(format.formatDateUa('2026-03-09T23:30:00+02:00'), '09.03.2026');
  assert.equal(format.formatDateUa(new Date(Date.UTC(2026, 2, 9))), '09.03.2026');
  assert.equal(format.formatDateUa(''), '');
  assert.equal(format.formatDateUa(null), '');
  assert.equal(format.formatDateUa('not a date'), '');
});

// --- consumer 1: invoice HTML, read by customers ---------------------------

test('invoice HTML for INV-2026-00007 (the one from the ticket)', function (t, done) {
  seeded(function (err, invoices, byId) {
    assert.ifError(err);
    var inv = byNumber(invoices, 'INV-2026-00007');
    golden('invoice-INV-2026-00007.html', render.renderInvoiceHtml(inv, byId[inv.customer_id]));
    done();
  });
});

test('GET /invoices/:number serves exactly that HTML', function (t, done) {
  var route = invoiceRoutes.filter(function (r) { return r.path === '/invoices/:number'; })[0];
  store.open();
  route.handler({}, {}, { params: { number: 'INV-2026-00007' }, query: {} }, function (err, status, html) {
    assert.ifError(err);
    assert.equal(status, 200);
    golden('invoice-INV-2026-00007.html', html);
    done();
  });
});

test('bin/render-invoice.js prints exactly that HTML', function () {
  var out = childProcess.execFileSync(process.execPath, ['bin/render-invoice.js', 'INV-2026-00007'], {
    cwd: APP,
    encoding: 'utf8',
  });
  golden('invoice-INV-2026-00007.html', out);
});

// --- consumer 2: reminder mails, read by customers -------------------------

test('reminder mails due on 2026-03-20 (both kinds)', function (t, done) {
  seeded(function (err, invoices, byId) {
    assert.ifError(err);
    var mails = reminders.buildReminders(invoices, byId, '2026-03-20');
    var kinds = mails.map(function (m) { return m.kind; });
    assert.ok(kinds.indexOf('upcoming') !== -1 && kinds.indexOf('overdue') !== -1, 'both branches covered');
    golden('reminders-2026-03-20.json', JSON.stringify(mails, null, 2) + '\n');
    done();
  });
});

// --- consumer 3: Облік-Плюс CSV, read by a machine -------------------------
// Reaches formatDate WITHOUT naming it: format['format' + col.type] with
// type "Date" from config/export-columns.json.

test('Облік-Плюс export file, byte for byte', function (t, done) {
  seeded(function (err, invoices, byId) {
    assert.ifError(err);
    golden('oblik-export.csv', accounting.buildAccountingFile(invoices, byId));
    done();
  });
});

// Not a snapshot: the contract from app/docs/integrations/oblik-plus.md.
// Must stay green after BILL-482 — Облік-Плюс silently skips rows with any
// other date format.
test('Облік-Плюс contract: DocDate and PayUntil are MM/DD/YYYY', function (t, done) {
  seeded(function (err, invoices, byId) {
    assert.ifError(err);
    var rows = accounting.buildAccountingFile(invoices, byId).split('\r\n');
    var header = rows.shift().split(';');
    var docNo = header.indexOf('DocNo');
    var dateCols = { DocDate: 'issued_at', PayUntil: 'due_at' };
    rows.pop(); // trailing CRLF
    assert.ok(rows.length > 0);
    rows.forEach(function (line) {
      var cells = line.split(';');
      var inv = byNumber(invoices, cells[docNo]);
      Object.keys(dateCols).forEach(function (h) {
        var iso = inv[dateCols[h]];
        var expected = iso.slice(5, 7) + '/' + iso.slice(8, 10) + '/' + iso.slice(0, 4);
        assert.equal(cells[header.indexOf(h)], expected, inv.number + ' ' + h);
      });
    });
    done();
  });
});
