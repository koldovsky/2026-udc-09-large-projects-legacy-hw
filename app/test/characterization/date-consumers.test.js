/**
 * Characterization tests for BILL-482: pin the output of everything that went
 * through lib/format.js formatDate before the change (see docs/impact.md,
 * section 2). Since BILL-482 the invoice and the reminders use formatDateUa,
 * the Облік-Плюс export still uses formatDate.
 *
 * Golden files in ./golden were captured from the unchanged code. After
 * BILL-482 only the dates in the three human-facing ones (invoice, reminders)
 * became DD.MM.YYYY; oblik-export.json is untouched (docs/impact.md, section 5).
 * They are JSON on purpose: the CSV for Облік-Плюс must keep its CRLF, and JSON
 * escapes survive git's autocrlf, raw .csv/.html files would not.
 */
var test = require('node:test');
var assert = require('node:assert/strict');
var http = require('http');
var path = require('path');
var childProcess = require('child_process');
var store = require('../../lib/store');
var format = require('../../lib/format');
var render = require('../../lib/invoices/render');
var reminders = require('../../lib/notifications/reminders');
var accounting = require('../../lib/export/accounting');
var createServer = require('../../server').createServer;

var APP = path.join(__dirname, '..', '..');

function golden(name) {
  return require('./golden/' + name);
}

// customers and invoices from data/, read-only, the same way bin/*.js load them
function seed() {
  return new Promise(function (resolve, reject) {
    store.all('customers', function (err, customers) {
      if (err) return reject(err);
      store.all('invoices', function (err2, invoices) {
        if (err2) return reject(err2);
        var byId = {};
        customers.forEach(function (c) { byId[c.id] = c; });
        resolve({ invoices: invoices, customersById: byId });
      });
    });
  });
}

function get(server, urlPath, headers) {
  return new Promise(function (resolve, reject) {
    http.get({ port: server.address().port, path: urlPath, headers: headers || {} }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        resolve({ status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(chunks).toString('utf8') });
      });
    }).on('error', reject);
  });
}

// --- the shared helper itself ----------------------------------------------

test('formatDate: current output is MM/DD/YYYY in UTC', function () {
  assert.equal(format.formatDate('2026-03-09'), '03/09/2026');
  assert.equal(format.formatDate('2026-12-31'), '12/31/2026');
  assert.equal(format.formatDate('2026-01-01'), '01/01/2026');
  // anything after the date part is ignored
  assert.equal(format.formatDate('2026-03-09T23:30:00+02:00'), '03/09/2026');
  // Date objects are formatted in UTC
  assert.equal(format.formatDate(new Date(Date.UTC(2026, 2, 9, 23, 30))), '03/09/2026');
});

test('formatDate: empty and broken input give an empty string', function () {
  assert.equal(format.formatDate(''), '');
  assert.equal(format.formatDate(null), '');
  assert.equal(format.formatDate(undefined), '');
  assert.equal(format.formatDate('not a date'), '');
  assert.equal(format.formatDate(new Date('x')), '');
});

// Task E: the goldens only ever feed formatDateUa valid dates, so these pin
// its edge cases directly (mutants U5, U6 in docs/task-e-bonus.md).
test('formatDateUa: DD.MM.YYYY in UTC', function () {
  assert.equal(format.formatDateUa('2026-03-09'), '09.03.2026');
  assert.equal(format.formatDateUa('2026-12-31'), '31.12.2026');
  assert.equal(format.formatDateUa('2026-03-09T23:30:00+02:00'), '09.03.2026');
  // 23:30 UTC is already the next day in Kyiv: must still be the UTC date
  assert.equal(format.formatDateUa(new Date(Date.UTC(2026, 2, 9, 23, 30))), '09.03.2026');
});

test('formatDateUa: empty and broken input give an empty string', function () {
  assert.equal(format.formatDateUa(''), '');
  assert.equal(format.formatDateUa(null), '');
  assert.equal(format.formatDateUa(undefined), '');
  assert.equal(format.formatDateUa('not a date'), '');
  assert.equal(format.formatDateUa(new Date('x')), '');
});

// --- consumer 1: HTML invoice over HTTP (GET /invoices/:number) -------------

