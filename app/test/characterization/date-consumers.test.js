/**
 * Characterization tests for everything that goes through format.formatDate
 * (BILL-482, see docs/impact.md). They pin what the code does TODAY, not what
 * it should do.
 *
 * Golden masters live in ./golden. To regenerate after an intended change:
 *   UPDATE_GOLDEN=1 npm test     (then review the diff before committing!)
 *
 * Inputs are the shared fixtures in data/*.json, read with JSON.parse so the
 * store cache and the fixtures themselves are never touched.
 */
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var format = require('../../lib/format');
var render = require('../../lib/invoices/render');
var reminders = require('../../lib/notifications/reminders');
var accounting = require('../../lib/export/accounting');

var GOLDEN_DIR = path.join(__dirname, 'golden');
var DATA_DIR = path.join(__dirname, '..', '..', 'data');

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name + '.json'), 'utf8'));
}

function customersById() {
  var byId = {};
  fixture('customers').forEach(function (c) { byId[c.id] = c; });
  return byId;
}

function golden(name, actual) {
  var file = path.join(GOLDEN_DIR, name);
  if (process.env.UPDATE_GOLDEN === '1') {
    fs.mkdirSync(GOLDEN_DIR, { recursive: true });
    fs.writeFileSync(file, actual, 'utf8');
    return;
  }
  var expected = fs.readFileSync(file, 'utf8');
  assert.equal(actual, expected, name + ' differs from the golden master (UPDATE_GOLDEN=1 if the change is intended)');
}

// --- the shared helper itself ------------------------------------------------

test('formatDate: current output, including the odd cases', function () {
  assert.equal(format.formatDate('2026-03-09'), '03/09/2026');
  assert.equal(format.formatDate('2026-12-31'), '12/31/2026');
  // a timestamp is cut to its date part, a Date is read in UTC
  assert.equal(format.formatDate('2026-03-09T23:30:00Z'), '03/09/2026');
  assert.equal(format.formatDate(new Date(Date.UTC(2026, 2, 9, 23, 30))), '03/09/2026');
  // an impossible day rolls over into the next month instead of failing
  assert.equal(format.formatDate('2026-02-30'), '03/02/2026');
  assert.equal(format.formatDate('2026-13-01'), '');
  assert.equal(format.formatDate('garbage'), '');
  assert.equal(format.formatDate(20260309), '');
  assert.equal(format.formatDate(''), '');
  assert.equal(format.formatDate(null), '');
  assert.equal(format.formatDate(undefined), '');
});

// --- consumer 1: invoice HTML (GET /invoices/:number, bin/render-invoice.js) --

test('invoice HTML for every fixture invoice matches the golden master', function () {
  var byId = customersById();
  var out = fixture('invoices').map(function (inv) {
    return '=== ' + inv.number + '\n' + render.renderInvoiceHtml(inv, byId[inv.customer_id]) + '\n';
  }).join('');
  golden('invoices.html.txt', out);
});

test('invoice HTML: date line in DD.MM.YYYY (BILL-482)', function () {
  var inv = fixture('invoices').filter(function (i) { return i.number === 'INV-2026-00007'; })[0];
  var html = render.renderInvoiceHtml(inv, customersById()[inv.customer_id]);
  assert.match(html, /<p class="dates">Дата: <b>07\.03\.2026<\/b> · Сплатити до: <b>21\.03\.2026<\/b><\/p>/);
});

// --- consumer 2: reminder mails (bin/send-reminders.js -> out/mail) ----------

// 2026-03-12 gives both kinds: upcoming for due 2026-03-15, overdue for February
var REMINDER_DAY = '2026-03-12';

test('reminder mails for ' + REMINDER_DAY + ' match the golden master', function () {
  var mails = reminders.buildReminders(fixture('invoices'), customersById(), REMINDER_DAY);
  var kinds = {};
  mails.forEach(function (m) { kinds[m.kind] = true; });
  assert.deepEqual(Object.keys(kinds).sort(), ['overdue', 'upcoming'], 'fixture day must cover both kinds');
  // same layout as the files bin/send-reminders.js writes
  var out = mails.map(function (m) {
    return '=== ' + REMINDER_DAY + '-' + m.kind + '-' + m.invoice_id + '.txt\n' +
      'To: ' + m.to + '\nSubject: ' + m.subject + '\n\n' + m.text + '\n';
  }).join('');
  golden('reminders-' + REMINDER_DAY + '.txt', out);
});

test('reminder mails: due date in DD.MM.YYYY (BILL-482)', function () {
  var inv = { id: 5, number: 'INV-2026-00005', status: 'issued', due_at: '2026-03-12', total_kopecks: 99900, customer_id: 1 };
  var customers = { 1: { id: 1, email: 'client1@example.invalid', contact_name: 'Ірина' } };
  assert.match(reminders.buildReminders([inv], customers, '2026-03-09')[0].text, /слід сплатити до 12\.03\.2026\./);
  assert.match(reminders.buildReminders([inv], customers, '2026-03-13')[0].text, /мав бути сплачений до 12\.03\.2026\./);
});

// --- consumer 3: Облік-Плюс export (bin/nightly-export.js -> out/export) ------
// Reaches formatDate only through format['format' + col.type] and the
// "Date" columns in config/export-columns.json.

test('accounting export file matches the golden master byte for byte', function () {
  var out = accounting.buildAccountingFile(fixture('invoices'), customersById());
  golden('oblik-export.csv', out);
});

test('accounting export: MM/DD/YYYY dates, ";" and CRLF, as Облік-Плюс expects', function () {
  var out = accounting.buildAccountingFile(fixture('invoices'), customersById());
  var rows = out.split('\r\n');
  assert.equal(rows[0], 'DocNo;DocDate;PayUntil;Edrpou;Counterparty;NetAmount;Vat;Amount');
  assert.equal(rows[1], 'INV-2026-00001;03/01/2026;03/15/2026;10000001;ТОВ «Зелений Кут»;4827.50;965.50;5793.00');
  assert.equal(out.indexOf('\n'), out.indexOf('\r\n') + 1, 'every line ends with CRLF');
  rows.slice(1, -1).forEach(function (r) {
    assert.match(r.split(';')[1], /^\d{2}\/\d{2}\/\d{4}$/);
    assert.match(r.split(';')[2], /^\d{2}\/\d{2}\/\d{4}$/);
  });
});
