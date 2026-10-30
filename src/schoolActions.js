import { INBOX_ID, validateWorkspace } from './model.js';
import { isCalendarDate, localDate } from './dates.js';
import { FIRST_DATE, MAX_UNITS, dayKind, normalizeUnit, subjectStats, targetOn } from './school.js';

function requireList(workspace, listId) {
  const list = workspace.lists.find((entry) => entry.id === listId);
  if (!list) throw new Error('That subject no longer exists.');
  return list;
}

function requireDate(date) {
  if (!isCalendarDate(date)) throw new Error('Choose a valid date.');
}

function withSchool(workspace, changes) {
  return validateWorkspace({ ...workspace, school: { ...workspace.school, ...changes } });
}

export function setSubjectTarget(workspace, listId, { units, unit = '' }, today = localDate()) {
  const list = requireList(workspace, listId);
  if (listId === INBOX_ID) throw new Error('Inbox cannot be a school subject.');
  if (!Number.isSafeInteger(units) || units < 0 || units > MAX_UNITS) {
    throw new Error(`The daily target must be a whole number from 0 to ${MAX_UNITS}.`);
  }
  const label = normalizeUnit(unit);
  let targets = list.targets ?? [];
  if (units !== targetOn(list, today)) {
    targets = targets.length === 0
      ? [{ from: FIRST_DATE, units }]
      : [...targets.filter((entry) => entry.from < today), { from: today, units }];
  }
  const next = { id: list.id, name: list.name };
  if (label) next.unit = label;
  if (targets.length) next.targets = targets;
  return validateWorkspace({
    ...workspace,
    lists: workspace.lists.map((entry) => entry.id === listId ? next : entry),
  });
}

export function setWorkLogged(workspace, listId, date, units, today = localDate()) {
  const list = requireList(workspace, listId);
  requireDate(date);
  if (date > today) throw new Error('Work can only be logged for today or earlier dates.');
  if (!Number.isSafeInteger(units) || units < 0 || units > MAX_UNITS) {
    throw new Error(`Logged work must be a whole number from 0 to ${MAX_UNITS}.`);
  }
  if (units > 0 && targetOn(list, date) === 0) {
    throw new Error(`"${list.name}" has no daily target on ${date}. Set one in Subject settings first.`);
  }
  const existing = workspace.school.logs.find((log) => log.listId === listId && log.date === date);
  const others = workspace.school.logs.filter((log) => log !== existing);
  const logs = units === 0
    ? others
    : existing
      ? workspace.school.logs.map((log) => log === existing ? { ...log, units } : log)
      : [...others, { id: crypto.randomUUID(), listId, date, units }];
  return withSchool(workspace, { logs });
}

export function addWork(workspace, listId, date, delta, today = localDate()) {
  const current = workspace.school.logs
    .find((log) => log.listId === listId && log.date === date)?.units ?? 0;
  if (current + delta < 0) throw new Error('There is no logged work to remove.');
  return setWorkLogged(workspace, listId, date, current + delta, today);
}

export function markHoliday(workspace, date) {
  requireDate(date);
  if (workspace.school.holidays.includes(date)) throw new Error('That date is already a holiday.');
  return withSchool(workspace, { holidays: [...workspace.school.holidays, date] });
}

export function unmarkHoliday(workspace, date) {
  requireDate(date);
  if (!workspace.school.holidays.includes(date)) throw new Error('That date is not a holiday.');
  return withSchool(workspace, {
    holidays: workspace.school.holidays.filter((entry) => entry !== date),
  });
}

export function spendDayOff(workspace, listId, date, today = localDate()) {
  const list = requireList(workspace, listId);
  requireDate(date);
  if (date < today) throw new Error('A day off can only be used today or on a later day.');
  const kind = dayKind(workspace.school, date);
  if (kind === 'holiday') throw new Error('That date is already a holiday.');
  if (kind === 'weekend') throw new Error('A day off can only be used on a school day (Monday to Friday).');
  if (workspace.school.daysOff.some((entry) => entry.listId === listId && entry.date === date)) {
    throw new Error(`"${list.name}" already has a day off on that date.`);
  }
  if (subjectStats(list, workspace.school).balance < 1) {
    throw new Error(`"${list.name}" has no saved days off to use.`);
  }
  return withSchool(workspace, {
    daysOff: [...workspace.school.daysOff, { id: crypto.randomUUID(), listId, date }],
  });
}

export function cancelDayOff(workspace, listId, date, today = localDate()) {
  requireList(workspace, listId);
  requireDate(date);
  if (date < today) throw new Error('A day off in the past cannot be changed.');
  if (!workspace.school.daysOff.some((entry) => entry.listId === listId && entry.date === date)) {
    throw new Error('There is no day off on that date.');
  }
  return withSchool(workspace, {
    daysOff: workspace.school.daysOff.filter((entry) => !(entry.listId === listId && entry.date === date)),
  });
}
