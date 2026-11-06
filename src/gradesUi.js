import { localDate } from './dates.js';
import { validateWorkspace } from './model.js';
import {
  CATEGORIES, DEFAULT_WEIGHTS, TERMS, addGrade, bestAndWorst, deleteGrade, letterFor, modeFor, overallGpa,
  setGradeSettings, subjectAverage, subjectEntries, subjectSummary, termOf, trendPoints, updateGrade, whatIf, round1, entryPercent,
} from './grades.js';

const byId = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function field(labelText, input) {
  const wrap = el('div', 'field');
  const label = el('label', '', labelText);
  input.id ||= `g-${labelText.toLowerCase().replace(/\W+/g, '-')}`;
  label.htmlFor = input.id;
  wrap.append(label, input);
  return wrap;
}

function numberInput(value, step = 'any') {
  const input = el('input');
  input.type = 'number';
  input.min = '0';
  input.step = step;
  input.value = value;
  return input;
}

export function drawTrend(canvas, points) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const ink = getComputedStyle(document.body).color || '#333';
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.25;
  ctx.strokeRect(30, 8, width - 40, height - 24);
  ctx.globalAlpha = 1;
  ctx.font = '11px sans-serif';
  ctx.fillText('100', 4, 16);
  ctx.fillText('0', 14, height - 10);
  if (points.length < 2) return;
  const low = Math.max(0, Math.floor(Math.min(...points.map((p) => p.percent)) / 10) * 10 - 10);
  const x = (i) => 30 + (i / (points.length - 1)) * (width - 50) + 5;
  const y = (v) => 8 + (1 - (v - low) / (100 - low)) * (height - 24);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#d6709a';
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p.percent)) : ctx.moveTo(x(i), y(p.percent))));
  ctx.stroke();
  ctx.fillStyle = '#d6709a';
  points.forEach((p, i) => { ctx.beginPath(); ctx.arc(x(i), y(p.percent), 3, 0, Math.PI * 2); ctx.fill(); });
}

function trendSummary(points) {
  if (points.length < 2) return 'Add a couple of grades to see a trend.';
  const change = round1(points.at(-1).percent - points[0].percent);
  if (Math.abs(change) < 0.5) return `Your average has held steady around ${points.at(-1).percent}%.`;
  return `Your average went ${change > 0 ? 'up' : 'down'} ${Math.abs(change)} points, from ${points[0].percent}% to ${points.at(-1).percent}%.`;
}

export function reportRows(workspace, term = 0) {
  return workspace.lists.map((list) => ({ list, summary: subjectSummary(workspace.grades, list.id, term) }))
    .filter((row) => row.summary);
}

