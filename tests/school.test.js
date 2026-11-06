import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorkspace, addList, addTask, deleteList, validateWorkspace, INBOX_ID,
} from '../src/model.js';
import {
  subjectStats, targetOn, todaySummary, monthGrid, dayDetails, deadlinesOn, dayKind,
} from '../src/school.js';
import {
  setSubjectTarget, setWorkLogged, addWork, markHoliday, unmarkHoliday, spendDayOff, cancelDayOff,
} from '../src/schoolActions.js';

// 2026-10-26 is a Monday; 10-31 is a Saturday and 11-01 a Sunday.
const MON = '2026-10-26';
const TUE = '2026-10-27';
const WED = '2026-10-28';
const SAT = '2026-10-31';
const NEXT_MON = '2026-11-02';
const NEXT_WED = '2026-11-04';

function setup(units = 2) {
  let workspace = addList(createWorkspace(), 'Math');
  const id = workspace.lists[1].id;
  workspace = setSubjectTarget(workspace, id, { units, unit: 'pages' }, MON);
  return { workspace, id };
}

const stats = (workspace, id) => subjectStats(workspace.lists.find((list) => list.id === id), workspace.school);
const log = (workspace, id, date, units, today = NEXT_MON) => setWorkLogged(workspace, id, date, units, today);

test('extra work above the target earns days off and partial extra carries over', () => {
  const { workspace, id } = setup();
  assert.equal(stats(log(workspace, id, MON, 4), id).balance, 1);
  assert.equal(stats(log(workspace, id, MON, 2), id).balance, 0);

  const carried = log(log(workspace, id, MON, 3), id, TUE, 3);
  assert.deepEqual(stats(carried, id), { earned: 1, spent: 0, balance: 1, carry: 0 });

  const partial = log(workspace, id, MON, 3);
  assert.deepEqual(stats(partial, id), { earned: 0, spent: 0, balance: 0, carry: 1 });
  assert.deepEqual(stats(log(partial, id, TUE, 5), id), { earned: 2, spent: 0, balance: 2, carry: 0 });
});

test('a short day never reduces saved days off', () => {
  const { workspace, id } = setup();
  const earned = log(workspace, id, MON, 4);
  assert.equal(stats(log(earned, id, TUE, 1), id).balance, 1);
  assert.equal(stats(log(earned, id, TUE, 0), id).balance, 1);
});

test('weekend and holiday work counts double, and days off are earned per subject only', () => {
  let { workspace, id } = setup();
  assert.equal(stats(log(workspace, id, SAT, 2), id).balance, 2);
  assert.equal(stats(log(workspace, id, SAT, 1), id).balance, 1);
  const holiday = log(markHoliday(workspace, TUE), id, TUE, 2);
  assert.equal(stats(holiday, id).balance, 2);

  workspace = addList(log(workspace, id, SAT, 2), 'English');
  const english = workspace.lists[2];
  assert.equal(subjectStats(english, workspace.school).balance, 0);
  assert.throws(() => spendDayOff(workspace, english.id, NEXT_WED, NEXT_MON), /no saved days off/);
});

test('work on a spent day off follows the normal school-day rule, so a day cannot be earned back', () => {
  const { workspace, id } = setup();
  const spent = spendDayOff(log(workspace, id, MON, 4), id, NEXT_WED, NEXT_MON);
  assert.equal(stats(spent, id).balance, 0);
  const worked = setWorkLogged(spent, id, NEXT_WED, 2, NEXT_WED);
  assert.equal(stats(worked, id).balance, 0);
  assert.equal(stats(setWorkLogged(spent, id, NEXT_WED, 4, NEXT_WED), id).balance, 1);
});

test('changing the target applies from the change date and keeps earlier days off', () => {
  const { workspace, id } = setup();
  const earned = log(workspace, id, MON, 4);
  const changed = setSubjectTarget(earned, id, { units: 5, unit: 'pages' }, NEXT_MON);
  const list = changed.lists.find((entry) => entry.id === id);
  assert.equal(targetOn(list, '2026-10-30'), 2);
  assert.equal(targetOn(list, NEXT_MON), 5);
  assert.equal(stats(changed, id).balance, 1);

  const removed = setSubjectTarget(changed, id, { units: 0, unit: 'pages' }, '2026-11-09');
  assert.equal(targetOn(removed.lists.find((entry) => entry.id === id), '2026-11-09'), 0);
  assert.throws(() => log(removed, id, '2026-11-09', 1, '2026-11-09'), /no daily target/);
});

