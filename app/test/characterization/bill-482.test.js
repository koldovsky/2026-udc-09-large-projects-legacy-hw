/**
 * BILL-482 characterization tests: pin the CURRENT output of everything that
 * goes through lib/format.formatDate, before the date format is changed.
 * See docs/impact.md.
 *
 * Golden files live in test/golden/. To regenerate them on purpose:
 *   UPDATE_GOLDEN=1 node --test test/characterization/bill-482.test.js
 * and explain every changed expectation in docs/impact.md, section 5.
 */
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;
var store = require('../../lib/store');
var format = require('../../lib/format');
var accounting = require('../../lib/export/accounting');
var render = require('../../lib/invoices/render');
var reminders = require('../../lib/notifications/reminders');

var APP = path.join(__dirname, '..', '..');
var GOLDEN = path.join(__dirname, '..', 'golden');
var REMINDERS_DAY = '2026-03-20'; // gives both 'upcoming' and 'overdue' mails on the fixtures

function golden(name, actual) {
  var file = path.join(GOLDEN, name);
  if (process.env.UPDATE_GOLDEN) {
    fs.mkdirSync(GOLDEN, { recursive: true });
    fs.writeFileSync(file, actual, 'utf8');
  }
  assert.equal(actual, fs.readFileSync(file, 'utf8'), 'differs from test/golden/' + name);
}

// read-only: nothing here calls store.save()
function loadFixtures(cb) {
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

// --- the shared helper itself ----------------------------------------------

test('formatDate: current output is MM/DD/YYYY (UTC, time part ignored)', function () {
  assert.equal(format.formatDate('2026-03-09'), '03/09/2026');
  assert.equal(format.formatDate('2026-12-31'), '12/31/2026');
  assert.equal(format.formatDate('2026-03-09T23:30:00Z'), '03/09/2026');
  assert.equal(format.formatDate(new Date(Date.UTC(2026, 2, 9))), '03/09/2026');
  assert.equal(format.formatDate(''), '');
  assert.equal(format.formatDate(null), '');
  assert.equal(format.formatDate(undefined), '');
  assert.equal(format.formatDate('not a date'), '');
});

// --- consumer 1: Oblik-Plus CSV (another system reads it) ------------------

test('accounting export: whole file matches the golden master', function (t, done) {
  loadFixtures(function (err, invoices, byId) {
    if (err) return done(err);
    golden('oblik-export.csv', accounting.buildAccountingFile(invoices, byId));
    done();
  });
});

test('accounting export: DocDate / PayUntil are MM/DD/YYYY, reached via format["format" + type]', function (t, done) {
  loadFixtures(function (err, invoices, byId) {
    if (err) return done(err);
    var lines = accounting.buildAccountingFile(invoices, byId).split('\r\n');
    assert.equal(lines[0], 'DocNo;DocDate;PayUntil;Edrpou;Counterparty;NetAmount;Vat;Amount');
    var rows = lines.slice(1, -1);
    assert.ok(rows.length > 0);
    rows.forEach(function (line) {
      var cells = line.split(';');
      assert.match(cells[1], /^\d{2}\/\d{2}\/\d{4}$/, line);
      assert.match(cells[2], /^\d{2}\/\d{2}\/\d{4}$/, line);
    });
    assert.equal(rows[0], 'INV-2026-00001;03/01/2026;03/15/2026;10000001;ТОВ «Зелений Кут»;4827.50;965.50;5793.00');
    done();
  });
});

// --- consumer 2: invoice HTML (customers read it) --------------------------

test('invoice HTML for INV-2026-00007 matches the golden master', function (t, done) {
  store.where('invoices', function (i) { return i.number === 'INV-2026-00007'; }, function (err, found) {
    if (err) return done(err);
    assert.equal(found.length, 1);
    store.find('customers', found[0].customer_id, function (err2, customer) {
      if (err2) return done(err2);
      golden('invoice-INV-2026-00007.html', render.renderInvoiceHtml(found[0], customer));
      done();
    });
  });
});

test('bin/render-invoice.js prints the same HTML as the golden master', function () {
  var out = execFileSync(process.execPath, ['bin/render-invoice.js', 'INV-2026-00007'], { cwd: APP, encoding: 'utf8' });
  golden('invoice-INV-2026-00007.html', out);
});

// --- consumer 3: reminder mails (customers read them) ----------------------

test('reminder mails for ' + REMINDERS_DAY + ' match the golden master', function (t, done) {
  loadFixtures(function (err, invoices, byId) {
    if (err) return done(err);
    var mails = reminders.buildReminders(invoices, byId, REMINDERS_DAY);
    var kinds = mails.map(function (m) { return m.kind; });
    assert.ok(kinds.indexOf('upcoming') !== -1 && kinds.indexOf('overdue') !== -1);
    golden('reminders-' + REMINDERS_DAY + '.json', JSON.stringify(mails, null, 2) + '\n');
    done();
  });
});