export function createGradesUi({ getWorkspace, commit, confirmAction, showError, announce, refresh }) {
  let listId = '';
  let filter = '';
  let editingId = null;
  let prefill = '';
  let note = '';

  const dialog = () => byId('grades-dialog');

  function run(change, message) {
    try {
      commit(validateWorkspace(change(getWorkspace())));
      refresh();
      if (message) announce(message);
    } catch (error) {
      byId('grades-error').textContent = error.message;
      byId('grades-error').hidden = false;
      showError(error);
    }
  }

  function renderForm(body, workspace) {
    const entry = editingId ? workspace.grades.entries.find((item) => item.id === editingId) : null;
    const form = el('form', 'grade-form');
    const name = el('input');
    name.id = 'grade-name';
    name.maxLength = 80;
    name.value = entry?.name ?? prefill;
    name.required = true;
    const earned = numberInput(entry?.earned ?? '');
    earned.id = 'grade-earned';
    earned.required = true;
    const possible = numberInput(entry?.possible ?? '100');
    possible.id = 'grade-possible';
    possible.required = true;
    const date = el('input');
    date.type = 'date';
    date.id = 'grade-date';
    date.value = entry?.date ?? localDate();
    const category = el('select');
    category.id = 'grade-category';
    for (const name of CATEGORIES) category.append(new Option(name, name));
    category.value = entry?.category ?? 'Homework';
    const submit = el('button', 'primary', entry ? 'Save changes' : '+ Add grade');
    submit.type = 'submit';
    form.append(field('Name', name), field('Earned', earned), field('Out of', possible), field('Date', date), field('Category', category), submit);
    if (entry) {
      const cancel = el('button', 'secondary', 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', () => { editingId = null; render(); });
      form.append(cancel);
    }
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = {
        name: name.value, earned: earned.value, possible: possible.value, date: date.value, category: category.value,
      };
      const before = subjectAverage(workspace.grades, listId);
      const editing = editingId;
      editingId = null;
      prefill = '';
      try {
        const next = validateWorkspace(editing ? updateGrade(workspace, editing, values) : addGrade(workspace, { ...values, listId }));
        const after = subjectAverage(next.grades, listId);
        note = before !== null && after !== null && before - after >= 5
          ? `Heads up: this grade dropped your average by ${round1(before - after)} points.` : '';
        commit(next);
        refresh();
        render();
        announce('Grade saved.');
        byId('grade-name').focus();
      } catch (error) {
        editingId = editing;
        byId('grades-error').textContent = error.message;
        byId('grades-error').hidden = false;
      }
    });
    body.append(form);
  }

  function renderSettings(body, workspace) {
    const details = el('details', 'grade-settings');
    details.append(el('summary', '', 'Grading settings'));
    const mode = el('select');
    mode.id = 'grade-mode';
    mode.append(new Option('Weighted by category', 'weighted'), new Option('Simple points average', 'simple'));
    mode.value = modeFor(workspace.grades, listId);
    mode.addEventListener('change', () => run((ws) => setGradeSettings(ws, listId, { mode: mode.value }), 'Grading mode changed.'));
    details.append(field('How to average', mode));
    const current = { ...DEFAULT_WEIGHTS, ...(workspace.grades.settings[listId]?.weights ?? {}) };
    const weights = el('div', 'weights');
    const inputs = {};
    for (const category of CATEGORIES) {
      inputs[category] = numberInput(current[category], '1');
      inputs[category].max = '100';
      weights.append(field(`${category} %`, inputs[category]));
    }
    const save = el('button', 'secondary', 'Save weights');
    save.type = 'button';
    save.addEventListener('click', () => run((ws) => setGradeSettings(ws, listId, {
      weights: Object.fromEntries(CATEGORIES.map((category) => [category, Number(inputs[category].value)])),
    }), 'Weights saved.'));
    details.append(weights, save);
    body.append(details);
  }

  function renderWhatIf(body, workspace) {
    const details = el('details', 'what-if');
    details.append(el('summary', '', 'What if I get...'));
    const earned = numberInput('');
    earned.id = 'whatif-earned';
    const possible = numberInput('100');
    possible.id = 'whatif-possible';
    const category = el('select');
    category.id = 'whatif-category';
    for (const name of CATEGORIES) category.append(new Option(name, name));
    const result = el('p', 'what-if-result', 'Enter a score to see the effect.');
    result.setAttribute('aria-live', 'polite');
    const update = () => {
      const e = Number(earned.value);
      const p = Number(possible.value);
      if (earned.value === '' || !(p > 0) || e < 0 || e > p) { result.textContent = 'Enter a score between 0 and the total.'; return; }
      const { before, after } = whatIf(workspace.grades, listId, { earned: e, possible: p, category: category.value, date: localDate() });
      result.textContent = before === null
        ? `That would give you ${round1(after)}% (${letterFor(after)}).`
        : `Your average would go from ${round1(before)}% to ${round1(after)}% (${letterFor(after)}).`;
    };
    for (const node of [earned, possible, category]) node.addEventListener('input', update);
    details.append(field('Earned', earned), field('Out of', possible), field('Category', category), result);
    body.append(details);
  }

  function renderList(body, workspace) {
    const bar = el('div', 'grade-filter');
    const select = el('select');
    select.id = 'grade-filter';
    select.append(new Option('All categories', ''));
    for (const name of CATEGORIES) select.append(new Option(name, name));
    select.value = filter;
    select.addEventListener('change', () => { filter = select.value; render(); });
    bar.append(field('Show', select));
    body.append(bar);
    const entries = subjectEntries(workspace.grades, listId)
      .filter((entry) => !filter || entry.category === filter)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    if (!entries.length) { body.append(el('p', 'school-empty', 'No grades yet. Add your first one above.')); return; }
    const list = el('ul', 'grade-list');
    for (const entry of entries) {
      const percent = round1(entryPercent(entry));
      const item = el('li', `grade-item${entry.dropped ? ' is-dropped' : ''}`);
      item.append(
        el('strong', '', entry.name),
        el('span', 'grade-score', `${entry.earned}/${entry.possible} \u00B7 ${percent}% ${letterFor(percent)}`),
        el('span', 'grade-meta', `${entry.category} \u00B7 ${entry.date} \u00B7 Term ${termOf(workspace.grades, entry.date)}${entry.dropped ? ' \u00B7 dropped' : ''}`),
      );
      const actions = el('div', 'grade-actions');
      for (const [label, handler] of [
        ['Edit', () => { editingId = entry.id; render(); byId('grade-name').focus(); }],
        [entry.dropped ? 'Count it' : 'Drop it', () => run((ws) => updateGrade(ws, entry.id, { dropped: !entry.dropped }), entry.dropped ? 'Grade counts again.' : 'Grade dropped from the average.')],
        ['Delete', async () => {
          if (await confirmAction('Delete grade?', `Delete "${entry.name}"? This cannot be undone.`, 'Delete grade')) run((ws) => deleteGrade(ws, entry.id), 'Grade deleted.');
        }],
      ]) {
        const button = el('button', label === 'Delete' ? 'danger' : 'secondary', label);
        button.type = 'button';
        button.setAttribute('aria-label', `${label} ${entry.name}`);
        button.addEventListener('click', handler);
        actions.append(button);
      }
      item.append(actions);
      list.append(item);
    }
    body.append(list);
  }

  function render() {
    const workspace = getWorkspace();
    if (!workspace || !dialog().open) return;
    const subject = workspace.lists.find((list) => list.id === listId);
    if (!subject) { dialog().close(); return; }
    byId('grades-title').textContent = `Grades: ${subject.name}`;
    byId('grades-error').hidden = true;
    const body = byId('grades-body');
    body.replaceChildren();
    const summary = subjectSummary(workspace.grades, listId);
    const head = el('div', 'grade-summary');
    head.append(el('strong', summary ? `grade-big grade-${summary.tone}` : 'grade-big', summary ? `${summary.percent}% ${summary.letter}` : 'No grades yet'));
    const terms = [];
    for (let term = 1; term <= TERMS; term += 1) {
      const termSummary = subjectSummary(workspace.grades, listId, term);
      if (termSummary) terms.push(`Q${term}: ${termSummary.percent}% ${termSummary.letter}`);
    }
    if (terms.length) head.append(el('span', '', terms.join(' \u00B7 ')));
    body.append(head);
    if (note) body.append(el('p', 'school-note', note));
    renderForm(body, workspace);
    const points = trendPoints(workspace.grades, listId);
    const canvas = el('canvas', 'trend');
    canvas.width = 480;
    canvas.height = 120;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', trendSummary(points));
    body.append(canvas, el('p', 'trend-text', trendSummary(points)));
    drawTrend(canvas, points);
    renderWhatIf(body, workspace);
    renderSettings(body, workspace);
    renderList(body, workspace);
  }

  function reportCanvas(workspace) {
    const rows = reportRows(workspace);
    const canvas = el('canvas');
    canvas.width = 640;
    canvas.height = 120 + rows.length * 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#222';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('Report card', 20, 36);
    ctx.font = '14px sans-serif';
    ctx.fillText(localDate(), 20, 58);
    ctx.font = 'bold 14px sans-serif';
    ['Subject', 'Q1', 'Q2', 'Q3', 'Q4', 'Year'].forEach((label, i) => ctx.fillText(label, i ? 190 + i * 70 : 20, 90));
    ctx.font = '14px sans-serif';
    rows.forEach((row, index) => {
      const y = 120 + index * 32;
      ctx.fillText(row.list.name, 20, y);
      for (let term = 1; term <= TERMS; term += 1) {
        const value = subjectSummary(workspace.grades, row.list.id, term);
        ctx.fillText(value ? `${value.percent}% ${value.letter}` : '-', 190 + term * 70 - 10, y);
      }
      ctx.fillText(`${row.summary.percent}% ${row.summary.letter}`, 190 + 5 * 70 - 10, y);
    });
    return canvas;
  }

  function renderReport() {
    const workspace = getWorkspace();
    const body = byId('report-body');
    body.replaceChildren();
    const rows = reportRows(workspace);
    if (!rows.length) { body.append(el('p', 'school-empty', 'No grades logged yet.')); return; }
    const table = el('table', 'report-table');
    const head = el('tr');
    for (const label of ['Subject', 'Q1', 'Q2', 'Q3', 'Q4', 'Year']) head.append(el('th', '', label));
    const thead = el('thead');
    thead.append(head);
    const tbody = el('tbody');
    for (const row of rows) {
      const tr = el('tr');
      tr.append(el('th', '', row.list.name));
      for (let term = 1; term <= TERMS; term += 1) {
        const value = subjectSummary(workspace.grades, row.list.id, term);
        tr.append(el('td', value ? `grade-${value.tone}` : '', value ? `${value.percent}% ${value.letter}` : '\u2013'));
      }
      tr.append(el('td', `grade-${row.summary.tone}`, `${row.summary.percent}% ${row.summary.letter}`));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    const gpa = overallGpa(workspace.grades, workspace.lists);
    body.append(table, el('p', 'report-gpa', `GPA (unweighted, 4.0 scale): ${gpa === null ? '\u2013' : gpa.toFixed(2)}`));
  }

  byId('grades-close').addEventListener('click', () => dialog().close());
  dialog().addEventListener('close', () => { editingId = null; filter = ''; note = ''; prefill = ''; });
  byId('report-close').addEventListener('click', () => byId('report-dialog').close());
  byId('report-print').addEventListener('click', () => window.print());
  byId('report-png').addEventListener('click', () => {
    const canvas = reportCanvas(getWorkspace());
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = el('a');
      link.href = url;
      link.download = `report-card-${localDate()}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  });

  return {
    open(id, name = '') {
      listId = id;
      prefill = name;
      editingId = null;
      note = '';
      if (!dialog().open) dialog().showModal();
      render();
      byId('grade-name')?.focus();
    },
    openReport() {
      renderReport();
      if (!byId('report-dialog').open) byId('report-dialog').showModal();
    },
    render() { render(); if (byId('report-dialog').open) renderReport(); },
    summaryFor(workspace) {
      return {
        gpa: overallGpa(workspace.grades, workspace.lists),
        extremes: bestAndWorst(workspace.grades, workspace.lists),
      };
    },
  };
}
