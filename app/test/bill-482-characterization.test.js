/**
 * BILL-482 characterization tests.
 *
 * They pin what format.formatDate and each of its consumers print today,
 * before the date format changes. Every file in test/golden/ is the exact
 * output of one consumer, captured from the unchanged code on the fixtures.
 * A red test here means that consumer's output changed; docs/impact.md
 * says which of those changes the ticket intends.
 *
 * The first four tests call each consumer directly. The last four run the
 * real entry points (the HTTP route and the three bin/ scripts) against the
 * same golden files, so a change in the wiring is caught too.
 */
var test = require('node:test');
var assert = require('node:assert/strict');
var childProcess = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');
var format = require('../lib/format');
var render = require('../lib/invoices/render');
var reminders = require('../lib/notifications/reminders');
var accounting = require('../lib/export/accounting');
var server = require('../server');
var invoices = require('../data/invoices.json');
var customers = require('../data/customers.json');

var APP = path.join(__dirname, '..');

var customersById = {};
customers.forEach(function (c) {
  customersById[c.id] = c;
});

function golden(name) {
  return fs.readFileSync(path.join(__dirname, 'golden', name), 'utf8');
}

// The cron scripts write under out/ next to their own bin/, so they run in a
// throwaway copy of the app and never touch app/out/ or app/data/.
function appCopy(t) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-bill-482-'));
  ['bin', 'lib', 'config', 'data'].forEach(function (d) {
    fs.cpSync(path.join(APP, d), path.join(dir, d), { recursive: true });
  });
  t.after(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function runScript(appDir, script, args) {
  return childProcess.execFileSync(process.execPath, [path.join(appDir, 'bin', script)].concat(args), {
    cwd: appDir,
    encoding: 'utf8',
  });
}

test('formatDate prints MM/DD/YYYY in UTC, and nothing for empty or invalid input', function () {
  assert.equal(format.formatDate('2026-03-09'), '03/09/2026');
  assert.equal(format.formatDate('2026-03-09T23:30:00Z'), '03/09/2026');
  assert.equal(format.formatDate(new Date(Date.UTC(2026, 2, 9))), '03/09/2026');
  assert.equal(format.formatDate(''), '');
  assert.equal(format.formatDate(null), '');
  assert.equal(format.formatDate('not a date'), '');
});

test('invoice HTML (renderInvoiceHtml, behind GET /invoices/:number and bin/render-invoice.js) matches the golden file', function () {
  var invoice = invoices.find(function (i) {
    return i.number === 'INV-2026-00007';
  });
  var html = render.renderInvoiceHtml(invoice, customersById[invoice.customer_id]);
  assert.equal(html, golden('invoice-INV-2026-00007.html'));
});

test('reminder mails for 2026-03-16 (bin/send-reminders.js) match the golden file', function () {
  var mails = reminders.buildReminders(invoices, customersById, '2026-03-16');
  assert.deepEqual(mails, JSON.parse(golden('reminders-2026-03-16.json')));
});

test('Oblik-Plus CSV (bin/nightly-export.js) matches the golden file byte for byte', function () {
  var csv = accounting.buildAccountingFile(invoices, customersById);
  assert.equal(csv, golden('oblik-export.csv'));
});

test('GET /invoices/INV-2026-00007 over HTTP serves the golden invoice page', async function (t) {
  var srv = server.createServer();
  await new Promise(function (resolve) {
    srv.listen(0, '127.0.0.1', resolve);
  });
  t.after(function () {
    srv.close();
    srv.closeAllConnections();
  });
  var res = await fetch('http://127.0.0.1:' + srv.address().port + '/invoices/INV-2026-00007');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(await res.text(), golden('invoice-INV-2026-00007.html'));
});

test('bin/render-invoice.js prints the golden invoice page', function () {
  assert.equal(runScript(APP, 'render-invoice.js', ['INV-2026-00007']), golden('invoice-INV-2026-00007.html'));
});

test('bin/send-reminders.js 2026-03-16 writes one outbox file per golden mail', function (t) {
  var dir = appCopy(t);
  runScript(dir, 'send-reminders.js', ['2026-03-16']);
  var outbox = path.join(dir, 'out', 'mail');
  var expected = {};
  JSON.parse(golden('reminders-2026-03-16.json')).forEach(function (m) {
    expected['2026-03-16-' + m.kind + '-' + m.invoice_id + '.txt'] =
      'To: ' + m.to + '\nSubject: ' + m.subject + '\n\n' + m.text + '\n';
  });
  var actual = {};
  fs.readdirSync(outbox).forEach(function (name) {
    actual[name] = fs.readFileSync(path.join(outbox, name), 'utf8');
  });
  assert.deepEqual(actual, expected);
});

test('bin/nightly-export.js 2026-03-16 writes the golden Oblik-Plus CSV byte for byte', function (t) {
  var dir = appCopy(t);
  runScript(dir, 'nightly-export.js', ['2026-03-16']);
  // read as utf8 without stripping anything, so a BOM or another encoding still shows up as a diff
  var written = fs.readFileSync(path.join(dir, 'out', 'export', 'oblik-2026-03-16.csv'), 'utf8');
  assert.equal(written, golden('oblik-export.csv'));
});
