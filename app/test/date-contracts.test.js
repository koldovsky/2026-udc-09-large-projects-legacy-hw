var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var os = require('node:os');
var path = require('node:path');
var execFileSync = require('node:child_process').execFileSync;
var format = require('../lib/format');
var render = require('../lib/invoices/render');
var reminders = require('../lib/notifications/reminders');
var accounting = require('../lib/export/accounting');
var store = require('../lib/store');
var fixture = require('./fixtures/date-contract-input.json');

function golden(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function invoiceStore(t) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-date-contracts-'));
  t.after(function () { fs.rmSync(dir, { recursive: true, force: true }); });
  fs.writeFileSync(path.join(dir, 'invoices.json'), JSON.stringify([fixture.invoice]));
  fs.writeFileSync(path.join(dir, 'customers.json'), JSON.stringify([fixture.customer]));
  // Preload the same isolated store in the CLI child, without production flags.
  fs.writeFileSync(path.join(dir, 'open-store.cjs'),
    'require(' + JSON.stringify(require.resolve('../lib/store')) + ').open(__dirname);\n');
  return dir;
}

test('legacy date contract: UTC, padding, timestamp strings and empty values', function () {
  assert.equal(format.formatDate('2026-03-09'), '03/09/2026');
  assert.equal(format.formatDate('2024-02-29T23:59:00Z'), '02/29/2024');
  assert.equal(format.formatDate(new Date('2026-12-31T23:59:00-02:00')), '01/01/2027');
  [null, undefined, '', 'not-a-date', new Date(NaN)].forEach(function (value) {
    assert.equal(format.formatDate(value), '');
  });
});

test('customer date contract: Ukrainian order with the same UTC and empty-value semantics', function () {
  assert.equal(format.formatCustomerDate('2026-03-09'), '09.03.2026');
  assert.equal(format.formatCustomerDate('2024-02-29T23:59:00Z'), '29.02.2024');
  assert.equal(format.formatCustomerDate(new Date('2026-12-31T23:59:00-02:00')), '01.01.2027');
  [null, undefined, '', 'not-a-date', new Date(NaN)].forEach(function (value) {
    assert.equal(format.formatCustomerDate(value), '');
  });
});

test('invoice HTML complete output contract', function () {
  assert.equal(render.renderInvoiceHtml(fixture.invoice, fixture.customer), golden('invoice.html'));
});

['upcoming', 'overdue'].forEach(function (kind) {
  test(kind + ' reminder complete output contract', function () {
    var today = kind === 'upcoming' ? '2026-03-09' : '2026-03-13';
    var mails = reminders.buildReminders([fixture.invoice], { 1: fixture.customer }, today);
    assert.equal(JSON.stringify(mails, null, 2) + '\n', golden(kind + '.json'));
  });
});

test('accounting complete bytes: dynamic dates, CRLF, decimals, text and draft exclusion', function () {
  var draft = Object.assign({}, fixture.invoice, { status: 'draft', number: 'DRAFT' });
  assert.equal(accounting.buildAccountingFile([fixture.invoice, draft], { 1: fixture.customer }), golden('accounting.csv'));
});

test('accounting missing customer and empty dates contract', function () {
  var invoice = Object.assign({}, fixture.invoice, { issued_at: null, due_at: '' });
  assert.equal(accounting.buildAccountingFile([invoice], {}), golden('accounting-empty.csv'));
});

test('invoice CLI complete output contract', function (t) {
  var dir = invoiceStore(t);
  var actual = execFileSync(process.execPath, ['--require', path.join(dir, 'open-store.cjs'), 'bin/render-invoice.js', fixture.invoice.number], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8',
  });
  assert.equal(actual, golden('invoice.html'));
});

test('invoice HTTP handler complete output contract without starting a server', function (t, done) {
  store.open(invoiceStore(t));
  t.after(function () { store.open(); });
  var route = require('../lib/invoices/routes').find(function (r) { return r.path === '/invoices/:number'; });
  route.handler({}, {}, { params: { number: fixture.invoice.number } }, function (err, status, html) {
    if (err) return done(err);
    try {
      assert.equal(status, 200);
      assert.equal(html, golden('invoice.html'));
    } catch (e) {
      return done(e);
    }
    done();
  });
});
