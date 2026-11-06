import { addDays, daysBetween, isCalendarDate } from './dates.js';

export const CATEGORIES = ['Homework', 'Quiz', 'Test', 'Project'];
export const DEFAULT_WEIGHTS = { Homework: 20, Quiz: 20, Test: 40, Project: 20 };
export const ALLOW_EXTRA_CREDIT = false;
export const TERM_DAYS = 63;
export const TERMS = 4;
const MAX_POINTS = 100_000;

const LETTERS = [
  [97, 'A+'], [93, 'A'], [90, 'A-'], [87, 'B+'], [83, 'B'], [80, 'B-'],
  [77, 'C+'], [73, 'C'], [70, 'C-'], [67, 'D+'], [63, 'D'], [60, 'D-'],
];
const POINTS = { A: 4, B: 3, C: 2, D: 1, F: 0 };

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function emptyGrades() {
  return { entries: [], settings: {}, yearStart: null };
}

export function round1(value) {
  return Math.round(value * 10) / 10;
}

export function letterFor(percent) {
  const rounded = round1(percent);
  for (const [min, letter] of LETTERS) if (rounded >= min) return letter;
  return 'F';
}

export function gpaPoints(percent) {
  return POINTS[letterFor(percent)[0]];
}

export function gradeTone(percent) {
  const letter = letterFor(percent)[0];
  if (letter === 'A' || letter === 'B') return 'good';
  return letter === 'C' ? 'okay' : 'low';
}

export function entryPercent(entry) {
  return (entry.earned / entry.possible) * 100;
}

function weightsFor(grades, listId) {
  return { ...DEFAULT_WEIGHTS, ...(grades.settings[listId]?.weights ?? {}) };
}

export function modeFor(grades, listId) {
  return grades.settings[listId]?.mode ?? 'weighted';
}

function averageOf(entries, mode, weights) {
  const counted = entries.filter((entry) => !entry.dropped);
  if (!counted.length) return null;
  const simple = () => {
    const possible = counted.reduce((sum, entry) => sum + entry.possible, 0);
    return (counted.reduce((sum, entry) => sum + entry.earned, 0) / possible) * 100;
  };
  if (mode === 'simple') return simple();
  let total = 0;
  let weightSum = 0;
  for (const category of CATEGORIES) {
    const group = counted.filter((entry) => entry.category === category);
    if (!group.length || !weights[category]) continue;
    const possible = group.reduce((sum, entry) => sum + entry.possible, 0);
    total += (group.reduce((sum, entry) => sum + entry.earned, 0) / possible) * 100 * weights[category];
    weightSum += weights[category];
  }
  return weightSum ? total / weightSum : simple();
}

// Terms are 9-week quarters counted from the school-year start (August 1 if none is set).
export function yearStartFor(grades, date) {
  if (grades.yearStart) return grades.yearStart;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return `${String(month >= 8 ? year : year - 1).padStart(4, '0')}-08-01`;
}

export function termOf(grades, date) {
  const days = daysBetween(yearStartFor(grades, date), date);
  return Math.min(TERMS, Math.max(1, Math.floor(days / TERM_DAYS) + 1));
}

export function subjectEntries(grades, listId, term = 0) {
  return grades.entries.filter((entry) => entry.listId === listId && (!term || termOf(grades, entry.date) === term));
}

export function subjectAverage(grades, listId, term = 0, extra = []) {
  return averageOf([...subjectEntries(grades, listId, term), ...extra], modeFor(grades, listId), weightsFor(grades, listId));
}

export function subjectSummary(grades, listId, term = 0) {
  const average = subjectAverage(grades, listId, term);
  if (average === null) return null;
  const percent = round1(average);
  return { percent, letter: letterFor(percent), tone: gradeTone(percent) };
}

export function overallGpa(grades, lists, term = 0) {
  const points = lists.map((list) => subjectAverage(grades, list.id, term))
    .filter((value) => value !== null).map(gpaPoints);
  if (!points.length) return null;
  return Math.round((points.reduce((sum, value) => sum + value, 0) / points.length) * 100) / 100;
}

export function bestAndWorst(grades, lists) {
  const rated = lists.map((list) => ({ list, average: subjectAverage(grades, list.id) }))
    .filter((item) => item.average !== null).sort((a, b) => b.average - a.average);
  if (!rated.length) return null;
  return { best: rated[0], worst: rated.at(-1) };
}

export function whatIf(grades, listId, entry) {
  const hypothetical = { id: 'what-if', listId, dropped: false, ...entry };
  const next = subjectAverage(grades, listId, 0, [hypothetical]);
  return { before: subjectAverage(grades, listId), after: next };
}

export function trendPoints(grades, listId) {
  const entries = subjectEntries(grades, listId).filter((entry) => !entry.dropped)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const mode = modeFor(grades, listId);
  const weights = weightsFor(grades, listId);
  return entries.map((entry, index) => ({
    date: entry.date, percent: round1(averageOf(entries.slice(0, index + 1), mode, weights)),
  }));
}

