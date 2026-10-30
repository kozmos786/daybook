import { isCalendarDate, localDate } from './dates.js';
import { emptySchool, normalizeTargets, normalizeUnit, validateSchool } from './school.js';

export { isCalendarDate, localDate };

export const INBOX_ID = 'inbox';

export function createWorkspace() {
  return { version: 2, lists: [{ id: INBOX_ID, name: 'Inbox' }], tasks: [], school: emptySchool() };
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must not be empty.`);
  }
  return value.trim();
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Accepts version 1 (no school data) and version 2, always returning version 2.
export function validateWorkspace(value) {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2) ||
      !Array.isArray(value.lists) || !Array.isArray(value.tasks)) {
    throw new Error('Expected a Daybook backup (version 1 or 2) with lists and tasks.');
  }
  if (value.version === 1 && value.school !== undefined) {
    throw new Error('A version 1 backup cannot contain school data.');
  }
  const listIds = new Set();
  const listNames = new Set();
  const lists = value.lists.map((list) => {
    if (!isRecord(list)) throw new Error('Every list must be an object.');
    const id = requireText(list.id, 'List ID');
    const name = requireText(list.name, 'List name');
    if (listIds.has(id) || listNames.has(name.toLowerCase())) {
      throw new Error('List IDs and names must be unique.');
    }
    listIds.add(id);
    listNames.add(name.toLowerCase());
    const normalized = { id, name };
    if (list.unit !== undefined) {
      const unit = normalizeUnit(list.unit);
      if (unit) normalized.unit = unit;
    }
    if (list.targets !== undefined) {
      const targets = normalizeTargets(list.targets);
      if (targets.length) normalized.targets = targets;
    }
    return normalized;
  });
  if (!lists.some((list) => list.id === INBOX_ID && list.name === 'Inbox')) {
    throw new Error('The permanent Inbox list is missing or renamed.');
  }
  const taskIds = new Set();
  const tasks = value.tasks.map((task) => {
    if (!isRecord(task)) throw new Error('Every task must be an object.');
    const id = requireText(task.id, 'Task ID');
    const title = requireText(task.title, 'Task title');
    if (taskIds.has(id)) throw new Error('Task IDs must be unique.');
    taskIds.add(id);
    if (typeof task.description !== 'string' ||
        typeof task.completed !== 'boolean' ||
        !Number.isSafeInteger(task.createdAt) || task.createdAt < 0 ||
        !listIds.has(task.listId) ||
        (task.dueDate !== null && !isCalendarDate(task.dueDate))) {
      throw new Error('A task has an invalid description, status, creation time, list, or due date.');
    }
    return {
      id, title, description: task.description, completed: task.completed,
      createdAt: task.createdAt, listId: task.listId, dueDate: task.dueDate,
    };
  });
  const school = validateSchool(value.version === 1 ? emptySchool() : value.school, lists);
  return { version: 2, lists, tasks, school };
}

export function addTask(workspace, { title, description = '', dueDate = null, listId = INBOX_ID }) {
  return validateWorkspace({
    ...workspace,
    tasks: [...workspace.tasks, {
      id: crypto.randomUUID(), title, description, dueDate, listId,
      completed: false, createdAt: Date.now(),
    }],
  });
}

export function updateTask(workspace, id, changes) {
  if (!workspace.tasks.some((task) => task.id === id)) throw new Error('Task no longer exists.');
  const { title, description, dueDate, listId, completed } = changes;
  const allowed = Object.fromEntries(
    Object.entries({ title, description, dueDate, listId, completed })
      .filter(([, value]) => value !== undefined),
  );
  return validateWorkspace({
    ...workspace,
    tasks: workspace.tasks.map((task) => task.id === id ? { ...task, ...allowed } : task),
  });
}

export function deleteTask(workspace, id) {
  if (!workspace.tasks.some((task) => task.id === id)) throw new Error('Task no longer exists.');
  return { ...workspace, tasks: workspace.tasks.filter((task) => task.id !== id) };
}

export function addList(workspace, name) {
  return validateWorkspace({
    ...workspace,
    lists: [...workspace.lists, { id: crypto.randomUUID(), name }],
  });
}

export function deleteList(workspace, id) {
  if (id === INBOX_ID) throw new Error('Inbox cannot be deleted.');
  if (!workspace.lists.some((list) => list.id === id)) throw new Error('List no longer exists.');
  return validateWorkspace({
    ...workspace,
    lists: workspace.lists.filter((list) => list.id !== id),
    tasks: workspace.tasks.map((task) => task.listId === id ? { ...task, listId: INBOX_ID } : task),
    school: {
      ...workspace.school,
      logs: workspace.school.logs.filter((log) => log.listId !== id),
      daysOff: workspace.school.daysOff.filter((entry) => entry.listId !== id),
    },
  });
}

export function visibleTasks(workspace, { listId = '', filter = 'all', completed = false, today = localDate() } = {}) {
  if (!['all', 'today', 'overdue'].includes(filter)) throw new Error('Unknown date filter.');
  return workspace.tasks.filter((task) =>
    (!listId || task.listId === listId) &&
    (completed ? filter !== 'overdue' || !task.completed : !task.completed) &&
    (filter === 'all' || (task.dueDate !== null &&
      (filter === 'today' ? task.dueDate === today : task.dueDate < today))),
  ).sort((a, b) =>
    (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99') ||
    a.createdAt - b.createdAt,
  );
}

export function importText(workspace, text) {
  if (typeof text !== 'string') throw new Error('The text file could not be read.');
  const titles = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/).map((line) => line.trim()).filter(Boolean);
  if (!titles.length) throw new Error('The text file contains no tasks. Add one task per line.');
  const createdAt = Date.now();
  return validateWorkspace({
    ...workspace,
    tasks: [...workspace.tasks, ...titles.map((title) => ({
      id: crypto.randomUUID(), title, description: '', dueDate: null,
      listId: INBOX_ID, completed: false, createdAt,
    }))],
  });
}
