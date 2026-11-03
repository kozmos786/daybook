import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace, validateWorkspace } from '../src/model.js';
import { PRESET, WEEKS, guideStarted, moveTask, nextMonday, startSchoolYear, swapDueDates } from '../src/guide.js';

test('next Monday is always a Monday on or after the date', () => {
  assert.equal(nextMonday('2026-10-26'), '2026-10-26');
  assert.equal(nextMonday('2026-10-27'), '2026-11-02');
  assert.equal(nextMonday('2026-11-01'), '2026-11-02');
});

test('starting the school year adds preset subjects, targets, and weekly Friday reviews once', () => {
  const started = startSchoolYear(createWorkspace(), '2026-10-26', '2026-10-26');
  assert.equal(guideStarted(createWorkspace()), false);
  assert.equal(guideStarted(started), true);
  assert.equal(started.lists.length, PRESET.length + 1);
  assert.equal(started.tasks.length, PRESET.length * WEEKS);
  assert.ok(started.lists.slice(1).every((list) => list.targets?.[0].units > 0));
  const math = started.lists.find((list) => list.name === 'Math');
  const first = started.tasks.find((task) => task.listId === math.id);
  assert.equal(first.dueDate, '2026-10-30');
  assert.deepEqual(validateWorkspace(JSON.parse(JSON.stringify(started))), started);
  assert.equal(startSchoolYear(started, '2026-10-26', '2026-10-26').tasks.length, started.tasks.length);
  assert.throws(() => startSchoolYear(createWorkspace(), '2026-10-27', '2026-10-27'), /Monday/);
});

test('assignments can be moved and swapped', () => {
  const ws = startSchoolYear(createWorkspace(), '2026-10-26', '2026-10-26');
  const [a, b] = ws.tasks;
  const swapped = swapDueDates(ws, a.id, ws.tasks[40].id);
  assert.equal(swapped.tasks[0].dueDate, ws.tasks[40].dueDate);
  assert.equal(swapped.tasks[40].dueDate, a.dueDate);
  assert.equal(moveTask(ws, b.id, '2027-01-01').tasks[1].dueDate, '2027-01-01');
  assert.throws(() => moveTask(ws, b.id, 'soon'), /valid date/);
  assert.throws(() => swapDueDates(ws, a.id, a.id), /two different/);
});
