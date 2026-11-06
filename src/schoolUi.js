import { INBOX_ID, localDate, updateTask } from './model.js';
import { addDays } from './dates.js';
import { addWork, cancelDayOff, markHoliday, setSubjectTarget, setWorkLogged, spendDayOff, unmarkHoliday } from './schoolActions.js';
import { dayDetails, dayKind, isSubject, monthGrid, targetOn, todaySummary } from './school.js';
import { guideStarted, moveTask, nextMonday, presetFor, startSchoolYear, subjectStyle, swapDueDates } from './guide.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const byId = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, action, data = {}, className = '') {
  const node = el('button', className, label);
  node.type = 'button';
  node.dataset.action = action;
  Object.assign(node.dataset, data);
  return node;
}

// Rebuilds a container but keeps keyboard focus on the equivalent control.
function rebuild(container, build) {
  const active = document.activeElement;
  const key = container.contains(active) && active.dataset?.action
    ? { action: active.dataset.action, list: active.dataset.list, date: active.dataset.date }
    : null;
  container.replaceChildren();
  build();
  if (!key) return;
  const match = [...container.querySelectorAll('[data-action]')].find((node) =>
    node.dataset.action === key.action && node.dataset.list === key.list && node.dataset.date === key.date);
  match?.focus();
}

