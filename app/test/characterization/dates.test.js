/**
 * Characterization tests for BILL-482 (date format in invoices).
 *
 * They pin the CURRENT output of every consumer of lib/format.js#formatDate,
 * including the one that never names it: lib/export/accounting.js resolves the
 * helper as format['format' + col.type] from config/export-columns.json.
 *
 * Inputs are frozen copies in ./fixtures (not app/data, which the running app
 * rewrites). CLI scripts run in a throw-away copy of the app whose data/ is
 * those fixtures, so nothing under app/data or app/out is read or written.
 *
 * Golden masters live in ./golden. Regenerate them only on purpose:
 *   UPDATE_GOLDEN=1 node --test test/characterization/dates.test.js
 * and explain every changed golden file in docs/impact.md, section 5.
 */
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var os = require('os');
var path = require('path');
var childProcess = require('child_process');

var format = require('../../lib/format');
var renderInvoice = require('../../lib/invoices/render');
var invoiceRoutes = require('../../lib/invoices/routes');
var reminders = require('../../lib/notifications/reminders');
var accounting = require('../../lib/export/accounting');
var store = require('../../lib/store');

var APP = path.join(__dirname, '..', '..');
var GOLDEN = path.join(__dirname, 'golden');
var FIXTURES = path.join(__dirname, 'fixtures');
var invoices = require('./fixtures/invoices.json');
var customers = require('./fixtures/customers.json');

// a throw-away copy of the app (code + config) whose data/ is the fixtures
var sandbox = null;
function sandboxApp() {
  if (sandbox) return sandbox;
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'bill-482-'));
  ['lib', 'bin', 'config'].forEach(function (d) {
    fs.cpSync(path.join(APP, d), path.join(sandbox, d), { recursive: true });
  });
  fs.copyFileSync(path.join(APP, 'package.json'), path.join(sandbox, 'package.json'));
  fs.cpSync(FIXTURES, path.join(sandbox, 'data'), { recursive: true });
  return sandbox;
}

function runCli(args) {
  return childProcess.execFileSync(process.execPath, args, { cwd: sandboxApp(), encoding: 'utf8' });
}

var customersById = {};
customers.forEach(function (c) {
  customersById[c.id] = c;
});

function byNumber(number) {
  return invoices.filter(function (i) {
    return i.number === number;
  })[0];
}

// byte-for-byte comparison with a golden file (no newline normalisation:
// the accounting file is CRLF on purpose)
function assertGolden(name, actual) {
  var file = path.join(GOLDEN, name);
  if (process.env.UPDATE_GOLDEN) {
    fs.mkdirSync(GOLDEN, { recursive: true });
    fs.writeFileSync(file, actual, 'utf8');
  }
  assert.equal(actual, fs.readFileSync(file, 'utf8'), 'golden master ' + name);
}

test.after(function () {
  store.open();
  if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true });
});

// --- 0. the shared helper itself --------------------------------------------

test('formatDate: current output is MM/DD/YYYY in UTC', function () {
  assert.equal(format.formatDate('2026-03-09'), '03/09/2026');
  assert.equal(format.formatDate('2026-12-03T23:30:00+02:00'), '12/03/2026'); // only the date part is used
  assert.equal(format.formatDate(new Date(Date.UTC(2026, 0, 5))), '01/05/2026');
  assert.equal(format.formatDate(''), '');
  assert.equal(format.formatDate(null), '');
  assert.equal(format.formatDate('not a date'), '');
});

// --- 1. invoice HTML (people) ------------------------------------------------

test('invoice HTML for INV-2026-00007 matches the golden master', function () {
  var inv = byNumber('INV-2026-00007');
  assertGolden('invoice-INV-2026-00007.html', renderInvoice.renderInvoiceHtml(inv, customersById[inv.customer_id]));
});

test('GET /invoices/:number serves the same HTML', function (t, done) {
  store.open(FIXTURES);
  var route = invoiceRoutes.filter(function (r) {
    return r.method === 'GET' && r.path === '/invoices/:number';
  })[0];
  route.handler(null, null, { params: { number: 'INV-2026-00007' }, query: {} }, function (err, status, html) {
    assert.ifError(err);
    assert.equal(status, 200);
    assertGolden('invoice-INV-2026-00007.html', html);
    done();
  });
});

test('bin/render-invoice.js prints the same HTML', function () {
  var out = runCli(['bin/render-invoice.js', 'INV-2026-00007']);
  assertGolden('invoice-INV-2026-00007.html', out);
});

// --- 2. reminder mails (people) ---------------------------------------------

test('reminder mails for 2026-03-13 (upcoming + overdue) match the golden master', function () {
  var mails = reminders.buildReminders(invoices, customersById, '2026-03-13');
  var kinds = mails.map(function (m) {
    return m.kind;
  });
  assert.ok(kinds.indexOf('upcoming') !== -1, 'fixture day must produce an upcoming reminder');
  assert.ok(kinds.indexOf('overdue') !== -1, 'fixture day must produce an overdue reminder');
  assertGolden('reminders-2026-03-13.json', JSON.stringify(mails, null, 2) + '\n');
});

test('bin/send-reminders.js writes the same mails to the outbox (cron entry point)', function () {
  runCli(['bin/send-reminders.js', '2026-03-13']);
  var outbox = path.join(sandboxApp(), 'out', 'mail');
  var files = fs.readdirSync(outbox).sort();
  assert.equal(files.length, 7);
  var all = files
    .map(function (f) {
      return '=== ' + f + '\n' + fs.readFileSync(path.join(outbox, f), 'utf8');
    })
    .join('');
  assertGolden('outbox-2026-03-13.txt', all);
});

// --- 3. accounting export (another system: Облік-Плюс) ----------------------

test('accounting CSV for Облік-Плюс matches the golden master byte for byte', function () {
  var csv = accounting.buildAccountingFile(invoices, customersById);
  assertGolden('oblik-export.csv', csv);
});

test('bin/nightly-export.js writes the same file (cron entry point)', function () {
  runCli(['bin/nightly-export.js', '2026-03-13']);
  var file = path.join(sandboxApp(), 'out', 'export', 'oblik-2026-03-13.csv');
  assertGolden('oblik-export.csv', fs.readFileSync(file, 'utf8'));
});

test('accounting CSV: date columns are MM/DD/YYYY (the importer silently skips other formats)', function () {
  var csv = accounting.buildAccountingFile([byNumber('INV-2026-00009')], customersById);
  var row = csv.split('\r\n')[1].split(';');
  assert.equal(row[0], 'INV-2026-00009');
  assert.equal(row[1], '03/09/2026'); // DocDate
  assert.equal(row[2], '03/23/2026'); // PayUntil
});
