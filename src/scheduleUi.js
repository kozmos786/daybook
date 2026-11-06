import { localDate, addDays } from './dates.js';
import { validateWorkspace } from './model.js';
import { setSubjectTarget } from './schoolActions.js';
import { WEEKDAY_NAMES, defaultSchedule, describeFinish, forecast, timeline } from './schedule.js';

const byId = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function field(labelText, input, id) {
  input.id = id;
  const wrap = el('div', 'field');
  const label = el('label', '', labelText);
  label.htmlFor = id;
  wrap.append(label, input);
  return wrap;
}

function input(type, value, extra = {}) {
  const node = el('input');
  node.type = type;
  node.value = value ?? '';
  Object.assign(node, extra);
  return node;
}

export function formatDate(date) {
  if (!date) return 'not yet known';
  const [year, month, day] = date.split('-').map(Number);
  const when = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(when);
}

function pacePhrase(result) {
  if (result.finished) return '';
  const days = Math.abs(Math.round(result.aheadDays * 10) / 10);
  if (days < 0.5) return 'You are right on schedule.';
  return result.ahead > 0
    ? `You are about ${days} school ${days === 1 ? 'day' : 'days'} ahead of plan.`
    : `You are about ${days} school ${days === 1 ? 'day' : 'days'} behind plan.`;
}

export function forecastLines(result, today) {
  if (result.finished) return ['\uD83C\uDF89 All lessons done. Finished!'];
  const lines = [describeFinish(today, result.planned), `Planned pace finish: ${formatDate(result.planned)}.`];
  if (result.realFinish) lines.push(`At your real pace (${Math.round(result.realPace * 100) / 100} per school day): ${formatDate(result.realFinish)}.`);
  lines.push(pacePhrase(result));
  if (result.goal) {
    lines.push(result.goal.neededPerDay === null
      ? `Your goal date ${formatDate(result.goal.date)} has no school days left.`
      : `To finish by ${formatDate(result.goal.date)} you need ${result.goal.neededPerDay} per school day (${result.goal.onTrack ? 'on track' : 'not on track yet'}).`);
  }
  if (result.pastEnd) lines.push('Heads up: this finishes after your school-year end date.');
  return lines.filter(Boolean);
}