test('target and unit inputs are validated', () => {
  const { workspace, id } = setup();
  for (const units of [-1, 1.5, 1_000_001, Number.NaN]) {
    assert.throws(() => setSubjectTarget(workspace, id, { units }), /whole number/);
  }
  assert.throws(() => setSubjectTarget(workspace, id, { units: 1, unit: 'x'.repeat(31) }), /30 characters/);
  assert.throws(() => setSubjectTarget(workspace, INBOX_ID, { units: 1 }), /Inbox/);
  assert.equal(setSubjectTarget(workspace, id, { units: 2, unit: '  ' }).lists[1].unit, undefined);
});

test('work logging rejects future dates, fractions, negatives, and missing targets', () => {
  const { workspace, id } = setup();
  assert.throws(() => log(workspace, id, '2026-11-03', 1), /today or earlier/);
  for (const units of [1.5, -1, 2_000_000]) assert.throws(() => log(workspace, id, MON, units), /whole number/);
  assert.throws(() => log(workspace, id, 'nope', 1), /valid date/);
  assert.throws(() => addWork(workspace, id, MON, -1, NEXT_MON), /no logged work/);
  assert.throws(() => setWorkLogged(createWorkspace(), 'missing', MON, 1, NEXT_MON), /no longer exists/);
  const twice = addWork(addWork(workspace, id, MON, 1, NEXT_MON), id, MON, 2, NEXT_MON);
  assert.equal(twice.school.logs.length, 1);
  assert.equal(twice.school.logs[0].units, 3);
  assert.equal(addWork(twice, id, MON, -3, NEXT_MON).school.logs.length, 0);
});

test('spending a day off validates the date, the balance, and duplicates, and can be cancelled', () => {
  const { workspace, id } = setup();
  assert.throws(() => spendDayOff(workspace, id, NEXT_WED, NEXT_MON), /no saved days off/);
  const earned = log(workspace, id, SAT, 4);
  assert.throws(() => spendDayOff(earned, id, '2026-11-07', NEXT_MON), /school day/);
  assert.throws(() => spendDayOff(earned, id, MON, NEXT_MON), /today or on a later day/);
  assert.throws(() => spendDayOff(markHoliday(earned, NEXT_WED), id, NEXT_WED, NEXT_MON), /already a holiday/);

  const spent = spendDayOff(earned, id, NEXT_WED, NEXT_MON);
  assert.throws(() => spendDayOff(spent, id, NEXT_WED, NEXT_MON), /already has a day off/);
  assert.equal(stats(spent, id).balance, 3);
  assert.equal(spendDayOff(spendDayOff(spent, id, '2026-11-05', NEXT_MON), id, '2026-11-06', NEXT_MON).school.daysOff.length, 3);
  assert.equal(stats(cancelDayOff(spent, id, NEXT_WED, NEXT_MON), id).balance, 4);
  assert.throws(() => cancelDayOff(spent, id, '2026-11-05', NEXT_MON), /no day off/);
  assert.throws(() => cancelDayOff(spent, id, NEXT_WED, '2026-11-05'), /cannot be changed/);
});

test('a holiday on a spent day returns the day off and removing it restores the spend', () => {
  const { workspace, id } = setup();
  const spent = spendDayOff(log(workspace, id, MON, 4), id, NEXT_WED, NEXT_MON);
  assert.equal(stats(spent, id).balance, 0);
  const holiday = markHoliday(spent, NEXT_WED);
  assert.equal(stats(holiday, id).balance, 1);
  assert.equal(holiday.school.daysOff.length, 1);
  assert.equal(stats(unmarkHoliday(holiday, NEXT_WED), id).balance, 0);
  assert.throws(() => markHoliday(holiday, NEXT_WED), /already a holiday/);
  assert.throws(() => unmarkHoliday(workspace, NEXT_WED), /not a holiday/);
});

