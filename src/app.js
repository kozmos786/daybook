import {
  INBOX_ID, addTask, updateTask, deleteTask, addList, deleteList,
  visibleTasks, localDate, importText,
} from './model.js';
import { STORAGE_KEY, loadWorkspace, saveWorkspace, parseBackup, serializeWorkspace } from './storage.js';
import { createSchoolUi } from './schoolUi.js';
import { initGames } from './games.js';
import { initTabs } from './tabs.js';
import { createGradesUi } from './gradesUi.js';
import { createScheduleUi } from './scheduleUi.js';
import { createCafeUi } from './cafeUi.js';
import { createHubUi } from './hubUi.js';
import { maybeNotify, reminderGroups, renderReminders } from './reminders.js';
import { initTheme } from './theme.js';

const byId = (id) => document.getElementById(id);
let workspace = null;
let selectedList = '';
let selectedFilter = 'all';
let editingId = null;
let busy = false;
let renderedDay = '';

function showError(error) {
  console.error(error);
  byId('error').textContent = error.message;
  byId('error').hidden = false;
  byId('status').textContent = '';
}

function announce(message) {
  byId('error').hidden = true;
  byId('error').textContent = '';
  byId('status').textContent = message;
}

function commit(candidate) {
  saveWorkspace(window.localStorage, candidate);
  workspace = candidate;
  const note = document.getElementById('save-note');
  if (note) note.textContent = `Saved ✓ ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

async function protectStorage() {
  const note = document.getElementById('save-note');
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted()) && !(await navigator.storage.persist()) && note) {
      note.textContent += ' · Browser may clear it; export a backup now and then';
    }
  } catch { /* persistence request is best effort */ }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function resetEditor() {
  editingId = null;
  byId('task-form').reset();
  byId('task-list').value = INBOX_ID;
  byId('save-task').textContent = '+ Add task';
  byId('editor-mode').textContent = 'NEW TASK';
  byId('cancel-edit').hidden = true;
}

function confirmAction(title, message, accept) {
  const dialog = byId('confirm-dialog');
  byId('confirm-title').textContent = title;
  byId('confirm-message').textContent = message;
  byId('confirm-accept').textContent = accept;
  dialog.returnValue = 'cancel';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.showModal();
  });
}

function renderNavigation() {
  const nav = byId('list-navigation');
  nav.replaceChildren();
  const items = [{ id: '', name: 'All tasks' }, ...workspace.lists];
  for (const list of items) {
    const button = element('button', 'list-button');
    button.type = 'button';
    if (selectedList === list.id) button.setAttribute('aria-current', 'page');
    const count = workspace.tasks.filter((task) => !task.completed && (!list.id || task.listId === list.id)).length;
    button.append(element('span', '', list.name), element('span', 'list-count', String(count)));
    button.addEventListener('click', () => {
      selectedList = list.id;
      renderNavigation();
      renderTasks();
      school.render();
      nav.querySelector('[aria-current="page"]').focus();
    });
    nav.append(button);
  }
  byId('tasks-heading').textContent = items.find((list) => list.id === selectedList).name;
  byId('delete-list').hidden = !selectedList || selectedList === INBOX_ID;
  const previous = byId('task-list').value;
  byId('task-list').replaceChildren(...workspace.lists.map((list) => {
    const option = element('option', '', list.name);
    option.value = list.id;
    return option;
  }));
  byId('task-list').value = workspace.lists.some((list) => list.id === previous) ? previous : INBOX_ID;
}

function editTask(task) {
  editingId = task.id;
  byId('task-title').value = task.title;
  byId('task-description').value = task.description;
  byId('task-due').value = task.dueDate ?? '';
  byId('task-list').value = task.listId;
  byId('save-task').textContent = 'Save changes';
  byId('editor-mode').textContent = 'EDIT TASK';
  byId('cancel-edit').hidden = false;
  byId('task-title').focus();
}

function renderTasks() {
  const list = byId('tasks');
  list.replaceChildren();
  const today = localDate();
  renderedDay = today;
  byId('current-date').textContent = new Intl.DateTimeFormat(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  }).format(new Date()).toUpperCase();
  const tasks = visibleTasks(workspace, {
    listId: selectedList, filter: selectedFilter,
    completed: byId('show-completed').checked, today,
  });
  byId('task-count').textContent = String(tasks.length);
  byId('empty').hidden = tasks.length !== 0;
  for (const task of tasks) {
    const item = element('li', `task-item${task.completed ? ' is-completed' : ''}`);
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.setAttribute('aria-label', `${task.completed ? 'Reopen' : 'Complete'} ${task.title}`);
    checkbox.addEventListener('change', () => {
      try {
        const position = [...byId('tasks').querySelectorAll('input[type="checkbox"]')].indexOf(checkbox);
        commit(updateTask(workspace, task.id, { completed: checkbox.checked }));
        const message = checkbox.checked ? 'Task completed.' : 'Task reopened.';
        render();
        const controls = [...byId('tasks').querySelectorAll('input[type="checkbox"]')];
        const stayed = controls.find((control) => control.dataset.taskId === task.id);
        (stayed ?? controls[Math.min(position, controls.length - 1)] ?? byId('show-completed')).focus();
        announce(message);
      } catch (error) {
        checkbox.checked = task.completed;
        showError(error);
      }
    });
    checkbox.dataset.taskId = task.id;
    const body = element('div', 'task-body');
    body.append(element('h3', 'task-name', task.title));
    if (task.description) body.append(element('p', 'task-notes', task.description));
    const meta = element('div', 'task-meta');
    meta.append(element('span', 'list-tag', workspace.lists.find((entry) => entry.id === task.listId).name));
    if (task.dueDate) {
      const overdue = task.dueDate < today && !task.completed;
      const due = element('time', overdue ? 'overdue' : '', `${overdue ? 'Overdue: ' : 'Due: '}${task.dueDate}`);
      due.dateTime = task.dueDate;
      meta.append(due);
    }
    body.append(meta);
    const actions = element('div', 'task-actions');
    const edit = element('button', '', 'Edit');
    edit.type = 'button';
    edit.setAttribute('aria-label', `Edit ${task.title}`);
    edit.addEventListener('click', () => editTask(task));
    const remove = element('button', 'danger', 'Delete');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Delete ${task.title}`);
    remove.addEventListener('click', async () => {
      if (!await confirmAction('Delete task?', `"${task.title}" will be permanently deleted. This cannot be undone.`, 'Delete task')) return;
      try {
        commit(deleteTask(workspace, task.id));
        if (editingId === task.id) resetEditor();
        render();
        byId('task-title').focus();
        announce('Task deleted.');
      } catch (error) { showError(error); }
    });
    actions.append(edit, remove);
    item.append(checkbox, body, actions);
    list.append(item);
  }
}

