var test = require('node:test');
var assert = require('node:assert/strict');
var invoices = require('../lib/invoices');
var render = require('../lib/invoices/render');

var customer = { id: 1, name: 'ТОВ «Зелений Кут»', edrpou: '10000001' };
var invoice = {
  number: 'INV-2026-00007',
  issued_at: '2026-03-09',
  due_at: '2026-03-23',
  vat_rate: 20,
  subtotal_kopecks: 100000,
  vat_kopecks: 20000,
  total_kopecks: 120000,
  lines: [{ title: 'Папір А4, пачка', qty: 4, unit_price_kopecks: 25000 }],
};

test('totals: VAT on the subtotal, rounded half-up', function () {
  var t = invoices.totals([{ qty: 3, unit_price_kopecks: 3333 }], 20);
  assert.deepEqual(t, { subtotal_kopecks: 9999, vat_kopecks: 2000, total_kopecks: 11999 });
});

test('invoiceNumber is zero-padded', function () {
  assert.equal(invoices.invoiceNumber(2026, 42), 'INV-2026-00042');
});

test('due date is 14 days after issue', function () {
  assert.equal(invoices.addDays('2026-03-09', invoices.PAYMENT_TERM_DAYS), '2026-03-23');
});

test('isOverdue ignores paid and cancelled', function () {
  assert.equal(invoices.isOverdue({ status: 'issued', due_at: '2026-03-01' }, '2026-03-02'), true);
  assert.equal(invoices.isOverdue({ status: 'paid', due_at: '2026-03-01' }, '2026-03-02'), false);
  assert.equal(invoices.isOverdue({ status: 'cancelled', due_at: '2026-03-01' }, '2026-03-02'), false);
});

test('rendered invoice shows number, customer, dates and totals', function () {
  var html = render.renderInvoiceHtml(invoice, customer);
  assert.match(html, /Рахунок-фактура № INV-2026-00007/);
  assert.match(html, /ЄДРПОУ 10000001/);
  assert.match(html, /Дата: <b>09\.03\.2026<\/b>/);
  assert.match(html, /Сплатити до: <b>23\.03\.2026<\/b>/);
  assert.match(html, /До сплати: 1 200,00 грн/);
});

test('rendered invoice escapes HTML in customer names', function () {
  var html = render.renderInvoiceHtml(invoice, { name: '<script>x</script>' });
  assert.ok(html.indexOf('<script>x') === -1);
});

// --- Characterization tests: golden master for date format in HTML invoice ---
// These tests lock the current behavior (DD.MM.YYYY via format.formatDateClient).
// If formatDateClient changes, these will fail — update them intentionally.

test('rendered invoice: date format is DD.MM.YYYY (golden master)', function () {
  var html = render.renderInvoiceHtml(invoice, customer);
  // issued_at: 2026-03-09 -> 09.03.2026
  assert.match(html, /Дата: <b>09\.03\.2026<\/b>/);
  // due_at: 2026-03-23 -> 23.03.2026
  assert.match(html, /Сплатити до: <b>23\.03\.2026<\/b>/);
});

test('rendered invoice: different dates produce correct DD.MM.YYYY', function () {
  var inv2 = Object.assign({}, invoice, {
    number: 'INV-2026-00008',
    issued_at: '2026-12-31',
    due_at: '2027-01-14',
  });
  var html = render.renderInvoiceHtml(inv2, customer);
  assert.match(html, /Дата: <b>31\.12\.2026<\/b>/);
  assert.match(html, /Сплатити до: <b>14\.01\.2027<\/b>/);
});

test('rendered invoice: amounts use formatMoney (space thousands, comma decimal, грн)', function () {
  var html = render.renderInvoiceHtml(invoice, customer);
  assert.match(html, /До сплати: 1 200,00 грн/);
  assert.match(html, /ПДВ 20%: 200,00 грн/);
  assert.match(html, /Разом без ПДВ: 1 000,00 грн/);
});