test('edits that would leave more days spent than earned are blocked', () => {
  const { workspace, id } = setup();
  const spent = spendDayOff(log(workspace, id, MON, 4), id, NEXT_WED, NEXT_MON);
  assert.throws(() => log(spent, id, MON, 2), /spent than earned for "Math"/);
  assert.throws(() => log(spent, id, MON, 0), /spent than earned/);
  assert.equal(stats(log(spent, id, MON, 6), id).balance, 1);
  assert.throws(() => setSubjectTarget(spent, id, { units: 4, unit: 'pages' }, MON), /spent than earned/);

  const doubled = spendDayOff(spendDayOff(
    log(markHoliday(workspace, TUE), id, TUE, 2), id, NEXT_WED, NEXT_MON), id, '2026-11-05', NEXT_MON);
  assert.throws(() => unmarkHoliday(doubled, TUE), /spent than earned/);
});

test('deleting a subject keeps its tasks in Inbox and removes its school data', () => {
  let { workspace, id } = setup();
  workspace = addTask(workspace, { title: 'Quiz', listId: id, dueDate: NEXT_WED });
  workspace = spendDayOff(log(workspace, id, SAT, 2), id, NEXT_WED, NEXT_MON);
  workspace = markHoliday(workspace, TUE);
  const result = deleteList(workspace, id);
  assert.equal(result.tasks[0].listId, INBOX_ID);
  assert.equal(result.lists.length, 1);
  assert.deepEqual(result.school, { holidays: [TUE], logs: [], daysOff: [], breaks: [] });
});

test('older backups upgrade to version 3 and invalid school data is rejected', () => {
  const v1 = { version: 1, lists: [{ id: 'inbox', name: 'Inbox' }], tasks: [] };
  assert.deepEqual(validateWorkspace(v1), createWorkspace());
  assert.throws(() => validateWorkspace({ ...v1, school: { holidays: [], logs: [], daysOff: [] } }), /version 1/);
  assert.throws(() => validateWorkspace({ ...v1, version: 2 }), /School data/);

  const { workspace, id } = setup();
  const full = spendDayOff(markHoliday(log(workspace, id, SAT, 2), TUE), id, NEXT_WED, NEXT_MON);
  assert.deepEqual(validateWorkspace(JSON.parse(JSON.stringify(full))), full);

  const bad = [
    (w) => { w.school.holidays.push('2026-02-30'); },
    (w) => { w.school.holidays.push(TUE, TUE); },
    (w) => { w.school.logs.push({ ...w.school.logs[0] }); },
    (w) => { w.school.logs[0].id = 'other'; w.school.logs[0].listId = 'missing'; },
    (w) => { w.school.logs[0].units = 1.5; },
    (w) => { w.school.logs[0].units = 0; },
    (w) => { w.school.logs[0].date = 'soon'; },
    (w) => { w.school.daysOff.push({ ...w.school.daysOff[0], id: 'dup' }); },
    (w) => { w.school.daysOff[0].id = w.school.logs[0].id; },
    (w) => { w.school.daysOff.push({ id: 'second', listId: w.lists[1].id, date: '2026-11-05' },
      { id: 'third', listId: w.lists[1].id, date: '2026-11-06' }, { id: 'fourth', listId: w.lists[1].id, date: '2026-11-09' }); },
    (w) => { w.lists[1].targets.push({ from: '0001-01-01', units: 3 }); },
    (w) => { w.lists[1].targets[0].units = -1; },
    (w) => { w.lists[1].unit = 5; },
    (w) => { w.school = null; },
  ];
  for (const [index, corrupt] of bad.entries()) {
    const copy = JSON.parse(JSON.stringify(full));
    corrupt(copy);
    assert.throws(() => validateWorkspace(copy), undefined, `case ${index}`);
  }
});

