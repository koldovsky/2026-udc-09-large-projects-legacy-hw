var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var os = require('os');
var path = require('path');
var store = require('../lib/store');
var invoices = require('../lib/invoices');
var render = require('../lib/invoices/render');
var routes = require('../lib/invoices/routes');

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

test('GET /invoices/:number shows DD.MM.YYYY in the final HTML response', function (t, done) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-invoice-routes-'));
  fs.writeFileSync(path.join(dir, 'customers.json'), JSON.stringify([customer]));
  fs.writeFileSync(path.join(dir, 'invoices.json'), JSON.stringify([Object.assign({ id: 7, customer_id: 1 }, invoice)]));
  store.open(dir);

  var handler = routes.filter(function (r) { return r.method === 'GET' && r.path === '/invoices/:number'; })[0].handler;
  handler(null, null, { params: { number: invoice.number }, query: {}, body: null, staffId: 1 }, function (err, status, html) {
    store.open();
    fs.rmSync(dir, { recursive: true, force: true });
    assert.ifError(err);
    assert.equal(status, 200);
    assert.match(html, /Дата: <b>09\.03\.2026<\/b>/);
    assert.match(html, /Сплатити до: <b>23\.03\.2026<\/b>/);
    done();
  });
});
