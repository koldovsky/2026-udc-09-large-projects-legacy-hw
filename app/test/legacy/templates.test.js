var test = require('node:test');
var assert = require('node:assert/strict');
var templates = require('../../lib/legacy/templates');

test('substitutes {{var}} and tolerates spaces inside the braces', function () {
  var tpl = templates.compile('Шановний {{ contact }}, рахунок {{number}}.');
  assert.equal(tpl({ contact: 'Ірина', number: 'INV-2026-00007' }), 'Шановний Ірина, рахунок INV-2026-00007.');
});

test('dotted paths reach into nested objects', function () {
  var tpl = templates.compile('{{customer.name}} ({{customer.address.city}})');
  var out = tpl({ customer: { name: 'ТОВ «Зелений Кут»', address: { city: 'Київ' } } });
  assert.equal(out, 'ТОВ «Зелений Кут» (Київ)');
});

test('escapes HTML by default, {{{triple}}} is inserted raw', function () {
  var tpl = templates.compile('<p>{{name}}</p>{{{footer}}}');
  var out = tpl({ name: '<b>"A & B"</b>', footer: '<hr>' });
  assert.equal(out, '<p>&lt;b&gt;&quot;A &amp; B&quot;&lt;/b&gt;</p><hr>');
});

test('missing and null values become empty strings, but 0 is kept', function () {
  var tpl = templates.compile('[{{a}}][{{b}}][{{c.d.e}}][{{zero}}]');
  assert.equal(tpl({ b: null, zero: 0 }), '[][][][0]');
});

test('the same compiled template can be reused with different data', function () {
  var tpl = templates.compile('{{n}}:{{title}}');
  assert.equal(tpl({ n: 1, title: 'Степлер' }), '1:Степлер');
  assert.equal(tpl({ n: 2, title: 'Скріпки' }), '2:Скріпки');
});

// --- Characterization test: golden master for date helper (dmy = DD.MM.YYYY) ---
// This is a SEPARATE date formatter from lib/format.formatDate (which is MM/DD/YYYY).
// It's used by the legacy Handlebars templates (removed in 2020, but helper remains).

test('date helper (dmy): formats ISO date as DD.MM.YYYY (golden master)', function () {
  var tpl = templates.compile('{{date issued_at}}');
  assert.equal(tpl({ issued_at: '2026-03-09' }), '09.03.2026');
  assert.equal(tpl({ issued_at: '2026-12-31' }), '31.12.2026');
  assert.equal(tpl({ issued_at: '2025-01-01' }), '01.01.2025');
  assert.equal(tpl({ issued_at: '' }), '');
  assert.equal(tpl({ issued_at: null }), '');
  assert.equal(tpl({ issued_at: undefined }), '');
});

test('date helper works inside expressions with dotted paths', function () {
  var tpl = templates.compile('Дата: {{date invoice.issued_at}}');
  assert.equal(tpl({ invoice: { issued_at: '2026-03-09' } }), 'Дата: 09.03.2026');
});