export function createScheduleUi({ getWorkspace, commit, showError, announce, refresh }) {
  let listId = '';
  const dialog = () => byId('schedule-dialog');

  function apply(change, message) {
    try {
      commit(validateWorkspace(change(getWorkspace())));
      refresh();
      if (message) announce(message);
      byId('schedule-error').hidden = true;
      return true;
    } catch (error) {
      byId('schedule-error').textContent = error.message;
      byId('schedule-error').hidden = false;
      showError(error);
      return false;
    }
  }

  function renderResult(body, workspace, schedule) {
    const today = localDate();
    const result = forecast(workspace, schedule, today);
    const box = el('section', 'forecast');
    box.setAttribute('aria-live', 'polite');
    const bar = el('progress');
    bar.max = schedule.total;
    bar.value = Math.min(result.done, schedule.total);
    bar.setAttribute('aria-label', 'Lessons completed');
    box.append(bar, el('p', '', `${result.done} of ${schedule.total} done \u00B7 ${result.left} left${result.finished ? '' : ` \u00B7 ${result.daysLeft} school days left`}`));
    for (const line of forecastLines(result, today)) box.append(el('p', 'forecast-line', line));
    if (!result.finished) {
      const strip = el('div', 'timeline');
      strip.setAttribute('role', 'img');
      strip.setAttribute('aria-label', 'Next 14 days: school days are filled, the projected finish day is flagged.');
      for (const day of timeline(workspace, schedule, today)) {
        const cell = el('span', `tl-day${day.school ? ' school' : ''}${day.finish ? ' finish' : ''}`, day.finish ? '\uD83C\uDFC1' : WEEKDAY_NAMES[new Date(`${day.date}T00:00`).getDay()][0]);
        strip.append(cell);
      }
      box.append(strip);
    }
    body.append(box);
  }

  function renderBody() {
    const workspace = getWorkspace();
    if (!workspace || !dialog().open) return;
    const subject = workspace.lists.find((list) => list.id === listId);
    if (!subject) { dialog().close(); return; }
    byId('schedule-title').textContent = `Schedule: ${subject.name}`;
    const unit = subject.unit ?? 'lessons';
    const schedule = workspace.schedules.find((entry) => entry.listId === listId);
    const body = byId('schedule-body');
    body.replaceChildren();
    if (schedule) renderResult(body, workspace, schedule);
    const draft = schedule ?? defaultSchedule(listId, localDate());
    const form = el('form', 'schedule-form');
    const total = input('number', draft.total, { min: 1, step: 1 });
    const done = input('number', draft.startDone, { min: 0, step: 1 });
    const start = input('date', draft.startDate);
    const goal = input('date', draft.goalDate ?? '');
    const end = input('date', draft.endDate ?? '');
    form.append(
      field(`Total ${unit}`, total, 'sch-total'),
      field(`${unit[0].toUpperCase()}${unit.slice(1)} already done before the start date`, done, 'sch-done'),
      field('Start date', start, 'sch-start'),
    );
    const paceBox = el('fieldset', 'pace-grid');
    paceBox.append(el('legend', '', `${unit} per day (0 = not a school day)`));
    const paces = WEEKDAY_NAMES.map((name, index) => {
      const node = input('number', draft.pace[index], { min: 0, step: 0.25 });
      paceBox.append(field(name, node, `sch-pace-${index}`));
      return node;
    });
    form.append(paceBox, field('Goal finish date (optional)', goal, 'sch-goal'), field('School year ends (optional)', end, 'sch-end'));
    const save = el('button', 'primary', schedule ? 'Save schedule' : 'Create schedule');
    save.type = 'submit';
    form.append(save);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const next = {
        listId, total: Number(total.value), startDone: Number(done.value), startDate: start.value,
        pace: paces.map((node) => Number(node.value)), goalDate: goal.value || null, endDate: end.value || null,
      };
      const ok = apply((ws) => ({
        ...ws, schedules: [...ws.schedules.filter((entry) => entry.listId !== listId), next],
      }), 'Schedule saved.');
      if (ok) {
        const result = forecast(getWorkspace(), next, localDate());
        if (result.finished) announce(`\uD83C\uDF89 You finished ${subject.name}! Amazing work.`);
        renderBody();
      }
    });
    body.append(form);
    if (schedule) {
      const actions = el('div', 'dialog-actions');
      const positive = schedule.pace.filter((amount) => amount > 0);
      const average = Math.max(1, Math.round(positive.reduce((sum, amount) => sum + amount, 0) / positive.length));
      const target = el('button', 'secondary', `Use ${average} per day as today's target`);
      target.type = 'button';
      target.addEventListener('click', () => apply((ws) => setSubjectTarget(ws, listId, { units: average, unit: subject.unit ?? '' }, localDate()), 'Daily target updated.'));
      const remove = el('button', 'danger', 'Remove schedule');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        apply((ws) => ({ ...ws, schedules: ws.schedules.filter((entry) => entry.listId !== listId) }), 'Schedule removed.');
        renderBody();
      });
      actions.append(target, remove);
      body.append(actions);
    }
  }

  function renderBreaks() {
    const workspace = getWorkspace();
    const box = byId('breaks');
    box.hidden = byId('calendar').hidden;
    if (!workspace || box.hidden) return;
    const focused = document.activeElement?.id;
    box.replaceChildren(el('h3', '', 'Breaks (no school for every subject)'));
    const list = el('ul', 'break-list');
    for (const entry of workspace.school.breaks) {
      const item = el('li', '', `${entry.label || 'Break'}: ${entry.from} to ${entry.to}`);
      const remove = el('button', 'danger', 'Remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove break ${entry.label || entry.from}`);
      remove.addEventListener('click', () => apply((ws) => ({
        ...ws, school: { ...ws.school, breaks: ws.school.breaks.filter((b) => b.id !== entry.id) },
      }), 'Break removed.'));
      item.append(remove);
      list.append(item);
    }
    if (!workspace.school.breaks.length) list.append(el('li', '', 'No breaks yet.'));
    const form = el('form', 'break-form');
    const label = input('text', '', { maxLength: 60, placeholder: 'e.g. Spring break' });
    const from = input('date', '');
    const to = input('date', '');
    const add = el('button', 'secondary', 'Add break');
    add.type = 'submit';
    form.append(field('Name', label, 'break-label'), field('From', from, 'break-from'), field('To', to, 'break-to'), add);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      apply((ws) => ({
        ...ws, school: { ...ws.school, breaks: [...ws.school.breaks, {
          id: crypto.randomUUID(), from: from.value, to: to.value || from.value, label: label.value,
        }] },
      }), 'Break added.');
    });
    box.append(list, form);
    if (focused) byId(focused)?.focus();
  }

  byId('schedule-close').addEventListener('click', () => dialog().close());

  return {
    open(id) {
      listId = id;
      byId('schedule-error').hidden = true;
      if (!dialog().open) dialog().showModal();
      renderBody();
      byId('sch-total')?.focus();
    },
    render() { renderBody(); renderBreaks(); },
  };
}
