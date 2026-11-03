import { addList, addTask, validateWorkspace } from './model.js';
import { addDays, isCalendarDate, weekday } from './dates.js';
import { setSubjectTarget } from './schoolActions.js';

export const WEEKS = 36;

// Preset middle-school year: one daily target and one weekly review per subject.
export const PRESET = [
  { name: 'Math', emoji: '\u{1F4D0}', color: '#ffd6e0', target: 2, unit: 'pages' },
  { name: 'English', emoji: '\u{1F4D6}', color: '#d9ecff', target: 2, unit: 'pages' },
  { name: 'Science', emoji: '\u{1F52C}', color: '#d8f5e3', target: 1, unit: 'lesson' },
  { name: 'History', emoji: '\u{1F30D}', color: '#fff0c9', target: 1, unit: 'lesson' },
  { name: 'Spelling', emoji: '\u270F\uFE0F', color: '#e8dcff', target: 10, unit: 'words' },
];

export function subjectStyle(name) {
  return PRESET.find((subject) => subject.name === name)
    ?? { emoji: '\u{1F4DA}', color: '#e4ecdf' };
}

export function nextMonday(date) {
  const offset = (8 - weekday(date)) % 7;
  return addDays(date, offset === 0 && weekday(date) !== 1 ? 7 : offset);
}

export function guideStarted(workspace) {
  return PRESET.every((subject) => workspace.lists.some((list) => list.name === subject.name));
}

// Adds the preset subjects (skipping any that already exist) and a weekly review for each one,
// due on Fridays starting with the week that begins on `start`.
export function startSchoolYear(workspace, start, today) {
  if (!isCalendarDate(start) || weekday(start) !== 1) throw new Error('Choose a Monday to start the school year.');
  let next = workspace;
  for (const subject of PRESET) {
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
  return next;
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
