import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorkspace, addTask, updateTask, deleteTask, addList, deleteList,
  visibleTasks, validateWorkspace, isCalendarDate, localDate, importText,
} from '../src/model.js';

test('task lifecycle validates titles and retains details across completion and reopening', () => {
  const original = createWorkspace();
  assert.throws(() => addTask(original, { title: ' \n ' }), /title must not be empty/);
  let state = addTask(original, { title: ' First task ', description: 'Notes', dueDate: '2028-02-29' });
  const id = state.tasks[0].id;
  assert.equal(original.tasks.length, 0);
  assert.equal(state.tasks[0].title, 'First task');
  state = updateTask(state, id, { title: 'Updated', completed: true });
  assert.equal(state.tasks[0].description, 'Notes');
  assert.equal(state.tasks[0].dueDate, '2028-02-29');
  assert.equal(visibleTasks(state).length, 0);
  state = updateTask(state, id, { completed: false });
  assert.equal(visibleTasks(state).length, 1);
  state = deleteTask(state, id);
  assert.equal(state.tasks.length, 0);
  assert.throws(() => updateTask(state, id, { completed: true }), /no longer exists/);
  assert.throws(() => deleteTask(state, id), /no longer exists/);
});

test('deleting a list moves its tasks to permanent Inbox without changing completion or due dates', () => {
  let state = addList(createWorkspace(), 'Home');
  const listId = state.lists[1].id;
  state = addTask(state, { title: 'Clean', listId, dueDate: '2026-10-23' });
  state = updateTask(state, state.tasks[0].id, { completed: true });
  assert.throws(() => addList(state, ' home '), /unique/);
  assert.throws(() => deleteList(state, 'inbox'), /cannot be deleted/);
  const result = deleteList(state, listId);
  assert.deepEqual(result.tasks[0], { ...state.tasks[0], listId: 'inbox' });
  assert.equal(result.lists.length, 1);
  assert.equal(state.lists.length, 2);
});

test('calendar dates reject rollover dates and use local calendar components', () => {
  for (const invalid of ['2026-02-29', '1900-02-29', '2026-04-31', '0000-01-01', '2026-13-01', '2026-1-01', '2026-01-00', 'not a date']) {
    assert.equal(isCalendarDate(invalid), false, invalid);
    assert.throws(() => addTask(createWorkspace(), { title: 'Task', dueDate: invalid }), /due date/);
  }
  assert.equal(isCalendarDate('2000-02-29'), true);
  const date = new Date(2026, 9, 23, 0, 1);
  assert.equal(localDate(date), '2026-10-23');
});

test('date/list/completion filters and due-date ordering compose without mutating tasks', () => {
  let state = addList(createWorkspace(), 'Work');
  const workId = state.lists[1].id;
  for (const [title, dueDate, listId, completed, createdAt] of [
    ['Undated', null, 'inbox', false, 1],
    ['Later today', '2026-10-23', 'inbox', false, 4],
    ['Earlier today', '2026-10-23', workId, false, 2],
    ['Overdue', '2026-10-22', 'inbox', false, 3],
    ['Done', '2026-10-21', 'inbox', true, 5],
    ['Future', '2026-10-24', 'inbox', false, 6],
  ]) {
    state = addTask(state, { title, dueDate, listId });
    Object.assign(state.tasks.at(-1), { completed, createdAt });
  }
  const options = { today: '2026-10-23' };
  assert.deepEqual(visibleTasks(state, options).map((t) => t.title),
    ['Overdue', 'Earlier today', 'Later today', 'Future', 'Undated']);
  assert.deepEqual(visibleTasks(state, { ...options, filter: 'today' }).map((t) => t.title),
    ['Earlier today', 'Later today']);
  assert.deepEqual(visibleTasks(state, { ...options, filter: 'overdue', completed: true }).map((t) => t.title),
    ['Overdue']);
  assert.deepEqual(visibleTasks(state, { ...options, filter: 'today', completed: true }).map((t) => t.title),
    ['Earlier today', 'Later today']);
  assert.deepEqual(visibleTasks(state, { ...options, filter: 'today', listId: 'inbox' }).map((t) => t.title),
    ['Later today']);
  assert.equal(state.tasks[0].title, 'Undated');
});

test('text file import appends trimmed nonblank lines to Inbox without interpreting markup', () => {
  const original = addTask(createWorkspace(), { title: 'Keep me' });
  const result = importText(original, '\uFEFF First \r\n\r\n Second \r <script>alert(1)</script>\n');
  assert.deepEqual(result.tasks.map((task) => task.title),
    ['Keep me', 'First', 'Second', '<script>alert(1)</script>']);
  assert.ok(result.tasks.every((task) => task.listId === 'inbox'));
  assert.equal(new Set(result.tasks.map((task) => task.id)).size, 4);
  assert.deepEqual(visibleTasks(result).map((task) => task.title),
    ['Keep me', 'First', 'Second', '<script>alert(1)</script>']);
  assert.equal(original.tasks.length, 1);
  assert.throws(() => importText(original, '\n \r\n'), /contains no tasks/);
});

test('backup validation rejects broken identities, field types, references, and Inbox invariants', () => {
  const original = addTask(createWorkspace(), { title: 'A task' });
  const corruptions = [
    (state) => { state.version = 99; },
    (state) => { state.lists[0].name = 'Renamed'; },
    (state) => { state.lists.push({ id: 'inbox', name: 'Other' }); },
    (state) => { state.lists.push({ id: 'other', name: 'INBOX' }); },
    (state) => { state.tasks.push({ ...state.tasks[0] }); },
    (state) => { state.tasks[0].title = ' '; },
    (state) => { state.tasks[0].listId = 'missing'; },
    (state) => { state.tasks[0].completed = 'false'; },
    (state) => { state.tasks[0].description = null; },
    (state) => { state.tasks[0].createdAt = -1; },
    (state) => { delete state.tasks[0].dueDate; },
  ];
  for (const corrupt of corruptions) {
    const state = structuredClone(original);
    corrupt(state);
    assert.throws(() => validateWorkspace(state));
  }
  assert.deepEqual(validateWorkspace(original), original);
});
