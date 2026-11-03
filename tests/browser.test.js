import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, readdir, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from '../server.js';
import { createWorkspace, addTask, localDate } from '../src/model.js';
import { STORAGE_KEY, serializeWorkspace } from '../src/storage.js';

const browserPath = process.env.PLANNER_BROWSER || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((path) => existsSync(path));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(read, message) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await read();
    if (result) return result;
    await sleep(50);
  }
  throw new Error(`Timed out: ${message}`);
}

async function connect(url) {
  const socket = new WebSocket(url);
  await once(socket, 'open');
  let nextId = 0;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('Browser connection closed.'));
    }
    pending.clear();
  });
  return {
    exceptions,
    socket,
    send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Browser command timed out: ${method}`));
        }, 15_000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
  };
}

test('real browser: tasks, file imports, recovery, responsive layout, and keyboard controls', {
  skip: browserPath ? false : 'Install Chrome/Edge or set PLANNER_BROWSER to run real-browser checks.',
  timeout: 120_000,
}, async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'daybook-test-'));
  const profile = join(temporary, 'browser');
  const downloads = join(temporary, 'downloads');
  await mkdir(downloads);
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = spawn(browserPath, [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  let client;
  let launchError;
  browser.on('error', (error) => { launchError = error; });
  try {
    const devtools = await until(async () => {
      if (launchError) throw launchError;
      if (browser.exitCode !== null) throw new Error(`Browser exited: ${browser.exitCode}`);
      try {
        return await readFile(join(profile, 'DevToolsActivePort'), 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return null;
      }
    }, 'browser debugging endpoint');
    const [port, endpoint] = devtools.trim().split(/\r?\n/);
    client = await connect(`ws://127.0.0.1:${port}${endpoint}`);
    const { targetId } = await client.send('Target.createTarget', { url: origin });
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => client.send(method, params, sessionId);
    await send('Runtime.enable');
    await send('Page.enable');
    await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', {
        expression, awaitPromise: true, returnByValue: true, userGesture: true,
      });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.result.description);
      return result.result.value;
    };
    const waitFor = (expression) => until(() => evaluate(expression), expression);
    const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const closeDialog = (selector) => evaluate(`new Promise(resolve => {
      document.querySelector('#confirm-dialog').addEventListener('close', () => setTimeout(resolve, 0), { once: true });
      document.querySelector(${JSON.stringify(selector)}).click();
    })`);
    const fill = (selector, value) => evaluate(`document.querySelector(${JSON.stringify(selector)}).value = ${JSON.stringify(value)}`);
    const taskNames = () => evaluate(`[...document.querySelectorAll('.task-name')].map(node => node.textContent)`);
    const stored = () => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}))`);
    const upload = async (path) => {
      const { root } = await send('DOM.getDocument');
      const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#import-file' });
      await send('DOM.setFileInputFiles', { nodeId, files: [path] });
    };
    const reload = async () => {
      await send('Page.reload', { ignoreCache: true });
      await sleep(150);
      await waitFor(`document.readyState === 'complete' && document.querySelector('#task-fields') !== null`);
    };
    await waitFor(`document.querySelector('#task-fields')?.disabled === false && document.querySelector('.list-button') !== null`);
    await t.test('create and edit a task, then reload persisted data', async () => {
      await fill('#task-title', 'Plan the weekend');
      await fill('#task-description', 'Pick one good thing.');
      await fill('#task-due', localDate());
      await click('#save-task');
      assert.deepEqual(await taskNames(), ['Plan the weekend']);
      await click('.task-actions button');
      await fill('#task-title', 'Plan a good weekend');
      await click('#save-task');
      await reload();
      assert.deepEqual(await taskNames(), ['Plan a good weekend']);
      assert.equal((await stored()).tasks[0].description, 'Pick one good thing.');
    });
    await t.test('list deletion preserves tasks and cancellation preserves lists', async () => {
      await fill('#list-name', 'Home');
      await click('#list-form button');
      const listId = (await stored()).lists[1].id;
      await click('#list-navigation button');
      await click('.task-actions button');
      await fill('#task-list', listId);
      await click('#save-task');
      await click('#list-navigation button:last-child');
      await click('#delete-list');
      await closeDialog('#confirm-dialog button[value="cancel"]');
      assert.equal((await stored()).lists.length, 2);
      await click('#delete-list');
      await closeDialog('#confirm-accept');
      await waitFor(`document.querySelector('#status').textContent.includes('List deleted')`);
      assert.equal((await stored()).tasks[0].listId, 'inbox');
      assert.equal((await stored()).lists.length, 1);
    });
    await t.test('failed save keeps stored tasks and unsaved form input', async () => {
      await evaluate(`window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function() { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }`);
      await fill('#task-title', 'Unsaved task');
      await click('#save-task');
      assert.match(await evaluate(`document.querySelector('#error').textContent`), /Could not save/);
      assert.equal((await stored()).tasks.length, 1);
      assert.equal(await evaluate(`document.querySelector('#task-title').value`), 'Unsaved task');
      await click('.task-item > input');
      assert.equal(await evaluate(`document.querySelector('.task-item > input').checked`), false);
      await evaluate(`Storage.prototype.setItem = window.originalSetItem`);
      await fill('#task-title', '');
    });
    await t.test('TXT import appends tasks, safely renders markup, and permits reimporting the same file', async () => {
      const textPath = join(temporary, 'tasks.txt');
      await writeFile(textPath, '\uFEFF Buy groceries \r\n\n<img src=x onerror=alert(1)>\n');
      await upload(textPath);
      await waitFor(`document.querySelector('#status').textContent.includes('Imported 2 tasks')`);
      assert.equal((await stored()).tasks.length, 3);
      assert.ok((await taskNames()).includes('<img src=x onerror=alert(1)>'));
      assert.equal(await evaluate(`document.querySelector('#tasks img') === null`), true);
      await upload(textPath);
      await waitFor(`JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})).tasks.length === 5`);
      const emptyPath = join(temporary, 'empty.txt');
      await writeFile(emptyPath, ' \r\n');
      await upload(emptyPath);
      await waitFor(`!document.querySelector('#error').hidden`);
      assert.match(await evaluate(`document.querySelector('#error').textContent`), /contains no tasks/);
      assert.equal((await stored()).tasks.length, 5);
      const encodedPath = join(temporary, 'wrong-encoding.txt');
      await writeFile(encodedPath, Buffer.from([0xff, 0xfe, 0x41, 0x00]));
      await upload(encodedPath);
      await waitFor(`document.querySelector('#error').textContent.includes('UTF-8')`);
      assert.equal((await stored()).tasks.length, 5);
    });
    await t.test('JSON backup validates before confirmation, can be cancelled, and restores after confirmation', async () => {
      const invalidPath = join(temporary, 'invalid.json');
      await writeFile(invalidPath, '{"version":1,"lists":[],"tasks":[]}');
      await upload(invalidPath);
      await waitFor(`document.querySelector('#error').textContent.includes('Inbox')`);
      assert.equal((await stored()).tasks.length, 5);
      const backupPath = join(temporary, 'backup.json');
      await writeFile(backupPath, serializeWorkspace(addTask(createWorkspace(), { title: 'Restored task' })));
      await upload(backupPath);
      await waitFor(`document.querySelector('#confirm-dialog').open`);
      await closeDialog('#confirm-dialog button[value="cancel"]');
      await waitFor(`!document.querySelector('#import').disabled`);
      assert.equal((await stored()).tasks.length, 5);
      await upload(backupPath);
      await waitFor(`document.querySelector('#confirm-dialog').open`);
      await closeDialog('#confirm-accept');
      await waitFor(`document.querySelector('#status').textContent.includes('Backup imported')`);
      assert.deepEqual(await taskNames(), ['Restored task']);
    });
    await t.test('export downloads a valid complete JSON backup', async () => {
      await click('#export');
      const name = await until(async () => (await readdir(downloads)).find((name) => name.endsWith('.json')), 'backup download');
      const backup = JSON.parse(await readFile(join(downloads, name), 'utf8'));
      assert.equal(backup.tasks[0].title, 'Restored task');
      assert.equal(backup.lists[0].id, 'inbox');
    });
    await t.test('completion, reopening, and task deletion confirmation work', async () => {
      await click('.task-item > input');
      assert.equal((await taskNames()).length, 0);
      await click('#show-completed');
      assert.equal((await taskNames()).length, 1);
      await click('.task-item > input');
      assert.equal((await stored()).tasks[0].completed, false);
      await click('.task-actions .danger');
      await closeDialog('#confirm-dialog button[value="cancel"]');
      assert.equal((await stored()).tasks.length, 1);
      await click('.task-actions .danger');
      await closeDialog('#confirm-accept');
      await waitFor(`document.querySelector('#status').textContent === 'Task deleted.'`);
      assert.equal((await stored()).tasks.length, 0);
    });
    await t.test('focus stays in the list region after selecting a list or completing a task', async () => {
      await click('#show-completed');
      await fill('#task-title', 'Focus one');
      await click('#save-task');
      await fill('#task-title', 'Focus two');
      await click('#save-task');
      await click('#list-navigation button:last-child');
      assert.equal(await evaluate(`document.activeElement.getAttribute('aria-current')`), 'page');
      await click('.task-item > input');
      assert.equal(await evaluate(`document.activeElement.matches('.task-item > input')`), true);
      await click('.task-item > input');
      assert.equal(await evaluate(`document.activeElement.id`), 'show-completed');
    });
    await t.test('corrupt saved data blocks editing without overwriting and supports explicit backup recovery', async () => {
      await evaluate(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, '{broken')`);
      await reload();
      await waitFor(`document.querySelector('#task-fields').disabled`);
      assert.match(await evaluate(`document.querySelector('#error').textContent`), /has not been overwritten/);
      assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`), '{broken');
      await upload(join(temporary, 'backup.json'));
      await waitFor(`document.querySelector('#confirm-dialog').open`);
      await closeDialog('#confirm-accept');
      await waitFor(`document.querySelector('#task-fields').disabled === false`);
      assert.deepEqual(await taskNames(), ['Restored task']);
    });
    await t.test('school: target, quick logging, calendar earning, spending, holiday refund', async () => {
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
      await fill('#list-name', 'Math');
      await click('#list-form button');
      await waitFor(`document.querySelector('#subject-settings').hidden === false`);
      await fill('#target-units', '2');
      await fill('#target-unit', 'pages');
      await click('#subject-settings button[type="submit"]');
      await waitFor(`document.querySelector('#school-today .subject-row') !== null`);
      const logged = () => evaluate(`document.querySelector('#school-today .subject-info > span').textContent`);
      const saved = () => evaluate(`document.querySelector('.subject-saved').textContent`);
      if (/Day off|logged/.test(await logged()) === false) {
        await click('[data-action="plus"]');
        assert.match(await logged(), /1 of 2 pages/);
        await click('[data-action="minus"]');
        assert.match(await logged(), /0 of 2 pages/);
        assert.equal(await evaluate(`document.querySelector('[data-action="minus"]').getAttribute('aria-disabled')`), 'true');
      }
      await click('#toggle-calendar');
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true, 'calendar fits 390px');
      const pick = (expression) => evaluate(`(() => {
        const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const d = new Date(); ${expression}; return iso(d);
      })()`);
      const saturday = await pick(`d.setDate(d.getDate() - 1); while (d.getDay() !== 6) d.setDate(d.getDate() - 1)`);
      const openDay = async (date, back) => {
        for (let i = 0; i < 4 && !(await evaluate(`document.querySelector('[data-date="${date}"]') !== null && document.querySelector('[data-date="${date}"]').closest('td') !== null && !document.querySelector('[data-date="${date}"]').classList.contains('outside')`)); i++) {
          await click(back ? '[data-action="prev-month"]' : '[data-action="next-month"]');
        }
        await click(`.calendar-table [data-date="${date}"]`);
        await waitFor(`document.querySelector('#day-dialog').open`);
      };
      const closeDay = () => evaluate(`new Promise(resolve => {
        document.querySelector('#day-dialog').addEventListener('close', () => setTimeout(resolve, 0), { once: true });
        document.querySelector('#close-day').click();
      })`);
      await openDay(saturday, true);
      await fill(`#day-body input[type="number"]`, '2');
      await click('[data-action="save-log"]');
      await waitFor(`document.querySelector('#day-note').textContent === 'Work saved.'`);
      assert.match(await saved(), /Saved days off: 2/);
      await closeDay();
      await click('[data-action="this-month"]');
      const weekday = await pick(`d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)`);
      await openDay(weekday, false);
      await click('[data-action="spend"]');
      await waitFor(`document.querySelector('#day-note').textContent === 'Day off used.'`);
      assert.match(await saved(), /Saved days off: 1/);
      await click('[data-action="toggle-holiday"]');
      await waitFor(`document.querySelector('#day-note').textContent === 'Holiday added.'`);
      assert.match(await saved(), /Saved days off: 2/);
      await click('[data-action="toggle-holiday"]');
      await waitFor(`document.querySelector('#day-note').textContent === 'Holiday removed.'`);
      assert.match(await saved(), /Saved days off: 1/);
      await closeDay();
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true);
      const school = (await stored()).school;
      assert.equal(school.logs.length, 1);
      assert.equal(school.daysOff.length, 1);
      assert.equal(school.holidays.length, 0);
      await click('#list-navigation button:first-child');
    });
    await t.test('school year guide sets up subjects; assignments can be moved, swapped, and completed', async () => {
      assert.equal(await evaluate(`document.querySelector('#start-year').getAttribute('aria-disabled')`), null);
      await evaluate(`(() => { const g = document.querySelector('#grade'); g.value = '9'; g.dispatchEvent(new Event('change')); })()`);
      assert.match(await evaluate(`document.querySelector('#guide-preview').textContent`), /Algebra 1/);
      await evaluate(`(() => { const g = document.querySelector('#grade'); g.value = '6'; g.dispatchEvent(new Event('change')); })()`);
      await click('#start-year');
      await waitFor(`document.querySelector('#start-year').getAttribute('aria-disabled') === 'true'`);
      const card = `[...document.querySelectorAll('.subject-row')].find(r => r.querySelector('strong').textContent === 'Science')`;
      await waitFor(`${card} !== undefined`);
      await evaluate(`${card}.querySelector('[data-action="done"]').click()`);
      await waitFor(`${card}.querySelector('.subject-info > span').textContent.includes('1 of 1 lesson')`);
      const firstTitle = () => evaluate(`document.querySelector('#upcoming .upcoming-title span').textContent`);
      const before = await firstTitle();
      const id = await evaluate(`document.querySelector('#upcoming [data-action="move"]').dataset.list`);
      await fill(`#move-date-${id}`, '2031-05-05');
      await click(`#upcoming [data-action="move"][data-list="${id}"]`);
      await waitFor(`document.querySelector('#status').textContent === 'Due date changed.'`);
      assert.notEqual(await firstTitle(), before);
      await click('#upcoming [data-action="toggle-all"]');
      assert.match(await evaluate(`document.querySelector('#upcoming').textContent`), /2031-05-05/);
      await evaluate(`document.querySelector('#upcoming [data-action="swap"]').click()`);
      await waitFor(`document.querySelector('#status').textContent === 'Due dates swapped.'`);
      await evaluate(`document.querySelector('#upcoming input[type="checkbox"]').click()`);
      await waitFor(`document.querySelector('#status').textContent === 'Assignment completed.'`);
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true);
    });
    await t.test('board games tab opens games, plays tic-tac-toe, and returns to the planner', async () => {
      assert.equal(await evaluate(`document.querySelector('#games').hidden`), true);
      await click('#tab-games');
      assert.equal(await evaluate(`document.querySelector('.app').hidden`), true);
      await evaluate(`document.querySelector('.ttt-cell').click()`);
      await waitFor(`document.querySelectorAll('.ttt-cell')[0].textContent === 'X' && [...document.querySelectorAll('.ttt-cell')].some(c => c.textContent === 'O')`);
      for (const id of ['chess', 'c4', 'memory', 'snake', 'paint']) {
        await evaluate(`document.querySelector('[data-game="${id}"]').click()`);
        assert.equal(await evaluate(`document.querySelector('#game-stage').children.length > 0`), true, id);
      }
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true);
      await click('#tab-planner');
      assert.equal(await evaluate(`document.querySelector('.app').hidden`), false);
    });
    await t.test('mobile and desktop fit the viewport and controls can be used with a keyboard', async () => {
      for (const width of [390, 1280]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 720 });
        assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true, `width ${width}`);
        if (process.env.PLANNER_SCREENSHOT_DIR) {
          await mkdir(process.env.PLANNER_SCREENSHOT_DIR, { recursive: true });
          const { data } = await send('Page.captureScreenshot', { captureBeyondViewport: true });
          await writeFile(join(process.env.PLANNER_SCREENSHOT_DIR, `daybook-${width}.png`), Buffer.from(data, 'base64'));
        }
      }
      await evaluate(`document.querySelector('#task-title').focus()`);
      await send('Input.insertText', { text: 'Keyboard task' });
      assert.equal(await evaluate(`document.activeElement.id`), 'task-title');
      assert.equal(await evaluate(`document.querySelector('#task-title').value`), 'Keyboard task');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await waitFor(`document.querySelector('#status').textContent.includes('Task added')`);
      assert.ok((await taskNames()).includes('Keyboard task'));
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      assert.equal(await evaluate(`document.activeElement.id`), 'task-description');
    });
    assert.deepEqual(client.exceptions, [], 'No uncaught browser exceptions');
  } finally {
    if (client?.socket.readyState === WebSocket.OPEN) {
      await client.send('Browser.close');
      client.socket.close();
    } else if (browser.exitCode === null && browser.pid) {
      browser.kill();
    }
    if (browser.exitCode === null) await once(browser, 'exit');
    await new Promise((resolve) => server.close(resolve));
    await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});
