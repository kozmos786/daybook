import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace, validateWorkspace } from '../src/model.js';
import {
  GRADES, WEEKS, guideStarted, moveTask, nextMonday, presetFor, startSchoolYear, subjectStyle, swapDueDates,
} from '../src/guide.js';

test('next Monday is always a Monday on or after the date', () => {
  assert.equal(nextMonday('2026-10-26'), '2026-10-26');
  assert.equal(nextMonday('2026-10-27'), '2026-11-02');
  assert.equal(nextMonday('2026-11-01'), '2026-11-02');
});

test('every grade has five valid subjects and math follows the course sequence', () => {
  for (const grade of GRADES) {
    for (const advanced of [false, true]) {
      const subjects = presetFor(grade, advanced);
      assert.equal(subjects.length, 5);
      assert.equal(new Set(subjects.map((s) => s.name)).size, 5);
      assert.ok(subjects.every((s) => Number.isInteger(s.target) && s.target > 0 && s.unit));
    }
  }
  const math = (grade, advanced) => presetFor(grade, advanced)[0].name;
  assert.deepEqual([math(5), math(8), math(9), math(10), math(11), math(12)],
    ['Math', 'Pre-Algebra', 'Algebra 1', 'Geometry', 'Algebra 2', 'Pre-Calculus']);
  assert.equal(math(8, true), 'Algebra 1');
  assert.equal(math(12, true), 'Calculus');
  assert.ok(presetFor(10).some((s) => s.name === 'Chemistry'));
  assert.ok(presetFor(11).some((s) => s.name === 'US History'));
  assert.throws(() => presetFor(13), /grade from 1 to 12/);
  assert.equal(subjectStyle('Algebra 2').emoji, subjectStyle('Math').emoji);
  assert.notEqual(subjectStyle('Physics').emoji, subjectStyle('Unknown').emoji);
});

test('starting the school year adds the grade subjects, targets, and weekly Friday reviews once', () => {
  const started = startSchoolYear(createWorkspace(), '2026-10-26', '2026-10-26', 9);
  assert.equal(guideStarted(createWorkspace(), 9), false);
  assert.equal(guideStarted(started, 9), true);
  assert.equal(guideStarted(started, 6), false);
  assert.equal(started.lists.length, 6);
  assert.equal(started.tasks.length, 5 * WEEKS);
  assert.ok(started.lists.slice(1).every((list) => list.targets?.[0].units > 0));
  const algebra = started.lists.find((list) => list.name === 'Algebra 1');
  assert.equal(started.tasks.find((task) => task.listId === algebra.id).dueDate, '2026-10-30');
  assert.deepEqual(validateWorkspace(JSON.parse(JSON.stringify(started))), started);
  assert.equal(startSchoolYear(started, '2026-10-26', '2026-10-26', 9).tasks.length, started.tasks.length);
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
