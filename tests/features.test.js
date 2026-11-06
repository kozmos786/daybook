import test from 'node:test';
import assert from 'node:assert/strict';
import { reminderGroups, maybeNotify } from '../src/reminders.js';
import { resolveTheme } from '../src/theme.js';

const task = (title, dueDate, completed = false) => ({ id: title, title, dueDate, completed });

test('reminders group open tasks into overdue, today, and tomorrow', () => {
  const workspace = { tasks: [
    task('late', '2026-11-01'), task('now', '2026-11-05'), task('soon', '2026-11-06'),
    task('later', '2026-11-09'), task('done', '2026-11-05', true), { id: 'x', title: 'none', dueDate: null, completed: false },
  ] };
  const groups = reminderGroups(workspace, '2026-11-05');
  assert.deepEqual(groups.overdue.map((t) => t.title), ['late']);
  assert.deepEqual(groups.today.map((t) => t.title), ['now']);
  assert.deepEqual(groups.tomorrow.map((t) => t.title), ['soon']);
});

test('notifications fire once per day and only for overdue or due-today work', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const sent = [];
  function Fake(title, options) { sent.push([title, options.body]); }
  Fake.permission = 'granted';
  const groups = { overdue: [1], today: [1, 2], tomorrow: [] };
  maybeNotify(groups, '2026-11-05', storage, Fake);
  maybeNotify(groups, '2026-11-05', storage, Fake);
  assert.deepEqual(sent, [['Daybook reminder', '1 overdue, 2 due today']]);
  maybeNotify(groups, '2026-11-06', storage, Fake);
  assert.equal(sent.length, 2);
  maybeNotify({ overdue: [], today: [], tomorrow: [1] }, '2026-11-07', storage, Fake);
  assert.equal(sent.length, 2);
  Fake.permission = 'denied';
  maybeNotify(groups, '2026-11-08', storage, Fake);
  assert.equal(sent.length, 2);
});

test('auto theme follows the system preference', () => {
  assert.equal(resolveTheme('auto', true), 'dark');
  assert.equal(resolveTheme('auto', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});