test('GET /invoices/INV-2026-00007 serves the golden HTML', async function (t) {
  var server = createServer().listen(0);
  t.after(function () { server.close(); });
  await new Promise(function (resolve) { server.on('listening', resolve); });

  var res = await get(server, '/invoices/INV-2026-00007');
  assert.equal(res.status, 200);
  assert.equal(res.type, 'text/html; charset=utf-8');
  assert.equal(res.body, golden('invoice-INV-2026-00007.json'));
  assert.match(res.body, /Дата: <b>07\.03\.2026<\/b> · Сплатити до: <b>21\.03\.2026<\/b>/);
});

// --- consumer 2: the same HTML from the CLI (bin/render-invoice.js) --------

test('bin/render-invoice.js prints the same golden HTML', function () {
  var r = childProcess.spawnSync(process.execPath, ['bin/render-invoice.js', 'INV-2026-00007'], { cwd: APP, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, golden('invoice-INV-2026-00007.json'));
});

// --- consumers 1 + 2: dates line of every seeded invoice --------------------

test('renderInvoiceHtml: dates line of every seeded invoice matches the golden', async function () {
  var s = await seed();
  var actual = {};
  s.invoices.forEach(function (inv) {
    var html = render.renderInvoiceHtml(inv, s.customersById[inv.customer_id]);
    actual[inv.number] = /<p class="dates">.*?<\/p>/.exec(html)[0];
  });
  assert.deepEqual(actual, golden('invoice-dates.json'));
});

// --- consumer 3: reminder mails (bin/send-reminders.js) ---------------------

test('buildReminders on the seed data for 2026-03-18 matches the golden', async function () {
  var s = await seed();
  var mails = reminders.buildReminders(s.invoices, s.customersById, '2026-03-18');
  assert.deepEqual(mails, golden('reminders-2026-03-18.json'));

  // both kinds of mail carry a formatted due date
  var upcoming = mails.filter(function (m) { return m.invoice_id === 7; })[0];
  assert.equal(upcoming.kind, 'upcoming');
  assert.match(upcoming.text, /слід сплатити до 21\.03\.2026\./);
  var overdue = mails.filter(function (m) { return m.invoice_id === 2; })[0];
  assert.equal(overdue.kind, 'overdue');
  assert.match(overdue.text, /мав бути сплачений до 16\.03\.2026\./);
});

// --- consumer 4: nightly CSV for Облік-Плюс (bin/nightly-export.js) --------

test('buildAccountingFile on the seed data matches the golden byte for byte', async function () {
  var s = await seed();
  var g = golden('oblik-export.json');
  var expected = g.lines.join(g.eol) + g.eol;
  assert.equal(accounting.buildAccountingFile(s.invoices, s.customersById), expected);
});

// Task E: the seed data has no drafts, so nothing pinned the draft filter
// (mutant A1 in docs/task-e-bonus.md). A draft never reaches Облік-Плюс.
test('Облік-Плюс file: draft invoices are left out', async function () {
  var s = await seed();
  var draft = Object.assign({}, s.invoices[0], { id: 9999, number: 'INV-2026-09999', status: 'draft' });
  var g = golden('oblik-export.json');
  var csv = accounting.buildAccountingFile(s.invoices.concat([draft]), s.customersById);
  assert.equal(csv.indexOf('INV-2026-09999'), -1);
  assert.equal(csv, g.lines.join(g.eol) + g.eol);
});

test('Облік-Плюс file: DocDate and PayUntil are MM/DD/YYYY of issued_at / due_at', async function () {
  var s = await seed();
  var csv = accounting.buildAccountingFile(s.invoices, s.customersById);
  var lines = csv.split('\r\n');
  assert.equal(lines.pop(), ''); // file ends with CRLF
  var header = lines.shift().split(';');
  var docNo = header.indexOf('DocNo');
  var docDate = header.indexOf('DocDate');
  var payUntil = header.indexOf('PayUntil');
  assert.ok(docNo !== -1 && docDate !== -1 && payUntil !== -1);

  function us(iso) {
    return iso.slice(5, 7) + '/' + iso.slice(8, 10) + '/' + iso.slice(0, 4);
  }
  var byNumber = {};
  s.invoices.forEach(function (inv) { byNumber[inv.number] = inv; });
  assert.equal(lines.length, s.invoices.length); // no drafts in the seed data
  lines.forEach(function (line) {
    var cells = line.split(';');
    var inv = byNumber[cells[docNo]];
    assert.ok(inv, 'unknown invoice in export: ' + cells[docNo]);
    assert.equal(cells[docDate], us(inv.issued_at));
    assert.equal(cells[payUntil], us(inv.due_at));
  });
});
