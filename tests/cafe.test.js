import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace, validateWorkspace } from '../src/model.js';
import { beanBalance, buy, earnedBeans, visit } from '../src/cafe.js';

// Edit the bean rules in src/cafe.js; these tests describe the current ones.
const DAY = '2026-03-03';

function build(logs, daysOff = []) {
  const workspace = createWorkspace();
  workspace.lists.push(
    { id: 'a', name: 'Math', unit: 'pages', targets: [{ from: '0001-01-01', units: 2 }] },
    { id: 'b', name: 'Reading', unit: 'pages', targets: [{ from: '0001-01-01', units: 3 }] },
  );
  workspace.school.logs = logs.map(([listId, units], i) => ({ id: `l${i}`, listId, date: DAY, units }));
  if (daysOff.length) workspace.school.logs.push({ id: 'saved', listId: 'b', date: '2026-02-28', units: 6 });
  workspace.school.daysOff = daysOff.map(([listId, date], i) => ({ id: `d${i}`, listId, date }));
  return validateWorkspace(workspace);
}

test('one bean per met target, plus three when every target is met', () => {
  assert.equal(earnedBeans(build([['a', 1]])), 0);
  assert.equal(earnedBeans(build([['a', 2]])), 1);
  assert.equal(earnedBeans(build([['a', 2], ['b', 3]])), 5);
});

test('lowering a log takes the beans back', () => {
  assert.equal(earnedBeans(build([['a', 2], ['b', 3]])), 5);
  assert.equal(earnedBeans(build([['a', 2], ['b', 2]])), 1);
});

test('subjects with a spent day off are left out', () => {
  const workspace = build([['a', 2]], [['b', DAY]]);
  assert.equal(earnedBeans(workspace), 5);
});

test('visits earn a daily bean once, buying spends beans, and the balance never goes below zero', () => {
  let workspace = visit(visit(build([['a', 2], ['b', 3]]), DAY), DAY);
  assert.equal(beanBalance(workspace), 6);
  workspace = buy(workspace, 'latte');
  assert.equal(beanBalance(workspace), 2);
  assert.throws(() => buy(workspace, 'cookie'), /1 more bean/);
  assert.throws(() => buy(buy(buy(workspace, 'coffee'), 'coffee'), 'plant'), /more beans|already/);
  const lowered = { ...workspace, school: { ...workspace.school, logs: [] } };
  assert.equal(beanBalance(lowered), 0);
});
