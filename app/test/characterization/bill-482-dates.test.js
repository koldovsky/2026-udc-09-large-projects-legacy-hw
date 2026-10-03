/**
 * Characterization tests for every consumer of lib/format.js formatDate
 * (BILL-482), written BEFORE the change and green on the unchanged code.
 *
 * Three consumers reach formatDate:
 *   1. lib/invoices/render.js      -> HTML invoice            (human)
 *   2. lib/notifications/reminders.js -> reminder mails       (human)
 *   3. lib/export/accounting.js    -> Облік-Плюс CSV          (MACHINE)
 *
 * (1) and (2) are what the ticket is about and are MEANT to become dd.mm.yyyy.
 * (3) must not move — it is pinned in test/export/accounting.test.js.
 *
 * Tests below are tagged EXPECTED-TO-CHANGE or MUST-NOT-CHANGE so that whoever
 * runs the suite after the change can tell a red light apart from a regression.
 */
var test = require('node:test');
var assert = require('node:assert/strict');
var format = require('../../lib/format');
var render = require('../../lib/invoices/render');
var reminders = require('../../lib/notifications/reminders');

var customer = { id: 1, name: 'ТОВ «Зелений Кут»', edrpou: '10000001', email: 'client1@example.invalid', contact_name: 'Ірина' };
var invoice = {
  id: 7,
  number: 'INV-2026-00007',
  customer_id: 1,
  issued_at: '2026-03-09',
  due_at: '2026-03-23',
  status: 'issued',
  vat_rate: 20,
  subtotal_kopecks: 100000,
  vat_kopecks: 20000,
  total_kopecks: 120000,
  lines: [{ title: 'Папір А4, пачка', qty: 4, unit_price_kopecks: 25000 }],
};

// --- the shared formatter itself (had no test at all before BILL-482) -------

// BILL-482 resolution: formatDate was NOT touched. It is the «Облік-Плюс» wire
// format, so this test stayed green through the change and is relabelled from
// EXPECTED-TO-CHANGE to MUST-NOT-CHANGE. The new customer-facing format lives in
// formatDateUA, pinned just below.
test('MUST-NOT-CHANGE formatDate stays MM/DD/YYYY — it is the Облік-Плюс wire format', function () {
  assert.equal(format.formatDate('2026-03-09'), '03/09/2026');
  assert.equal(format.formatDate('2026-12-03'), '12/03/2026');
  assert.equal(format.formatDate('2026-01-01'), '01/01/2026');
  assert.equal(format.formatDate(new Date('2026-03-09T00:00:00Z')), '03/09/2026');
});

test('BILL-482 formatDateUA renders DD.MM.YYYY for customers', function () {
  assert.equal(format.formatDateUA('2026-03-09'), '09.03.2026');
  assert.equal(format.formatDateUA('2026-12-03'), '03.12.2026');
  assert.equal(format.formatDateUA('2026-01-01'), '01.01.2026');
  assert.equal(format.formatDateUA(new Date('2026-03-09T00:00:00Z')), '09.03.2026');
  // the ticket's own example: 03/09/2026 was being read as 3 September
  assert.equal(format.formatDateUA('2026-03-09'), '09.03.2026');
});

test('BILL-482 formatDateUA handles the same edge cases as formatDate', function () {
  assert.equal(format.formatDateUA(''), '');
  assert.equal(format.formatDateUA(null), '');
  assert.equal(format.formatDateUA(undefined), '');
  assert.equal(format.formatDateUA('not-a-date'), '');
  assert.equal(format.formatDateUA('2026-03-09T23:59:59+03:00'), '09.03.2026');
});

test('BILL-482 formatDate and formatDateUA are the same date, different order', function () {
  ['2026-01-02', '2026-12-31', '2026-03-09', '2026-11-05'].forEach(function (iso) {
    var us = format.formatDate(iso).split('/');
    var ua = format.formatDateUA(iso).split('.');
    assert.deepEqual(ua, [us[1], us[0], us[2]], iso);
  });
});

test('MUST-NOT-CHANGE formatDate edge cases: empty and unparsable input', function () {
  assert.equal(format.formatDate(''), '');
  assert.equal(format.formatDate(null), '');
  assert.equal(format.formatDate(undefined), '');
  assert.equal(format.formatDate('not-a-date'), '');
});

test('MUST-NOT-CHANGE formatDate reads the date in UTC, never local time', function () {
  // a full ISO timestamp is truncated to its date part before parsing
  assert.equal(format.formatDate('2026-03-09T23:59:59+03:00'), '03/09/2026');
});

// --- consumer 1: HTML invoice (human) --------------------------------------

// CHANGED BY BILL-482 (was 03/09/2026 and 03/23/2026): this is the invoice the
// ticket is about — the customer reads it, so DD.MM.YYYY.
test('BILL-482 invoice HTML shows both dates as DD.MM.YYYY', function () {
  var html = render.renderInvoiceHtml(invoice, customer);
  assert.match(html, /Дата: <b>09\.03\.2026<\/b>/);
  assert.match(html, /Сплатити до: <b>23\.03\.2026<\/b>/);
  assert.ok(html.indexOf('03/09/2026') === -1, 'no American date left in the invoice');
  assert.ok(html.indexOf('03/23/2026') === -1, 'no American date left in the invoice');
});