test('today summary reflects school days, weekends, holidays, and spent days off', () => {
  const { workspace, id } = setup();
  const worked = log(workspace, id, MON, 4, MON);
  let summary = todaySummary(worked, MON);
  assert.equal(summary.kind, 'school');
  assert.deepEqual(
    { logged: summary.subjects[0].logged, remaining: summary.subjects[0].remaining, balance: summary.subjects[0].balance },
    { logged: 4, remaining: 0, balance: 1 });
  assert.equal(todaySummary(workspace, TUE).subjects[0].remaining, 2);
  assert.equal(todaySummary(workspace, SAT).kind, 'weekend');
  assert.equal(todaySummary(workspace, SAT).subjects[0].remaining, 0);
  assert.equal(todaySummary(markHoliday(workspace, TUE), TUE).kind, 'holiday');

  const off = spendDayOff(worked, id, NEXT_WED, NEXT_MON);
  summary = todaySummary(off, NEXT_WED);
  assert.equal(summary.subjects[0].dayOff, true);
  assert.equal(summary.subjects[0].remaining, 0);
  assert.equal(todaySummary(createWorkspace(), MON).subjects.length, 0);
  assert.equal(dayKind(off.school, SAT), 'weekend');
  assert.equal(dayKind(markHoliday(off, SAT).school, SAT), 'holiday');
});

test('month grid covers whole Sunday-first weeks and marks deadlines and days off for subjects only', () => {
  let { workspace, id } = setup();
  workspace = addTask(workspace, { title: 'Quiz', listId: id, dueDate: NEXT_WED });
  workspace = addTask(workspace, { title: 'Chore', dueDate: NEXT_WED });
  workspace = addTask(workspace, { title: 'Finished', listId: id, dueDate: NEXT_WED });
  workspace = { ...workspace, tasks: workspace.tasks.map((task) => task.title === 'Finished' ? { ...task, completed: true } : task) };
  workspace = spendDayOff(log(workspace, id, SAT, 2), id, '2026-11-05', NEXT_MON);
  workspace = markHoliday(workspace, '2026-11-11');

  const weeks = monthGrid(workspace, 2026, 11);
  assert.ok(weeks.every((week) => week.length === 7));
  assert.equal(weeks[0][0].date, '2026-11-01');
  assert.equal(weeks.at(-1).at(-1).date, '2026-12-05');
  const cells = new Map(weeks.flat().map((cell) => [cell.date, cell]));
  assert.deepEqual(cells.get(NEXT_WED).deadlines.map((task) => task.title), ['Quiz']);
  assert.deepEqual(cells.get('2026-11-05').dayOffs, ['Math']);
  assert.equal(cells.get('2026-11-11').kind, 'holiday');
  assert.equal(cells.get('2026-11-07').kind, 'weekend');
  assert.equal(cells.get('2026-12-01').inMonth, false);
  assert.equal(monthGrid(workspace, 2028, 2).flat().some((cell) => cell.date === '2028-02-29'), true);
  assert.deepEqual(deadlinesOn(workspace, id, NEXT_WED).map((task) => task.title), ['Quiz']);
});

test('day details describe what can be done on a date', () => {
  const { workspace, id } = setup();
  const earned = log(workspace, id, SAT, 2);
  const future = dayDetails(earned, NEXT_WED, NEXT_MON).subjects[0];
  assert.deepEqual({ log: future.canLog, spend: future.canSpend, cancel: future.canCancel }, { log: false, spend: true, cancel: false });
  const past = dayDetails(earned, MON, NEXT_MON).subjects[0];
  assert.deepEqual({ log: past.canLog, spend: past.canSpend }, { log: true, spend: false });
  const weekend = dayDetails(earned, '2026-11-07', NEXT_MON).subjects[0];
  assert.equal(weekend.canSpend, false);
  const spent = dayDetails(spendDayOff(earned, id, NEXT_WED, NEXT_MON), NEXT_WED, NEXT_MON).subjects[0];
  assert.deepEqual({ spent: spent.spent, cancel: spent.canCancel, spend: spent.canSpend }, { spent: true, cancel: true, spend: true === false });
  assert.equal(dayDetails(createWorkspace(), MON, MON).subjects.length, 0);
});
