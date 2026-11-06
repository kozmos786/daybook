import { addDays, daysBetween, isCalendarDate, weekday } from './dates.js';
import { isNoSchool } from './school.js';

export const MAX_LESSONS = 1_000_000;
export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_DAYS = 5000;
const REAL_PACE_DAYS = 14;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function emptySchedules() {
  return [];
}

export function defaultSchedule(listId, today, pace = 1) {
  return {
    listId, total: 100, startDone: 0, startDate: today,
    pace: [0, pace, pace, pace, pace, pace, 0], goalDate: null, endDate: null,
  };
}

function isPace(value) {
  return Number.isFinite(value) && value >= 0 && value <= MAX_LESSONS &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

export function validateSchedules(value, lists) {
  if (value === undefined) return emptySchedules();
  if (!Array.isArray(value)) throw new Error('Schedules must be a list.');
  const listIds = new Set(lists.map((list) => list.id));
  const seen = new Set();
  return value.map((entry) => {
    if (!isRecord(entry) || !listIds.has(entry.listId) || seen.has(entry.listId)) {
      throw new Error('Each subject can have one schedule, and the subject must exist.');
    }
    seen.add(entry.listId);
    if (!Number.isSafeInteger(entry.total) || entry.total < 1 || entry.total > MAX_LESSONS) {
      throw new Error('The total number of lessons must be a whole number of 1 or more.');
    }
    if (!Number.isSafeInteger(entry.startDone) || entry.startDone < 0 || entry.startDone > entry.total) {
      throw new Error('Lessons already done must be a whole number from 0 up to the total.');
    }
    if (!isCalendarDate(entry.startDate)) throw new Error('The schedule needs a valid start date.');
    if (!Array.isArray(entry.pace) || entry.pace.length !== 7 || !entry.pace.every(isPace) ||
        !entry.pace.some((amount) => amount > 0)) {
      throw new Error('Pick at least one school day and use up to two decimals for lessons per day.');
    }
    for (const [key, label] of [['goalDate', 'goal'], ['endDate', 'school-year end']]) {
      const date = entry[key] ?? null;
      if (date !== null && (!isCalendarDate(date) || date < entry.startDate)) {
        throw new Error(`The ${label} date must be a valid date on or after the start date.`);
      }
    }
    return {
      listId: entry.listId, total: entry.total, startDone: entry.startDone, startDate: entry.startDate,
      pace: entry.pace.slice(), goalDate: entry.goalDate ?? null, endDate: entry.endDate ?? null,
    };
  });
}

function logsFor(workspace, listId) {
  return workspace.school.logs.filter((log) => log.listId === listId);
}

function loggedOn(workspace, listId, date) {
  return logsFor(workspace, listId).find((log) => log.date === date)?.units ?? 0;
}

export function doneCount(workspace, schedule) {
  const logged = logsFor(workspace, schedule.listId)
    .filter((log) => log.date >= schedule.startDate).reduce((sum, log) => sum + log.units, 0);
  return schedule.startDone + logged;
}

function available(workspace, schedule, date) {
  return schedule.pace[weekday(date)] > 0 && !isNoSchool(workspace.school, date) &&
    !workspace.school.daysOff.some((entry) => entry.listId === schedule.listId && entry.date === date);
}

function project(workspace, schedule, from, left, perDay) {
  if (left <= 1e-9) return from;
  let remaining = left;
  for (let i = 0; i < MAX_DAYS; i += 1) {
    const date = addDays(from, i);
    if (!available(workspace, schedule, date)) continue;
    remaining -= perDay(date, i === 0);
    if (remaining <= 1e-9) return date;
  }
  return null;
}

function realPace(workspace, schedule, today) {
  let days = 0;
  let units = 0;
  for (let i = 1; i <= 180 && days < REAL_PACE_DAYS; i += 1) {
    const date = addDays(today, -i);
    if (date < schedule.startDate) break;
    if (!available(workspace, schedule, date)) continue;
    days += 1;
    units += loggedOn(workspace, schedule.listId, date);
  }
  return days ? units / days : null;
}

function countAvailable(workspace, schedule, from, to) {
  let count = 0;
  for (let date = from; date <= to && count < MAX_DAYS; date = addDays(date, 1)) {
    if (available(workspace, schedule, date)) count += 1;
  }
  return count;
}

export function forecast(workspace, schedule, today) {
  const done = doneCount(workspace, schedule);
  const left = Math.max(0, schedule.total - done);
  const finished = left === 0;
  const from = today < schedule.startDate ? schedule.startDate : today;
  const loggedToday = loggedOn(workspace, schedule.listId, today);
  const planned = project(workspace, schedule, from, left, (date, first) => {
    const pace = schedule.pace[weekday(date)];
    return first && date === today ? Math.max(0, pace - loggedToday) : pace;
  });
  const real = realPace(workspace, schedule, today);
  const realFinish = real && real > 0
    ? project(workspace, schedule, from, left, (date, first) => (first && date === today ? Math.max(0, real - loggedToday) : real))
    : null;

  let expected = schedule.startDone;
  for (let date = schedule.startDate; date < today; date = addDays(date, 1)) {
    if (available(workspace, schedule, date)) expected += schedule.pace[weekday(date)];
  }
  const positive = schedule.pace.filter((amount) => amount > 0);
  const average = positive.reduce((sum, amount) => sum + amount, 0) / positive.length;
  const ahead = done - expected;

  let goal = null;
  if (schedule.goalDate && !finished) {
    const days = schedule.goalDate >= from ? countAvailable(workspace, schedule, from, schedule.goalDate) : 0;
    goal = {
      date: schedule.goalDate, days,
      neededPerDay: days ? Math.ceil((left / days) * 100) / 100 : null,
      onTrack: planned !== null && planned <= schedule.goalDate,
    };
  }
  const daysLeft = planned && !finished ? countAvailable(workspace, schedule, from, planned) : 0;
  return {
    done, left, finished, percent: Math.min(100, (done / schedule.total) * 100),
    planned, realFinish, realPace: real, ahead, aheadDays: average ? ahead / average : 0,
    goal, daysLeft, pastEnd: Boolean(schedule.endDate && planned && planned > schedule.endDate),
  };
}

export function describeFinish(today, date) {
  if (!date) return 'No finish date yet. Check your school days and pace.';
  const days = daysBetween(today, date);
  if (days <= 0) return "You'll finish today.";
  if (days < 7) return `You'll finish in about ${days} ${days === 1 ? 'day' : 'days'}.`;
  const weeks = Math.round(days / 7);
  return `You'll finish in about ${weeks} ${weeks === 1 ? 'week' : 'weeks'}.`;
}

export function timeline(workspace, schedule, today, count = 14) {
  const days = [];
  const result = forecast(workspace, schedule, today);
  for (let i = 0; i < count; i += 1) {
    const date = addDays(today, i);
    days.push({
      date, school: available(workspace, schedule, date), finish: result.planned === date,
      pace: schedule.pace[weekday(date)],
    });
  }
  return days;
}

export function finishDates(workspace, today) {
  const dates = new Map();
  for (const schedule of workspace.schedules) {
    const result = forecast(workspace, schedule, today);
    if (result.planned && !result.finished) {
      const name = workspace.lists.find((list) => list.id === schedule.listId)?.name ?? '';
      dates.set(result.planned, [...(dates.get(result.planned) ?? []), name]);
    }
  }
  return dates;
}
