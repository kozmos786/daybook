import { addList, addTask, validateWorkspace } from './model.js';
import { addDays, isCalendarDate, weekday } from './dates.js';
import { setSubjectTarget } from './schoolActions.js';

export const WEEKS = 36;
export const GRADES = Array.from({ length: 12 }, (_, index) => index + 1);

const MATH_COURSES = ['Math', 'Math', 'Math', 'Math', 'Math', 'Math', 'Math', 'Pre-Algebra',
  'Algebra 1', 'Geometry', 'Algebra 2', 'Pre-Calculus', 'Calculus'];
const SCIENCE_HIGH = ['Biology', 'Chemistry', 'Physics', 'Environmental Science'];
const HISTORY_HIGH = ['World History', 'World History', 'US History', 'Government'];

const STYLES = [
  { test: /math|algebra|geometry|calculus/i, emoji: '\u{1F4D0}', color: '#ffd6e0' },
  { test: /english|reading|literature/i, emoji: '\u{1F4D6}', color: '#d9ecff' },
  { test: /science|biology|chemistry|physics/i, emoji: '\u{1F52C}', color: '#d8f5e3' },
  { test: /history|government|social/i, emoji: '\u{1F30D}', color: '#fff0c9' },
  { test: /spelling|vocabulary|writing/i, emoji: '\u270F\uFE0F', color: '#e8dcff' },
];

// Subjects for a grade (1-12). `advanced` moves math one course ahead (for example Algebra 1 in grade 8).
export function presetFor(grade, advanced = false) {
  if (!GRADES.includes(grade)) throw new Error('Choose a grade from 1 to 12.');
  const elementary = grade <= 5;
  const high = grade >= 9;
  const math = MATH_COURSES[Math.min(MATH_COURSES.length - 1, grade - 1 + (advanced ? 1 : 0))];
  return [
    { name: math, target: elementary ? 1 : 2, unit: 'pages' },
    { name: high ? `English ${grade}` : 'English', target: elementary ? 1 : 2, unit: 'pages' },
    { name: high ? SCIENCE_HIGH[grade - 9] : 'Science', target: 1, unit: 'lesson' },
    { name: high ? HISTORY_HIGH[grade - 9] : 'History', target: 1, unit: 'lesson' },
    { name: high ? 'Writing' : elementary ? 'Spelling' : 'Vocabulary', target: elementary ? 5 : 10, unit: 'words' },
  ];
}

export function subjectStyle(name) {
  return STYLES.find((style) => style.test.test(name)) ?? { emoji: '\u{1F4DA}', color: '#e4ecdf' };
}

export function nextMonday(date) {
  const offset = (8 - weekday(date)) % 7;
  return addDays(date, offset === 0 && weekday(date) !== 1 ? 7 : offset);
}

export function guideStarted(workspace, grade, advanced = false) {
  return presetFor(grade, advanced).every((subject) => workspace.lists.some((list) => list.name === subject.name));
}

// Adds the grade's subjects (skipping any that already exist) and a weekly review for each one,
// due on Fridays starting with the week that begins on `start`.
export function startSchoolYear(workspace, start, today, grade = 6, advanced = false) {
  if (!isCalendarDate(start) || weekday(start) !== 1) throw new Error('Choose a Monday to start the school year.');
  let next = workspace;
  for (const subject of presetFor(grade, advanced)) {
    if (next.lists.some((list) => list.name === subject.name)) continue;
    next = addList(next, subject.name);
    const id = next.lists.at(-1).id;
    next = setSubjectTarget(next, id, { units: subject.target, unit: subject.unit }, today);
    for (let week = 0; week < WEEKS; week++) {
      next = addTask(next, {
        title: `${subject.name}: week ${week + 1} review`,
        listId: id,
        dueDate: addDays(start, week * 7 + 4),
      });
    }
  }
  return next.grades.yearStart ? next : { ...next, grades: { ...next.grades, yearStart: start } };
}

export function moveTask(workspace, taskId, dueDate) {
  if (!isCalendarDate(dueDate)) throw new Error('Choose a valid date.');
  return validateWorkspace({ ...workspace, tasks: workspace.tasks.map((task) => task.id === taskId ? { ...task, dueDate } : task) });
}

export function swapDueDates(workspace, firstId, secondId) {
  const first = workspace.tasks.find((task) => task.id === firstId);
  const second = workspace.tasks.find((task) => task.id === secondId);
  if (!first || !second || first === second) throw new Error('Choose two different assignments to swap.');
  return validateWorkspace({
    ...workspace,
    tasks: workspace.tasks.map((task) => task === first ? { ...task, dueDate: second.dueDate }
      : task === second ? { ...task, dueDate: first.dueDate } : task),
  });
}
