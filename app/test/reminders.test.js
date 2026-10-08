var test = require('node:test');
var assert = require('node:assert/strict');
var reminders = require('../lib/notifications/reminders');

var inv = { id: 5, number: 'INV-2026-00005', status: 'issued', due_at: '2026-03-12', total_kopecks: 99900, customer_id: 1 };
var customers = { 1: { id: 1, email: 'client1@example.invalid', contact_name: 'Ірина' } };

test('upcoming reminder exactly 3 days before due', function () {
  assert.equal(reminders.reminderKind(inv, '2026-03-09'), 'upcoming');
  assert.equal(reminders.reminderKind(inv, '2026-03-10'), null);
});

test('overdue reminder once', function () {
  assert.equal(reminders.reminderKind(inv, '2026-03-13'), 'overdue');
  assert.equal(reminders.reminderKind(Object.assign({}, inv, { overdue_reminded: true }), '2026-03-13'), null);
});

test('no reminders for paid, cancelled or draft invoices', function () {
  ['paid', 'cancelled', 'draft'].forEach(function (s) {
    assert.equal(reminders.reminderKind(Object.assign({}, inv, { status: s }), '2026-03-13'), null);
  });
});

test('reminder mail addresses the contact and names the amount', function () {
  var mails = reminders.buildReminders([inv], customers, '2026-03-09');
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'client1@example.invalid');
  assert.match(mails[0].text, /^Ірина,/);
  assert.match(mails[0].text, /999,00 грн/);
});

// Characterization (BILL-482): pins the due date exactly as it appears in the
// mail body. Before the ticket this was the "03/12/2026" the ticket complains
// about; after it, the same date reads 12.03.2026 (дд.мм.рррр). See
// docs/impact.md §5. Both the upcoming and overdue wording share this value.
test('reminder mail date uses the shared formatter (characterization, BILL-482)', function () {
  var upcoming = reminders.buildReminders([inv], customers, '2026-03-09');
  assert.equal(
    upcoming[0].text,
    'Ірина,\n\nнагадуємо, що рахунок INV-2026-00005 на суму 999,00 грн слід сплатити до 12.03.2026.\n\n' +
      'З повагою,\nТОВ «Приклад Постач»',
  );

  var overdue = reminders.buildReminders([inv], customers, '2026-03-13');
  assert.equal(
    overdue[0].text,
    'Ірина,\n\nрахунок INV-2026-00005 на суму 999,00 грн мав бути сплачений до 12.03.2026.\n' +
      'Якщо ви вже сплатили — просто проігноруйте цей лист.\n\nЗ повагою,\nТОВ «Приклад Постач»',
  );
});
