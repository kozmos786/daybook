import { localDate } from './dates.js';
import { addTask, updateTask, validateWorkspace } from './model.js';
import { addWork } from './schoolActions.js';
import { isSubject, monthGrid, todaySummary } from './school.js';
import { subjectStyle } from './guide.js';
import { reminderGroups } from './reminders.js';
import { SIZES, emptyHub } from './extras.js';
import { CATEGORIES, addGrade, bestAndWorst, overallGpa, subjectSummary } from './grades.js';
import { describeFinish, doneCount, forecast } from './schedule.js';
import { beanBalance, favourite, greeting } from './cafe.js';
import { removeVerse, resetVerses, saveVerse, shuffleVerse, togglePin, verseOfDay, versesFor } from './verses.js';
import { formatDate } from './scheduleUi.js';

const byId = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function btn(label, className = 'secondary', onClick) {
  const node = el('button', className, label);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

const TITLES = {
  today: ['\u2600\uFE0F', 'Today'], reminders: ['\uD83D\uDD14', 'Reminders'], subjects: ['\uD83D\uDCDA', 'Subjects'],
  upcoming: ['\uD83D\uDCCC', 'Upcoming'], grades: ['\uD83D\uDCCA', 'Grades'], schedule: ['\uD83D\uDDD3\uFE0F', 'Schedule'],
  daysoff: ['\uD83C\uDF34', 'Days off saved'], calendar: ['\uD83D\uDCC5', 'Calendar'], quickadd: ['\u2795', 'Quick add'],
  tasks: ['\u2705', 'Tasks'], log: ['\u270F\uFE0F', 'Log work'], cafe: ['\u2615', 'Break room'], verse: ['\uD83D\uDCD6', 'Verse of the day'],
};
const OPENS = {
  today: 'planner', reminders: 'planner', subjects: 'planner', upcoming: 'planner', grades: 'report', schedule: 'planner',
  daysoff: 'planner', calendar: 'calendar', quickadd: 'planner', tasks: 'planner', log: 'planner', cafe: 'cafe', verse: null,
};
const MONTH_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function createHubUi({ getWorkspace, commit, showError, announce, refresh, actions }) {
  let customizing = false;
  let managingVerses = false;
  let editingVerse = null;

  function apply(change, message) {
    try {
      commit(validateWorkspace(change(getWorkspace())));
      refresh();
      if (message) announce(message);
      return true;
    } catch (error) { showError(error); return false; }
  }

  const today = () => localDate();

  const builders = {
    today(body, ws) {
      const summary = todaySummary(ws, today());
      if (!summary.subjects.length) { body.append(el('p', 'school-empty', 'No subjects yet. Start the school year in Planner.')); return; }
      const label = { school: 'School day', weekend: 'Weekend: work counts double', holiday: 'No school today: work counts double' }[summary.kind];
      body.append(el('p', 'school-note', label));
      for (const subject of summary.subjects) {
        const row = el('div', 'mini-row');
        row.append(el('span', '', subject.dayOff ? `${subject.list.name}: day off` : `${subject.list.name}: ${subject.logged}/${subject.target} ${subject.unit}`));
        const bar = el('progress');
        bar.max = subject.target;
        bar.value = Math.min(subject.logged, subject.target);
        bar.setAttribute('aria-label', `${subject.list.name} progress`);
        row.append(bar);
        body.append(row);
      }
    },
    reminders(body, ws) {
      const groups = reminderGroups(ws, today());
      const overdue = groups.overdue.length;
      const due = groups.today.length;
      body.append(el('p', overdue ? 'overdue' : '', `${overdue} overdue \u00B7 ${due} due today`));
      const list = el('ul', 'mini-list');
      for (const task of [...groups.overdue, ...groups.today].slice(0, 5)) list.append(el('li', '', `${task.title}${task.dueDate ? ` (${task.dueDate})` : ''}`));
      body.append(list);
      if (window.Notification && window.Notification.permission === 'default') {
        body.append(btn('Enable notifications', 'secondary', () => {
          Promise.resolve(window.Notification.requestPermission()).then(() => render(), () => {});
        }));
      }
    },
    subjects(body, ws) {
      const subjects = ws.lists.filter(isSubject);
      if (!subjects.length) { body.append(el('p', 'school-empty', 'No subjects yet.')); return; }
      for (const list of subjects) {
        const total = ws.tasks.filter((task) => task.listId === list.id).length;
        const done = ws.tasks.filter((task) => task.listId === list.id && task.completed).length;
        const row = el('div', 'mini-row');
        row.append(el('span', '', `${subjectStyle(list.name).emoji} ${list.name}: ${done}/${total}`));
        const bar = el('progress');
        bar.max = Math.max(1, total);
        bar.value = done;
        bar.setAttribute('aria-label', `${list.name} assignments done`);
        row.append(bar);
        body.append(row);
      }
    },
    upcoming(body, ws) {
      const tasks = ws.tasks.filter((task) => !task.completed && task.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5);
      if (!tasks.length) { body.append(el('p', 'school-empty', 'Nothing due soon.')); return; }
      const list = el('ul', 'mini-list');
      for (const task of tasks) list.append(el('li', task.dueDate < today() ? 'overdue' : '', `${task.dueDate}: ${task.title}`));
      body.append(list);
    },
    grades(body, ws) {
      const gpa = overallGpa(ws.grades, ws.lists);
      if (gpa === null) body.append(el('p', 'school-empty', 'No grades yet.'));
      else {
        const extremes = bestAndWorst(ws.grades, ws.lists);
        body.append(el('p', 'grade-big', `GPA ${gpa.toFixed(2)}`));
        const best = subjectSummary(ws.grades, extremes.best.list.id);
        const worst = subjectSummary(ws.grades, extremes.worst.list.id);
        body.append(el('p', '', `Best: ${extremes.best.list.name} ${best.percent}%`), el('p', '', `Lowest: ${extremes.worst.list.name} ${worst.percent}%`));
      }
      const subjects = ws.lists.filter(isSubject);
      if (!subjects.length) return;
      const form = el('form', 'quick-grade');
      const subject = el('select');
      subject.setAttribute('aria-label', 'Subject');
      for (const list of subjects) subject.append(new Option(list.name, list.id));
      const name = el('input');
      name.placeholder = 'Grade name';
      name.setAttribute('aria-label', 'Grade name');
      name.required = true;
      const earned = el('input');
      earned.type = 'number';
      earned.min = '0';
      earned.step = 'any';
      earned.placeholder = 'Earned';
      earned.setAttribute('aria-label', 'Score earned');
      earned.required = true;
      const possible = el('input');
      possible.type = 'number';
      possible.min = '1';
      possible.step = 'any';
      possible.value = '100';
      possible.setAttribute('aria-label', 'Score possible');
      const category = el('select');
      category.setAttribute('aria-label', 'Category');
      for (const entry of CATEGORIES) category.append(new Option(entry, entry));
      const add = el('button', 'primary', 'Add grade');
      add.type = 'submit';
      form.append(subject, name, earned, possible, category, add);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        apply((current) => addGrade(current, {
          listId: subject.value, name: name.value, earned: earned.value, possible: possible.value,
          date: today(), category: category.value,
        }), 'Grade added.');
      });
      body.append(form);
    },
    schedule(body, ws) {
      if (!ws.schedules.length) { body.append(el('p', 'school-empty', 'No schedules yet. Open a subject in Planner and press Schedule.')); return; }
      for (const schedule of ws.schedules) {
        const name = ws.lists.find((list) => list.id === schedule.listId).name;
        const result = forecast(ws, schedule, today());
        const row = el('div', 'mini-row');
        row.append(el('span', '', result.finished ? `\uD83C\uDF89 ${name}: finished!` : `${name}: ${result.done}/${schedule.total}, done ${formatDate(result.planned)}`));
        const bar = el('progress');
        bar.max = schedule.total;
        bar.value = Math.min(schedule.total, doneCount(ws, schedule));
        bar.setAttribute('aria-label', `${name} lessons done`);
        row.append(bar);
        if (!result.finished) row.append(el('small', '', describeFinish(today(), result.planned)));
        body.append(row);
      }
    },
    daysoff(body, ws) {
      const summary = todaySummary(ws, today());
      if (!summary.subjects.length) { body.append(el('p', 'school-empty', 'No subjects yet.')); return; }
      const list = el('ul', 'mini-list');
      for (const subject of summary.subjects) list.append(el('li', '', `${subject.list.name}: ${subject.balance}`));
      body.append(list);
    },
    calendar(body, ws) {
      const now = today();
      const grid = monthGrid(ws, Number(now.slice(0, 4)), Number(now.slice(5, 7)));
      const table = el('table', 'mini-calendar');
      const head = el('tr');
      for (const day of MONTH_DAYS) head.append(el('th', '', day));
      const thead = el('thead');
      thead.append(head);
      const tbody = el('tbody');
      for (const week of grid) {
        const row = el('tr');
        for (const cell of week) {
          const td = el('td', `day-${cell.kind}${cell.inMonth ? '' : ' outside'}${cell.date === now ? ' today' : ''}${cell.deadlines.length ? ' has-due' : ''}`, cell.date.slice(8).replace(/^0/, ''));
          td.title = cell.date;
          row.append(td);
        }
        tbody.append(row);
      }
      table.append(thead, tbody);
      body.append(table);
    },
    quickadd(body, ws) {
      const form = el('form', 'quick-add');
      const title = el('input');
      title.id = 'hub-quick-title';
      title.placeholder = 'New task';
      title.setAttribute('aria-label', 'Task title');
      title.required = true;
      const due = el('input');
      due.type = 'date';
      due.setAttribute('aria-label', 'Due date');
      const add = el('button', 'primary', 'Add');
      add.type = 'submit';
      form.append(title, due, add);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (apply((current) => addTask(current, { title: title.value, dueDate: due.value || null }), 'Task added to Inbox.')) byId('hub-quick-title')?.focus();
      });
      body.append(form);
    },
    tasks(body, ws) {
      const tasks = ws.tasks.filter((task) => !task.completed).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
      if (!tasks.length) { body.append(el('p', 'school-empty', 'All clear!')); return; }
      const list = el('ul', 'mini-list tasks-scroll');
      for (const task of tasks) {
        const item = el('li');
        const label = el('label', 'check');
        const box = el('input');
        box.type = 'checkbox';
        box.setAttribute('aria-label', `Complete ${task.title}`);
        box.addEventListener('change', () => apply((current) => updateTask(current, task.id, { completed: true }), 'Task completed.'));
        label.append(box, document.createTextNode(` ${task.title}${task.dueDate ? ` (${task.dueDate})` : ''}`));
        item.append(label);
        list.append(item);
      }
      body.append(list);
    },
    log(body, ws) {
      const summary = todaySummary(ws, today());
      if (!summary.subjects.length) { body.append(el('p', 'school-empty', 'No subjects yet.')); return; }
      for (const subject of summary.subjects) {
        const row = el('div', 'mini-row log-row');
        row.append(el('span', '', `${subject.list.name} (${subject.logged})`));
        const plus = btn('+1', 'primary', () => apply((current) => addWork(current, subject.list.id, today(), 1), 'Work logged.'));
        plus.setAttribute('aria-label', `Add one ${subject.unit} to ${subject.list.name}`);
        row.append(plus);
        body.append(row);
      }
    },
    cafe(body, ws) {
      const usual = favourite(ws.cafe);
      body.append(el('p', '', greeting(new Date().getHours(), usual)), el('p', 'grade-big', `${beanBalance(ws)} \uD83E\uDED8 beans`));
      body.append(btn('Take a break', 'primary', () => actions.openTab('cafe')));
    },
    verse(body, ws) {
      const verse = verseOfDay(ws.verses, today());
      if (!verse) { body.append(el('p', 'school-empty', 'No verses. Add one below.')); } else {
        const quote = el('blockquote', 'verse-text', verse.text);
        const cite = el('cite', '', verse.ref);
        body.append(quote, cite);
        const row = el('div', 'verse-actions');
        const pinned = ws.verses.pinned === verse.id;
        row.append(
          btn('Shuffle', 'secondary', () => apply((current) => shuffleVerse(current, today()), 'New verse picked.')),
          btn(pinned ? 'Unpin favourite' : 'Pin as favourite', 'secondary', () => apply((current) => togglePin(current, verse.id), pinned ? 'Unpinned.' : 'Pinned as a favourite.')),
        );
        body.append(row);
      }
      const pinnedVerse = versesFor(ws.verses).find((entry) => entry.id === ws.verses.pinned);
      if (pinnedVerse && pinnedVerse.id !== verse?.id) body.append(el('p', 'verse-pinned', `\u2B50 ${pinnedVerse.ref}: ${pinnedVerse.text}`));
      const details = el('details', 'verse-manage');
      details.open = managingVerses;
      details.addEventListener('toggle', () => { managingVerses = details.open; });
      details.append(el('summary', '', 'Manage verses'));
      const form = el('form', 'verse-form');
      const edit = editingVerse ? versesFor(ws.verses).find((entry) => entry.id === editingVerse) : null;
      const ref = el('input');
      ref.placeholder = 'Reference';
      ref.setAttribute('aria-label', 'Verse reference');
      ref.value = edit?.ref ?? '';
      ref.required = true;
      const text = el('textarea');
      text.rows = 2;
      text.placeholder = 'Verse text';
      text.setAttribute('aria-label', 'Verse text');
      text.value = edit?.text ?? '';
      text.required = true;
      const save = el('button', 'primary', edit ? 'Save verse' : 'Add verse');
      save.type = 'submit';
      form.append(ref, text, save);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const id = editingVerse;
        editingVerse = null;
        if (!apply((current) => saveVerse(current, { id, ref: ref.value, text: text.value }), 'Verse saved.')) editingVerse = id;
      });
      details.append(form);
      const list = el('ul', 'verse-list');
      for (const entry of versesFor(ws.verses)) {
        const item = el('li', '', `${entry.ref} `);
        const editButton = btn('Edit', 'quiet', () => { editingVerse = entry.id; managingVerses = true; render(); });
        editButton.setAttribute('aria-label', `Edit ${entry.ref}`);
        const remove = btn('Delete', 'quiet danger', () => apply((current) => removeVerse(current, entry.id), 'Verse deleted.'));
        remove.setAttribute('aria-label', `Delete ${entry.ref}`);
        item.append(editButton, remove);
        list.append(item);
      }
      details.append(list, btn('Reset to built-in verses', 'secondary', () => { editingVerse = null; apply((current) => resetVerses(current), 'Verses reset.'); }));
      body.append(details);
    },
  };

  function setLayout(layout, message) {
    apply((ws) => ({ ...ws, hub: { layout } }), message);
  }

  function move(id, offset) {
    const layout = getWorkspace().hub.layout.map((item) => ({ ...item }));
    const from = layout.findIndex((item) => item.id === id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= layout.length) return;
    layout.splice(to, 0, layout.splice(from, 1)[0]);
    setLayout(layout, 'Widget moved.');
    byId('home-customize')?.querySelector(`[data-move="${id}-${offset}"]`)?.focus();
  }

  function renderCustomize(root, ws) {
    root.replaceChildren();
    root.hidden = !customizing;
    if (!customizing) return;
    root.append(el('h3', '', 'Customize Home'));
    root.append(el('p', 'hint', 'Drag the handle, or use Up and Down. Hidden widgets stay saved.'));
    const list = el('ul', 'customize-list');
    ws.hub.layout.forEach((item, index) => {
      const row = el('li', 'customize-item');
      row.dataset.id = item.id;
      const handle = el('span', 'drag-handle', '\u2807');
      handle.setAttribute('aria-hidden', 'true');
      handle.addEventListener('pointerdown', (event) => startDrag(event, row, list));
      const label = el('label', 'check');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = item.visible;
      box.addEventListener('change', () => setLayout(ws.hub.layout.map((entry) => (entry.id === item.id ? { ...entry, visible: box.checked } : entry)), box.checked ? 'Widget shown.' : 'Widget hidden.'));
      label.append(box, document.createTextNode(` ${TITLES[item.id][1]}`));
      const size = el('select');
      size.setAttribute('aria-label', `${TITLES[item.id][1]} size`);
      for (const option of SIZES) size.append(new Option(option, option));
      size.value = item.size;
      size.addEventListener('change', () => setLayout(ws.hub.layout.map((entry) => (entry.id === item.id ? { ...entry, size: size.value } : entry)), 'Size changed.'));
      const up = btn('Up', 'quiet', () => move(item.id, -1));
      up.dataset.move = `${item.id}--1`;
      up.setAttribute('aria-label', `Move ${TITLES[item.id][1]} up`);
      up.disabled = index === 0;
      const down = btn('Down', 'quiet', () => move(item.id, 1));
      down.dataset.move = `${item.id}-1`;
      down.setAttribute('aria-label', `Move ${TITLES[item.id][1]} down`);
      down.disabled = index === ws.hub.layout.length - 1;
      row.append(handle, label, size, up, down);
      list.append(row);
    });
    root.append(list, btn('Reset layout', 'secondary', () => setLayout(emptyHub().layout, 'Layout reset.')));
  }

  function startDrag(event, row, list) {
    event.preventDefault();
    row.classList.add('dragging');
    const onMove = (moveEvent) => {
      const over = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest('.customize-item');
      if (!over || over === row || over.parentElement !== list) return;
      const after = moveEvent.clientY > over.getBoundingClientRect().top + over.offsetHeight / 2;
      list.insertBefore(row, after ? over.nextSibling : over);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      row.classList.remove('dragging');
      const order = [...list.children].map((item) => item.dataset.id);
      const current = getWorkspace().hub.layout;
      if (order.join() === current.map((item) => item.id).join()) return;
      setLayout(order.map((id) => current.find((item) => item.id === id)), 'Widgets reordered.');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function render() {
    const ws = getWorkspace();
    const grid = byId('home-grid');
    if (!ws || !grid) return;
    grid.replaceChildren();
    byId('home-date').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
    for (const item of ws.hub.layout.filter((entry) => entry.visible)) {
      const card = el('section', `widget w-${item.size}`);
      card.dataset.widget = item.id;
      const head = el('div', 'widget-head');
      const heading = el('h2', '', `${TITLES[item.id][0]} ${TITLES[item.id][1]}`);
      head.append(heading);
      if (OPENS[item.id]) {
        const open = btn('Open', 'quiet', () => actions.open(OPENS[item.id]));
        open.setAttribute('aria-label', `Open ${TITLES[item.id][1]}`);
        head.append(open);
      }
      const body = el('div', 'widget-body');
      try { builders[item.id](body, ws); } catch (error) { body.append(el('p', 'message error', error.message)); }
      card.append(head, body);
      grid.append(card);
    }
    if (!grid.children.length) grid.append(el('p', 'school-empty', 'All widgets are hidden. Press Customize to bring them back.'));
    renderCustomize(byId('home-customize'), ws);
  }

  byId('home-customize-toggle').addEventListener('click', () => {
    customizing = !customizing;
    byId('home-customize-toggle').setAttribute('aria-expanded', String(customizing));
    render();
  });

  return { render };
}