export function scoreDrop(grades, listId, entry) {
  const before = subjectAverage(grades, listId);
  const after = subjectAverage(grades, listId, 0, [entry]);
  return before === null || after === null ? 0 : before - after;
}

function normalizeWeights(value) {
  if (!isRecord(value)) throw new Error('Grade weights must be an object.');
  const weights = {};
  for (const [category, amount] of Object.entries(value)) {
    if (!CATEGORIES.includes(category) || !Number.isFinite(amount) || amount < 0 || amount > 100) {
      throw new Error('Each category weight must be a number from 0 to 100.');
    }
    weights[category] = amount;
  }
  return weights;
}

export function validateGrades(value, lists) {
  if (value === undefined) return emptyGrades();
  if (!isRecord(value) || !Array.isArray(value.entries) || !isRecord(value.settings ?? {})) {
    throw new Error('Grades must contain entries and settings.');
  }
  const listIds = new Set(lists.map((list) => list.id));
  const ids = new Set();
  const entries = value.entries.map((entry) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id.trim() || ids.has(entry.id)) {
      throw new Error('Grade IDs must be unique, nonblank text.');
    }
    ids.add(entry.id);
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!name || name.length > 80) throw new Error('A grade needs a name of 1 to 80 characters.');
    if (!listIds.has(entry.listId)) throw new Error('A grade belongs to a subject that no longer exists.');
    if (!Number.isFinite(entry.earned) || entry.earned < 0 || entry.earned > MAX_POINTS) {
      throw new Error('Score earned must be 0 or more.');
    }
    if (!Number.isFinite(entry.possible) || entry.possible <= 0 || entry.possible > MAX_POINTS) {
      throw new Error('Score possible must be more than 0.');
    }
    if (!ALLOW_EXTRA_CREDIT && entry.earned > entry.possible) {
      throw new Error('Score earned cannot be more than the score possible.');
    }
    if (!isCalendarDate(entry.date)) throw new Error('A grade needs a valid date.');
    if (!CATEGORIES.includes(entry.category)) throw new Error('Pick a grade category.');
    return {
      id: entry.id, listId: entry.listId, name, earned: entry.earned, possible: entry.possible,
      date: entry.date, category: entry.category, dropped: entry.dropped === true,
    };
  });
  const settings = {};
  for (const [listId, setting] of Object.entries(value.settings ?? {})) {
    if (!listIds.has(listId)) continue;
    if (!isRecord(setting) || (setting.mode !== undefined && !['weighted', 'simple'].includes(setting.mode))) {
      throw new Error('Grade settings need a weighted or simple mode.');
    }
    settings[listId] = { mode: setting.mode ?? 'weighted', weights: normalizeWeights(setting.weights ?? {}) };
  }
  if (value.yearStart !== null && value.yearStart !== undefined && !isCalendarDate(value.yearStart)) {
    throw new Error('The school year start must be a valid date.');
  }
  return { entries, settings, yearStart: value.yearStart ?? null };
}

export function addGrade(workspace, input) {
  const entry = {
    id: crypto.randomUUID(), dropped: false, ...input,
    earned: Number(input.earned), possible: Number(input.possible),
  };
  return {
    ...workspace,
    grades: { ...workspace.grades, entries: [...workspace.grades.entries, entry] },
  };
}

export function updateGrade(workspace, id, changes) {
  if (!workspace.grades.entries.some((entry) => entry.id === id)) throw new Error('That grade no longer exists.');
  const next = { ...changes };
  if (next.earned !== undefined) next.earned = Number(next.earned);
  if (next.possible !== undefined) next.possible = Number(next.possible);
  return {
    ...workspace,
    grades: { ...workspace.grades, entries: workspace.grades.entries.map((entry) => (entry.id === id ? { ...entry, ...next } : entry)) },
  };
}

export function deleteGrade(workspace, id) {
  return { ...workspace, grades: { ...workspace.grades, entries: workspace.grades.entries.filter((entry) => entry.id !== id) } };
}

export function setGradeSettings(workspace, listId, { mode, weights }) {
  const current = workspace.grades.settings[listId] ?? {};
  return {
    ...workspace,
    grades: { ...workspace.grades, settings: { ...workspace.grades.settings, [listId]: { ...current, mode: mode ?? current.mode ?? 'weighted', weights: weights ?? current.weights ?? {} } } },
  };
}

export function setYearStart(workspace, date) {
  return { ...workspace, grades: { ...workspace.grades, yearStart: date || null } };
}

export function termRange(grades, term, today) {
  const start = addDays(yearStartFor(grades, today), (term - 1) * TERM_DAYS);
  return { from: start, to: addDays(start, TERM_DAYS - 1) };
}
