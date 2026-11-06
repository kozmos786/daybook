import { isCalendarDate, weekday, addDays, monthStart, monthEnd } from './dates.js';

export const MAX_UNITS = 1_000_000;
export const FIRST_DATE = '0001-01-01';
const MAX_UNIT_LABEL = 30;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function emptySchool() {
  return { holidays: [], logs: [], daysOff: [], breaks: [] };
}

export function inBreak(school, date) {
  return (school.breaks ?? []).some((entry) => entry.from <= date && date <= entry.to);
}

export function isNoSchool(school, date) {
  return school.holidays.includes(date) || inBreak(school, date);
}

export function isSubject(list) {
  return Array.isArray(list.targets) && list.targets.length > 0;
}

export function normalizeUnit(value) {
  if (typeof value !== 'string') throw new Error('The unit label must be text.');
  const unit = value.trim();
  if (unit.length > MAX_UNIT_LABEL) {
    throw new Error(`The unit label must be ${MAX_UNIT_LABEL} characters or fewer.`);
  }
  return unit;
}

function isWholeUnits(value, minimum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= MAX_UNITS;
}

export function normalizeTargets(value) {
  if (!Array.isArray(value)) throw new Error('Subject targets must be a list.');
  let previous = '';
  return value.map((entry) => {
    if (!isRecord(entry) || !isCalendarDate(entry.from) || !isWholeUnits(entry.units, 0)) {
      throw new Error(`Each daily target needs a valid start date and a whole number from 0 to ${MAX_UNITS}.`);
    }
    if (entry.from <= previous) throw new Error('Daily target start dates must be in ascending order.');
    previous = entry.from;
    return { from: entry.from, units: entry.units };
  });
}

export function targetOn(list, date) {
  let units = 0;
  for (const entry of list.targets ?? []) {
    if (entry.from > date) break;
    units = entry.units;
  }
  return units;
}

export function dayKind(school, date) {
  if (isNoSchool(school, date)) return 'holiday';
  const day = weekday(date);
  return day === 0 || day === 6 ? 'weekend' : 'school';
}

function loggedOn(school, listId, date) {
  return school.logs.find((log) => log.listId === listId && log.date === date)?.units ?? 0;
}

function isSpent(school, listId, date) {
  return school.daysOff.some((entry) => entry.listId === listId && entry.date === date);
}

// Replays logs in date order. Extra work on a school day is the amount above the target;
// on a weekend or holiday every unit counts double. Whole days off are earned from a
// carried pool, using the target in effect on the date of the work.
export function subjectStats(list, school) {
  const logs = school.logs.filter((log) => log.listId === list.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  let pool = 0;
  let earned = 0;
  for (const log of logs) {
    const target = targetOn(list, log.date);
    if (!target) continue;
    const extra = dayKind(school, log.date) === 'school'
      ? Math.max(0, log.units - target)
      : log.units * 2;
    pool += extra;
    const whole = Math.floor(pool / target);
    earned += whole;
    pool -= whole * target;
  }
  // A day off spent on a date that later became a holiday is returned, not counted.
  const spent = school.daysOff.filter((entry) =>
    entry.listId === list.id && !isNoSchool(school, entry.date)).length;
  return { earned, spent, balance: earned - spent, carry: pool };
}

export function validateSchool(value, lists) {
  if (!isRecord(value) || !Array.isArray(value.holidays) ||
      !Array.isArray(value.logs) || !Array.isArray(value.daysOff)) {
    throw new Error('School data must contain holidays, work logs, and days off.');
  }
  const listIds = new Set(lists.map((list) => list.id));
  const holidays = value.holidays.map((date) => {
    if (!isCalendarDate(date)) throw new Error('A holiday has an invalid date.');
    return date;
  });
  if (new Set(holidays).size !== holidays.length) throw new Error('Holiday dates must be unique.');

  const ids = new Set();
  const claimId = (id, label) => {
    if (typeof id !== 'string' || !id.trim() || ids.has(id)) {
      throw new Error(`${label} IDs must be unique, nonblank text.`);
    }
    ids.add(id);
  };
  const keys = new Set();
  const claimKey = (listId, date, label) => {
    const key = `${listId}\u0000${date}`;
    if (keys.has(key)) throw new Error(`There can be only one ${label} per subject per date.`);
    keys.add(key);
  };
  const logs = value.logs.map((log) => {
    if (!isRecord(log) || !listIds.has(log.listId) || !isCalendarDate(log.date) ||
        !isWholeUnits(log.units, 1)) {
      throw new Error('A work log needs a valid subject, date, and whole number of units.');
    }
    claimId(log.id, 'Work log');
    claimKey(`log\u0000${log.listId}`, log.date, 'work log');
    return { id: log.id, listId: log.listId, date: log.date, units: log.units };
  });
  const daysOff = value.daysOff.map((entry) => {
    if (!isRecord(entry) || !listIds.has(entry.listId) || !isCalendarDate(entry.date)) {
      throw new Error('A day off needs a valid subject and date.');
    }
    claimId(entry.id, 'Day off');
    claimKey(`off\u0000${entry.listId}`, entry.date, 'day off');
    return { id: entry.id, listId: entry.listId, date: entry.date };
  });

  const breakIds = new Set();
  const breaks = (value.breaks ?? []).map((entry) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id.trim() || breakIds.has(entry.id) ||
        !isCalendarDate(entry.from) || !isCalendarDate(entry.to) || entry.from > entry.to ||
        typeof entry.label !== 'string' || entry.label.length > 60) {
      throw new Error('A break needs a unique ID, a start date on or before its end date, and a short label.');
    }
    breakIds.add(entry.id);
    return { id: entry.id, from: entry.from, to: entry.to, label: entry.label.trim() };
  }).sort((a, b) => a.from.localeCompare(b.from));

  const school = { holidays: holidays.sort(), logs, daysOff, breaks };
  for (const list of lists) {
    if (subjectStats(list, school).balance < 0) {
      throw new Error(`More days off are spent than earned for "${list.name}", so this change is not allowed.`);
    }
  }
  return school;
}

