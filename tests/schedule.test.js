import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace, validateWorkspace } from '../src/model.js';
import { defaultSchedule, forecast, doneCount } from '../src/schedule.js';

// Edit these to change the scenario: Monday 2026-03-02, a 10 lesson subject at 1 per weekday.
const MONDAY = '2026-03-02';
const ID = 'math';

function build(overrides = {}, school = {}) {
  const workspace = createWorkspace();
  workspace.lists.push({ id: ID, name: 'Math' });
  workspace.schedules = [{ ...defaultSchedule(ID, MONDAY), total: 10, ...overrides }];
  workspace.school = { ...workspace.school, ...school };
  return validateWorkspace(workspace);
}

test('finish date skips weekends', () => {
  const workspace = build();
  const result = forecast(workspace, workspace.schedules[0], MONDAY);
  assert.equal(result.planned, '2026-03-13');
  assert.equal(result.left, 10);
});

test('holidays and breaks push the finish date out', () => {
  const workspace = build({}, {
    holidays: ['2026-03-03'], breaks: [{ id: 'b', from: '2026-03-09', to: '2026-03-10', label: 'Trip' }],
  });
  assert.equal(forecast(workspace, workspace.schedules[0], MONDAY).planned, '2026-03-18');
});

test('logged lessons count from the start date and move the finish date in', () => {
  const workspace = build({ startDone: 2 }, { logs: [
    { id: 'l1', listId: ID, date: MONDAY, units: 3 },
    { id: 'l0', listId: ID, date: '2026-02-27', units: 5 },
  ] });
  const schedule = workspace.schedules[0];
  assert.equal(doneCount(workspace, schedule), 5);
  assert.equal(forecast(workspace, schedule, '2026-03-03').planned, '2026-03-09');
});

test('a goal date reports the pace needed', () => {
  const workspace = build({ goalDate: '2026-03-06' });
  const { goal } = forecast(workspace, workspace.schedules[0], MONDAY);
  assert.equal(goal.days, 5);
  assert.equal(goal.neededPerDay, 2);
  assert.equal(goal.onTrack, false);
});

test('finished subjects report finished and invalid schedules are rejected', () => {
  const workspace = build({ startDone: 10 });
  assert.equal(forecast(workspace, workspace.schedules[0], MONDAY).finished, true);
  assert.throws(() => build({ pace: [0, 0, 0, 0, 0, 0, 0] }), /at least one school day/);
  assert.throws(() => build({ startDone: 11 }), /Lessons already done/);
});