test('MUST-NOT-CHANGE invoice HTML keeps everything around the dates', function () {
  var html = render.renderInvoiceHtml(invoice, customer);
  assert.match(html, /<p class="dates">Дата: <b>[^<]+<\/b> · Сплатити до: <b>[^<]+<\/b><\/p>/);
  assert.match(html, /Рахунок-фактура № INV-2026-00007/);
  assert.match(html, /Платник: ТОВ «Зелений Кут» \(ЄДРПОУ 10000001\)/);
  assert.match(html, /Разом без ПДВ: 1 000,00 грн/);
  assert.match(html, /ПДВ 20%: 200,00 грн/);
  assert.match(html, /До сплати: 1 200,00 грн/);
});

// --- consumer 2: reminder mails (human) ------------------------------------

// CHANGED BY BILL-482 (was 03/23/2026): the ticket names these mails explicitly
// — «там теж «сплатити до 03/12/2026»».
test('BILL-482 upcoming reminder names the due date as DD.MM.YYYY', function () {
  var mails = reminders.buildReminders([invoice], { 1: customer }, '2026-03-20');
  assert.equal(mails.length, 1);
  assert.equal(mails[0].kind, 'upcoming');
  assert.match(mails[0].text, /слід сплатити до 23\.03\.2026\./);
  assert.ok(mails[0].text.indexOf('03/23/2026') === -1);
});

test('BILL-482 overdue reminder names the due date as DD.MM.YYYY', function () {
  var mails = reminders.buildReminders([invoice], { 1: customer }, '2026-03-24');
  assert.equal(mails.length, 1);
  assert.equal(mails[0].kind, 'overdue');
  assert.match(mails[0].text, /мав бути сплачений до 23\.03\.2026\./);
  assert.ok(mails[0].text.indexOf('03/23/2026') === -1);
});

test('MUST-NOT-CHANGE reminder envelope and wording around the date', function () {
  var mails = reminders.buildReminders([invoice], { 1: customer }, '2026-03-24');
  assert.equal(mails[0].to, 'client1@example.invalid');
  assert.equal(mails[0].subject, 'Прострочено: рахунок INV-2026-00007');
  assert.equal(mails[0].invoice_id, 7);
  assert.match(mails[0].text, /^Ірина,\n\nрахунок INV-2026-00007 на суму 1 200,00 грн мав бути сплачений до /);
  assert.match(mails[0].text, /\nЗ повагою,\nТОВ «Приклад Постач»$/);
});

// --- not a consumer, but it already does what the ticket asks --------------

test('MUST-NOT-CHANGE lib/legacy/templates.js date helper is already dd.mm.yyyy', function () {
  // Reference implementation of the target format, unreachable at runtime:
  // templates/ was deleted with the PDF service in 2020. Pinned so the change
  // does not "helpfully" unify the two.
  var templates = require('../../lib/legacy/templates');
  assert.equal(templates.compile('{{date d}}')({ d: '2026-03-09' }), '09.03.2026');
});

// --- the API returns raw stored dates, not formatted ones ------------------

test('MUST-NOT-CHANGE JSON API exposes stored ISO dates, untouched by formatDate', async function () {
  var server = require('../../server').createServer();
  await new Promise(function (r) {
    server.listen(0, r);
  });
  var port = server.address().port;
  // /api/* needs x-staff-id; the reverse proxy sets it after LDAP login
  var res = await fetch('http://127.0.0.1:' + port + '/api/invoices', { headers: { 'x-staff-id': '1' } });
  var rows = await res.json();
  assert.equal(res.status, 200);
  assert.ok(rows.length > 0);
  rows.forEach(function (r) {
    assert.match(r.issued_at, /^\d{4}-\d{2}-\d{2}$/, 'issued_at of ' + r.number);
    assert.match(r.due_at, /^\d{4}-\d{2}-\d{2}$/, 'due_at of ' + r.number);
  });

  // GET /api/invoices/:id returns the whole stored row — also raw ISO
  var single = await (await fetch('http://127.0.0.1:' + port + '/api/invoices/7', { headers: { 'x-staff-id': '1' } })).json();
  assert.match(single.issued_at, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(single.due_at, /^\d{4}-\d{2}-\d{2}$/);
  server.close();
});

// CHANGED BY BILL-482 (was 03/07/2026 and 03/21/2026).
test('BILL-482 the public HTML invoice route serves DD.MM.YYYY', async function () {
  // GET /invoices/:number is NOT under /api/, so it needs no x-staff-id — this
  // is the page the ticket is complaining about.
  var server = require('../../server').createServer();
  await new Promise(function (r) {
    server.listen(0, r);
  });
  var port = server.address().port;
  var res = await fetch('http://127.0.0.1:' + port + '/invoices/INV-2026-00007');
  var html = await res.text();
  server.close();
  assert.equal(res.status, 200);
  assert.match(html, /Дата: <b>07\.03\.2026<\/b>/);
  assert.match(html, /Сплатити до: <b>21\.03\.2026<\/b>/);
});