export function deadlinesOn(workspace, listId, date) {
  return workspace.tasks.filter((task) =>
    task.listId === listId && !task.completed && task.dueDate === date);
}

export function todaySummary(workspace, today) {
  const { school } = workspace;
  const kind = dayKind(school, today);
  const subjects = workspace.lists.filter((list) => targetOn(list, today) > 0).map((list) => {
    const target = targetOn(list, today);
    const logged = loggedOn(school, list.id, today);
    const dayOff = kind === 'school' && isSpent(school, list.id, today);
    const { balance, carry } = subjectStats(list, school);
    return {
      list, unit: list.unit ?? 'units', target, logged, dayOff, balance, carry,
      remaining: kind === 'school' && !dayOff ? Math.max(0, target - logged) : 0,
    };
  });
  return { kind, subjects };
}

export function monthGrid(workspace, year, month) {
  const { school } = workspace;
  const first = monthStart(year, month);
  const last = monthEnd(year, month);
  const subjects = workspace.lists.filter(isSubject);
  const subjectIds = new Set(subjects.map((list) => list.id));
  const prefix = first.slice(0, 8);
  const cells = [];
  const end = addDays(last, 6 - weekday(last));
  for (let date = addDays(first, -weekday(first)); date <= end; date = addDays(date, 1)) {
    const kind = dayKind(school, date);
    cells.push({
      date, kind, inMonth: date.startsWith(prefix),
      dayOffs: kind === 'school'
        ? subjects.filter((list) => isSpent(school, list.id, date)).map((list) => list.name)
        : [],
      deadlines: workspace.tasks.filter((task) =>
        !task.completed && task.dueDate === date && subjectIds.has(task.listId)),
    });
  }
  const weeks = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

export function dayDetails(workspace, date, today) {
  const { school } = workspace;
  const kind = dayKind(school, date);
  const subjects = workspace.lists.filter(isSubject).map((list) => {
    const target = targetOn(list, date);
    const logged = loggedOn(school, list.id, date);
    const spent = kind === 'school' && isSpent(school, list.id, date);
    const { balance } = subjectStats(list, school);
    return {
      list, unit: list.unit ?? 'units', target, logged, spent, balance,
      canLog: date <= today && (target > 0 || logged > 0),
      canSpend: kind === 'school' && date >= today && !spent && balance > 0,
      canCancel: spent && date >= today,
      deadlines: deadlinesOn(workspace, list.id, date),
    };
  });
  return { date, kind, isFuture: date > today, subjects };
}