function jumpToTask(taskId) {
  selectedList = '';
  selectedFilter = 'all';
  render();
  const box = document.querySelector(`#tasks input[data-task-id="${taskId}"]`);
  if (box) { box.scrollIntoView({ block: 'center' }); box.focus(); }
}

function renderReminderBanner() {
  renderReminders(byId('reminders'), reminderGroups(workspace, localDate()), jumpToTask);
}

function render() {
  const unavailable = workspace === null;
  byId('task-fields').disabled = unavailable;
  byId('list-name').disabled = unavailable;
  byId('list-form').querySelector('button').disabled = unavailable;
  byId('export').disabled = unavailable;
  byId('show-completed').disabled = unavailable;
  for (const control of document.querySelectorAll('#list-navigation button, #tasks button, #tasks input, #delete-list')) {
    control.disabled = unavailable;
  }
  for (const button of document.querySelectorAll('[data-filter]')) {
    button.disabled = unavailable;
    button.setAttribute('aria-pressed', String(button.dataset.filter === selectedFilter));
  }
  if (!unavailable) {
    renderNavigation();
    renderTasks();
    school.render();
    renderReminderBanner();
    grades.render();
    schedule.render();
    cafe.render();
    hub.render();
  }
}

byId('task-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const details = {
      title: byId('task-title').value,
      description: byId('task-description').value,
      dueDate: byId('task-due').value || null,
      listId: byId('task-list').value,
    };
    const editing = editingId !== null;
    commit(editing ? updateTask(workspace, editingId, details) : addTask(workspace, details));
    resetEditor();
    render();
    byId('task-title').focus();
    announce(editing ? 'Task updated.' : 'Task added. If it is hidden, check your current list or date filter.');
  } catch (error) { showError(error); }
});

byId('cancel-edit').addEventListener('click', () => {
  resetEditor();
  byId('task-title').focus();
  announce('Editing cancelled.');
});

byId('list-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const candidate = addList(workspace, byId('list-name').value);
    commit(candidate);
    selectedList = candidate.lists.at(-1).id;
    byId('list-form').reset();
    render();
    announce('List created. Choose it in the task form to add tasks to this list.');
  } catch (error) { showError(error); }
});

byId('delete-list').addEventListener('click', async () => {
  const id = selectedList;
  const list = workspace.lists.find((entry) => entry.id === id);
  const hasSchoolData = workspace.school.logs.some((log) => log.listId === id)
    || workspace.school.daysOff.some((entry) => entry.listId === id) || list.targets
    || workspace.grades.entries.some((entry) => entry.listId === id) || workspace.schedules.some((entry) => entry.listId === id);
  const extra = hasSchoolData ? ' Its school target, logged work, saved days off, grades, and schedule will be erased.' : '';
  if (!await confirmAction('Delete list?', `Delete "${list.name}"? Its tasks will move to Inbox, not be deleted.${extra}`, 'Delete list')) return;
  try {
    commit(deleteList(workspace, id));
    selectedList = INBOX_ID;
    render();
    byId('list-name').focus();
    announce('List deleted. Its tasks are in Inbox.');
  } catch (error) { showError(error); }
});

