import { addDays } from './dates.js';

const NOTIFIED_KEY = 'daybook.reminders.notified';
const SHOWN = 5;

export function reminderGroups(workspace, today) {
  const tomorrow = addDays(today, 1);
  const open = workspace.tasks.filter((task) => !task.completed && task.dueDate);
  const byDate = (a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title);
  return {
    overdue: open.filter((task) => task.dueDate < today).sort(byDate),
    today: open.filter((task) => task.dueDate === today).sort(byDate),
    tomorrow: open.filter((task) => task.dueDate === tomorrow).sort(byDate),
  };
}

const SECTIONS = [
  ['overdue', 'Overdue'],
  ['today', 'Due today'],
  ['tomorrow', 'Due tomorrow'],
];

export function renderReminders(container, groups, onJump) {
  container.replaceChildren();
  const total = SECTIONS.reduce((sum, [key]) => sum + groups[key].length, 0);
  container.hidden = total === 0;
  if (!total) return;
  for (const [key, label] of SECTIONS) {
    const tasks = groups[key];
    if (!tasks.length) continue;
    const section = document.createElement('section');
    section.className = `reminder reminder-${key}`;
    const heading = document.createElement('h2');
    heading.textContent = `${label} (${tasks.length})`;
    const list = document.createElement('ul');
    for (const task of tasks.slice(0, SHOWN)) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = key === 'overdue' ? `${task.title} - ${task.dueDate}` : task.title;
      button.addEventListener('click', () => onJump(task.id));
      item.append(button);
      list.append(item);
    }
    if (tasks.length > SHOWN) {
      const more = document.createElement('li');
      more.className = 'reminder-more';
      more.textContent = `+${tasks.length - SHOWN} more`;
      list.append(more);
    }
    section.append(heading, list);
    container.append(section);
  }
}

export function maybeNotify(groups, today, storage = window.localStorage, api = window.Notification) {
  const count = groups.overdue.length + groups.today.length;
  if (!count || !api) return;
  try {
    if (storage.getItem(NOTIFIED_KEY) === today) return;
    const send = () => {
      storage.setItem(NOTIFIED_KEY, today);
      const parts = [];
      if (groups.overdue.length) parts.push(`${groups.overdue.length} overdue`);
      if (groups.today.length) parts.push(`${groups.today.length} due today`);
      new api('Daybook reminder', { body: parts.join(', ') }); // eslint-disable-line no-new
    };
    if (api.permission === 'granted') send();
    else if (api.permission === 'default') {
      Promise.resolve(api.requestPermission()).then((result) => { if (result === 'granted') send(); }, () => {});
    }
  } catch {
    // Notifications are optional; ignore unsupported or blocked environments.
  }
}