export function createSchoolUi({ getWorkspace, getSelectedList, commit, confirmAction, showError, announce, refresh }) {
  let calendarOpen = false;
  let view = null;
  let openDate = null;
  let showAll = false;
  const openPlans = new Set();

  function run(change, message) {
    try {
      commit(change(getWorkspace()));
      refresh();
      announce(message);
    } catch (error) { showError(error); }
  }

  function renderToday(workspace) {
    const summary = todaySummary(workspace, localDate());
    const container = byId('school-today');
    const note = { weekend: 'Weekend: work you log counts double.', holiday: 'Holiday: work you log counts double.' }[summary.kind];
    rebuild(container, () => {
      if (summary.subjects.length === 0) {
        container.append(el('p', 'school-empty', 'No subjects yet. Press "Start the school year" above to set everything up.'));
        return;
      }
      if (note) container.append(el('p', 'school-note', note));
      for (const subject of summary.subjects) {
        const id = subject.list.id;
        const row = el('div', 'subject-row');
        const info = el('div', 'subject-info');
        const style = subjectStyle(subject.list.name);
        row.style.setProperty('--accent', style.color);
        const heading = el('div', 'subject-heading');
        const emoji = el('span', 'emoji', style.emoji);
        emoji.setAttribute('aria-hidden', 'true');
        heading.append(emoji, el('strong', '', subject.list.name));
        info.append(heading);
        const status = subject.dayOff
          ? 'Day off today'
          : summary.kind === 'school'
            ? `${subject.logged} of ${subject.target} ${subject.unit} done, ${subject.remaining} to go`
            : `${subject.logged} ${subject.unit} logged`;
        info.append(el('span', '', status));
        const bar = el('progress');
        bar.max = subject.target;
        bar.value = Math.min(subject.logged, subject.target);
        bar.setAttribute('aria-label', `${subject.list.name} progress today`);
        info.append(bar);
        info.append(el('span', 'subject-saved',
          `Saved days off: ${subject.balance} (${subject.carry} extra carried)`));
        const controls = el('div', 'subject-controls');
        const minus = button('\u2212', 'minus', { list: id }, 'icon-button');
        minus.setAttribute('aria-label', `Remove one ${subject.unit} from ${subject.list.name}`);
        if (subject.logged === 0) minus.setAttribute('aria-disabled', 'true');
        const plus = button('+1', 'plus', { list: id }, 'big-button');
        plus.setAttribute('aria-label', `Add one ${subject.unit} to ${subject.list.name}`);
        controls.append(minus, plus);
        if (subject.remaining > 0) {
          const done = button('Done for today', 'done', { list: id }, 'secondary');
          done.setAttribute('aria-label', `Finish today's ${subject.list.name} target`);
          controls.append(done);
        }
        row.append(info, controls);
        if (subject.balance > 0) {
          const off = el('div', 'quick-off');
          const date = el('input');
          date.type = 'date';
          date.id = `off-date-${id}`;
          date.value = nextOffDate(workspace, id, localDate());
          const label = el('label', '', 'Day off on');
          label.htmlFor = date.id;
          off.append(label, date, button('Use a day off', 'quick-off', { list: id }, 'secondary'));
          row.append(off);
          }
          container.append(row);
      }
    });
  }

  function renderUpcoming(workspace) {
    const today = localDate();
    const soon = addDays(today, 3);
    const subjects = new Map(workspace.lists.filter(isSubject).map((list) => [list.id, list.name]));
    const tasks = workspace.tasks.filter((task) => !task.completed && subjects.has(task.listId))
      .sort((a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99'));
    const container = byId('upcoming');
    rebuild(container, () => {
      if (tasks.length === 0) {
        container.append(el('p', 'school-empty', 'Nothing due. Start the school year above or add an assignment to a subject.'));
        return;
      }
      for (const task of showAll ? tasks : tasks.slice(0, 8)) {
        const urgency = !task.dueDate ? '' : task.dueDate < today ? 'overdue'
          : task.dueDate === today ? 'due-today' : task.dueDate <= soon ? 'due-soon' : '';
        const item = el('div', `upcoming-item ${urgency}`);
        item.style.setProperty('--accent', subjectStyle(subjects.get(task.listId)).color);
        const top = el('label', 'upcoming-title');
        const box = el('input');
        box.type = 'checkbox';
        box.dataset.task = task.id;
        box.dataset.action = 'complete';
        box.dataset.list = task.id;
        const when = task.dueDate ? `${urgency === 'overdue' ? 'Overdue: ' : 'Due '}${task.dueDate}` : 'No due date';
        top.append(box, el('span', '', `${task.title} \u00B7 ${when}`));
        const plan = el('details', 'change-plan');
        plan.append(el('summary', '', 'Change plan'));
        const move = el('div', 'plan-row');
        const date = el('input');
        date.type = 'date';
        date.id = `move-date-${task.id}`;
        date.value = task.dueDate ?? '';
        date.setAttribute('aria-label', `New due date for ${task.title}`);
        move.append(date, button('Move', 'move', { list: task.id }, 'secondary'));
        const swap = el('div', 'plan-row');
        const choice = el('select');
        choice.id = `swap-with-${task.id}`;
        choice.setAttribute('aria-label', `Swap due date of ${task.title} with`);
        for (const other of tasks) {
          if (other.id === task.id) continue;
          const option = el('option', '', `${other.title} (${other.dueDate ?? 'no date'})`);
          option.value = other.id;
          choice.append(option);
        }
        swap.append(choice, button('Swap dates', 'swap', { list: task.id }, 'secondary'));
        plan.append(move, swap);
        if (openPlans.has(task.id)) plan.open = true;
        plan.addEventListener('toggle', () => { if (plan.open) openPlans.add(task.id); else openPlans.delete(task.id); });
        item.append(top, plan);
        container.append(item);
      }
      if (tasks.length > 8) {
        container.append(button(showAll ? 'Show fewer' : `Show all ${tasks.length}`, 'toggle-all', {}, 'secondary'));
      }
    });
  }

  function guideChoice() {
    return { grade: Number(byId('grade').value), advanced: byId('advanced-math').checked };
  }

  function renderGuide(workspace) {
    const { grade, advanced } = guideChoice();
    const subjects = presetFor(grade, advanced);
    byId('guide-preview').textContent = `Includes: ${subjects.map((s) => `${subjectStyle(s.name).emoji} ${s.name}`).join(', ')}`;
    const started = guideStarted(workspace, grade, advanced);
    const start = byId('start-year');
    start.textContent = started ? 'Already set up \u2728' : 'Start the school year';
    if (started) start.setAttribute('aria-disabled', 'true');
    else start.removeAttribute('aria-disabled');
    const date = byId('year-start');
    if (!date.value) date.value = nextMonday(localDate());
  }

  function nextOffDate(workspace, listId, today) {
    for (let date = addDays(today, 1), n = 0; n < 60; date = addDays(date, 1), n++) {
      if (dayKind(workspace.school, date) === 'school'
        && !workspace.school.daysOff.some((entry) => entry.listId === listId && entry.date === date)) return date;
    }
    return today;
  }

  function renderSettings(workspace) {
    const id = getSelectedList();
    const list = workspace.lists.find((entry) => entry.id === id);
    const form = byId('subject-settings');
    form.hidden = !list || id === INBOX_ID;
    if (form.hidden) {
      form.dataset.list = '';
      return;
    }
    byId('subject-name').textContent = list.name;
    if (form.dataset.list !== id) {
      form.dataset.list = id;
      byId('target-units').value = String(targetOn(list, localDate()));
      byId('target-unit').value = list.unit ?? '';
    }
  }

  function renderCalendar(workspace) {
    const toggle = byId('toggle-calendar');
    const container = byId('calendar');
    toggle.setAttribute('aria-expanded', String(calendarOpen));
    container.hidden = !calendarOpen;
    if (!calendarOpen) return;
    const today = localDate();
    view ??= { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
    const weeks = monthGrid(workspace, view.year, view.month);
    rebuild(container, () => {
      const nav = el('div', 'calendar-nav');
      const prev = button('\u2039', 'prev-month', {}, 'icon-button');
      prev.setAttribute('aria-label', 'Previous month');
      const next = button('\u203A', 'next-month', {}, 'icon-button');
      next.setAttribute('aria-label', 'Next month');
      const title = el('strong', '', `${MONTHS[view.month - 1]} ${view.year}`);
      title.setAttribute('aria-live', 'polite');
      nav.append(prev, title, next, button('This month', 'this-month', {}, 'secondary'));
      const table = el('table', 'calendar-table');
      const head = el('tr');
      for (const day of WEEKDAYS) {
        const th = el('th', '', day);
        th.scope = 'col';
        head.append(th);
      }
      const thead = el('thead');
      thead.append(head);
      const body = el('tbody');
      for (const week of weeks) {
        const row = el('tr');
        for (const cell of week) {
          const td = el('td');
          const label = [cell.date];
          const marks = [];
          if (cell.kind === 'holiday') { marks.push('Holiday'); label.push('holiday'); }
          if (cell.kind === 'weekend') label.push('weekend');
          if (cell.dayOffs.length) { marks.push(`Off: ${cell.dayOffs.join(', ')}`); label.push(`day off for ${cell.dayOffs.join(', ')}`); }
          if (cell.deadlines.length) { marks.push(`${cell.deadlines.length} due`); label.push(`${cell.deadlines.length} deadlines`); }
          const day = button(cell.date.slice(8).replace(/^0/, ''), 'open-day', { date: cell.date },
            `day day-${cell.kind}${cell.inMonth ? '' : ' outside'}${cell.date === today ? ' today' : ''}`);
          day.setAttribute('aria-label', label.join(', '));
          td.append(day);
          if (marks.length) td.append(el('span', 'day-marks', marks.join(' \u00B7 ')));
          row.append(td);
        }
        body.append(row);
      }
      table.append(thead, body);
      container.append(nav, table);
    });
  }

  function renderDay(workspace) {
    const dialog = byId('day-dialog');
    if (!openDate || !dialog.open) return;
    const details = dayDetails(workspace, openDate, localDate());
    byId('day-title').textContent = openDate;
    const body = byId('day-body');
    rebuild(body, () => {
      const kinds = { school: 'School day.', weekend: 'Weekend. Logged work counts double.', holiday: 'Holiday. Logged work counts double.' };
      body.append(el('p', 'school-note', kinds[details.kind]));
      if (details.kind !== 'weekend') {
        body.append(button(details.kind === 'holiday' ? 'Remove holiday' : 'Mark as holiday',
          'toggle-holiday', { date: openDate }, 'secondary'));
      }
      for (const subject of details.subjects) {
        const box = el('section', 'day-subject');
        box.append(el('h3', '', subject.list.name));
        if (subject.spent) box.append(el('p', '', 'Day off (saved day used).'));
        for (const task of subject.deadlines) box.append(el('p', 'deadline', `Due: ${task.title}`));
        if (subject.canLog) {
          const input = el('input');
          input.type = 'number';
          input.min = '0';
          input.step = '1';
          input.value = String(subject.logged);
          input.id = `log-${subject.list.id}`;
          const label = el('label', '', `Logged ${subject.unit}`);
          label.htmlFor = input.id;
          const row = el('div', 'inline');
          row.append(input, button('Save', 'save-log', { list: subject.list.id, date: openDate }, 'secondary'));
          box.append(label, row);
        }
        if (subject.canSpend) box.append(button(`Use a day off (${subject.balance} saved)`, 'spend', { list: subject.list.id, date: openDate }, 'secondary'));
        if (subject.canCancel) box.append(button('Cancel this day off', 'cancel-off', { list: subject.list.id, date: openDate }, 'secondary'));
        body.append(box);
      }
      if (details.subjects.length === 0) body.append(el('p', '', 'No subjects have a daily target yet.'));
    });
  }

  function dayRun(change, message) {
    byId('day-error').hidden = true;
    try {
      commit(change(getWorkspace()));
      refresh();
      byId('day-note').textContent = message;
    } catch (error) {
      byId('day-error').textContent = error.message;
      byId('day-error').hidden = false;
    }
  }

  async function spend(listId, date, apply = dayRun) {
    const workspace = getWorkspace();
    const list = workspace.lists.find((entry) => entry.id === listId);
    const due = dayDetails(workspace, date, localDate()).subjects.find((s) => s.list.id === listId)?.deadlines ?? [];
    if (due.length && !await confirmAction('Deadline on this day',
      `"${due[0].title}" in ${list.name} is due on ${date}. Use a day off anyway?`, 'Use day off')) return;
    apply((ws) => spendDayOff(ws, listId, date), 'Day off used.');
  }

  function onClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action, list, date } = target.dataset;
    const today = localDate();
    if (action === 'plus') run((ws) => addWork(ws, list, today, 1), 'Work logged.');
    else if (action === 'done') {
      const remaining = todaySummary(getWorkspace(), today).subjects.find((s) => s.list.id === list)?.remaining ?? 0;
      if (remaining > 0) run((ws) => addWork(ws, list, today, remaining), 'Target finished for today.');
    } else if (action === 'quick-off') spend(list, byId(`off-date-${list}`).value, run);
    else if (action === 'move') run((ws) => moveTask(ws, list, byId(`move-date-${list}`).value), 'Due date changed.');
    else if (action === 'swap') run((ws) => swapDueDates(ws, list, byId(`swap-with-${list}`).value), 'Due dates swapped.');
    else if (action === 'toggle-all') {
      showAll = !showAll;
      renderUpcoming(getWorkspace());
    } else if (action === 'minus') {
      if (target.getAttribute('aria-disabled') === 'true') return;
      run((ws) => addWork(ws, list, today, -1), 'Work removed.');
    } else if (action === 'prev-month' || action === 'next-month') {
      const index = view.year * 12 + view.month - 1 + (action === 'next-month' ? 1 : -1);
      const year = Math.floor(index / 12);
      if (year < 1900 || year > 2200) return;
      view = { year, month: (index % 12) + 1 };
      renderCalendar(getWorkspace());
    } else if (action === 'this-month') {
      view = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
      renderCalendar(getWorkspace());
    } else if (action === 'open-day') {
      openDate = date;
      byId('day-error').hidden = true;
      byId('day-note').textContent = '';
      byId('day-dialog').showModal();
      renderDay(getWorkspace());
    } else if (action === 'toggle-holiday') {
      const isHoliday = getWorkspace().school.holidays.includes(date);
      dayRun((ws) => (isHoliday ? unmarkHoliday(ws, date) : markHoliday(ws, date)),
        isHoliday ? 'Holiday removed.' : 'Holiday added.');
    } else if (action === 'save-log') {
      const raw = byId(`log-${list}`).value.trim();
      dayRun((ws) => setWorkLogged(ws, list, date, raw === '' ? Number.NaN : Number(raw)), 'Work saved.');
    } else if (action === 'spend') spend(list, date);
    else if (action === 'cancel-off') dayRun((ws) => cancelDayOff(ws, list, date), 'Day off cancelled.');
  }

  byId('school-today').addEventListener('click', onClick);
  byId('upcoming').addEventListener('change', (event) => {
    const box = event.target;
    if (box.dataset.action !== 'complete') return;
    run((ws) => updateTask(ws, box.dataset.task, { completed: true }), 'Assignment completed.');
  });
  byId('upcoming').addEventListener('click', onClick);
  byId('start-year').addEventListener('click', () => {
    const { grade, advanced } = guideChoice();
    if (guideStarted(getWorkspace(), grade, advanced)) return;
    run((ws) => startSchoolYear(ws, byId('year-start').value, localDate(), grade, advanced), 'School year ready! \u2728');
  });
  for (const id of ['grade', 'advanced-math']) {
    byId(id).addEventListener('change', () => { if (getWorkspace()) renderGuide(getWorkspace()); });
  }
  byId('calendar').addEventListener('click', onClick);
  byId('day-body').addEventListener('click', onClick);
  byId('close-day').addEventListener('click', () => byId('day-dialog').close());
  byId('day-dialog').addEventListener('close', () => { openDate = null; });
  byId('toggle-calendar').addEventListener('click', () => {
    calendarOpen = !calendarOpen;
    renderCalendar(getWorkspace());
    if (calendarOpen) byId('calendar').scrollIntoView({ block: 'nearest' });
  });
  byId('subject-settings').addEventListener('submit', (event) => {
    event.preventDefault();
    const raw = byId('target-units').value.trim();
    run((ws) => setSubjectTarget(ws, getSelectedList(), {
      units: raw === '' ? Number.NaN : Number(raw),
      unit: byId('target-unit').value,
    }), 'Subject settings saved.');
  });

  return {
    render() {
      const workspace = getWorkspace();
      if (!workspace) return;
      renderSettings(workspace);
      renderToday(workspace);
      renderGuide(workspace);
      renderUpcoming(workspace);
      renderCalendar(workspace);
      renderDay(workspace);
    },
    closeDay() { if (byId('day-dialog').open) byId('day-dialog').close(); },
  };
}