for (const button of document.querySelectorAll('[data-filter]')) {
  button.addEventListener('click', () => {
    selectedFilter = button.dataset.filter;
    render();
  });
}
byId('show-completed').addEventListener('change', () => renderTasks());

byId('export').addEventListener('click', () => {
  try {
    const blob = new Blob([serializeWorkspace(workspace)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = element('a');
    link.href = url;
    link.download = `daybook-backup-${localDate()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('Backup download requested. Keep it somewhere safe.');
  } catch (error) { showError(error); }
});

byId('import').addEventListener('click', () => byId('import-file').click());
byId('import-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file || busy) return;
  busy = true;
  byId('import').disabled = true;
  try {
    const extension = file.name.split('.').at(-1).toLowerCase();
    if (!['json', 'txt'].includes(extension)) throw new Error('Choose a .json backup or a UTF-8 .txt task file.');
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    } catch (error) {
      throw new Error('Could not read the file as UTF-8 text. Save it with UTF-8 encoding and try again.', { cause: error });
    }
    if (extension === 'json') {
      const candidate = parseBackup(text);
      const message = `${candidate.tasks.length} tasks and ${candidate.lists.length} lists will replace all data in this browser, including any task being edited. Export a backup first if needed.`;
      if (!await confirmAction('Replace workspace?', message, 'Replace workspace')) {
        byId('status').textContent = 'Import cancelled. No data was changed.';
        return;
      }
      commit(candidate);
      selectedList = '';
      selectedFilter = 'all';
      byId('show-completed').checked = false;
      resetEditor();
      render();
      announce(`Backup imported: ${candidate.tasks.length} tasks restored.`);
    } else {
      if (!workspace) throw new Error('Restore a valid JSON backup before adding tasks from a text file.');
      const candidate = importText(workspace, text);
      const count = candidate.tasks.length - workspace.tasks.length;
      commit(candidate);
      selectedList = INBOX_ID;
      selectedFilter = 'all';
      render();
      announce(`Imported ${count} ${count === 1 ? 'task' : 'tasks'} into Inbox. Existing tasks were kept.`);
    }
  } catch (error) { showError(error); }
  finally {
    busy = false;
    byId('import').disabled = false;
    event.target.value = '';
  }
});

window.addEventListener('storage', (event) => {
  if (event.key === null || event.key === STORAGE_KEY) {
    showError(new Error('Planner data changed in another tab. Reload this page before making more changes. Copy any unsaved edits first.'));
    workspace = null;
    if (byId('confirm-dialog').open) byId('confirm-dialog').close('cancel');
    school.closeDay();
    for (const id of ['grades-dialog', 'report-dialog', 'schedule-dialog']) if (byId(id).open) byId(id).close();
    render();
  }
});
function refreshDate() {
  if (workspace && renderedDay !== localDate()) { renderTasks(); school.render(); hub.render(); cafe.render(); }
}
window.addEventListener('focus', refreshDate);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshDate();
});
setInterval(() => { if (!document.hidden) refreshDate(); }, 60_000);

const school = createSchoolUi({
  getWorkspace: () => workspace,
  getSelectedList: () => selectedList,
  commit, confirmAction, showError, announce, refresh: render,
  openGrades: (id, name) => grades.open(id, name),
  openSchedule: (id) => schedule.open(id),
});
const shared = { getWorkspace: () => workspace, commit, showError, announce, refresh: render };
const grades = createGradesUi({ ...shared, confirmAction });
const schedule = createScheduleUi(shared);
let tabs = null;
const games = initGames();
const cafe = createCafeUi({ ...shared, openGames: () => tabs.show('games') });
const hub = createHubUi({
  ...shared,
  actions: {
    openTab: (name) => tabs.show(name),
    open(target) {
      if (target === 'report') { grades.openReport(); return; }
      tabs.show(target === 'cafe' ? 'cafe' : 'planner');
      if (target === 'calendar' && byId('calendar').hidden) byId('toggle-calendar').click();
    },
  },
});
byId('open-report').addEventListener('click', () => grades.openReport());
tabs = initTabs({ games, cafe });
initTheme(byId('theme'));

try {
  workspace = loadWorkspace(window.localStorage);
} catch (error) { showError(error); }
render();
protectStorage();
if (workspace) maybeNotify(reminderGroups(workspace, localDate()), localDate());
