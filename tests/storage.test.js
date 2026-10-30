import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace, addTask } from '../src/model.js';
import {
  STORAGE_KEY, loadWorkspace, saveWorkspace, parseBackup, serializeWorkspace,
} from '../src/storage.js';

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem(key) { assert.equal(key, STORAGE_KEY); return value; },
    setItem(key, next) { assert.equal(key, STORAGE_KEY); value = next; },
  };
}

test('saved tasks and exported backups round-trip without losing details', () => {
  const storage = memoryStorage();
  assert.deepEqual(loadWorkspace(storage), createWorkspace());
  const workspace = addTask(createWorkspace(), { title: 'Read', description: 'Chapter 1', dueDate: '2026-10-24' });
  saveWorkspace(storage, workspace);
  assert.deepEqual(loadWorkspace(storage), workspace);
  assert.deepEqual(parseBackup(serializeWorkspace(workspace)), workspace);
  assert.deepEqual(parseBackup(`\uFEFF${serializeWorkspace(workspace)}`), workspace);
});

test('corrupt storage is reported without being replaced or silently reset', () => {
  for (const text of ['{broken', '{"version":99}', 'null']) {
    const storage = memoryStorage(text);
    assert.throws(() => loadWorkspace(storage), /has not been overwritten/);
    assert.equal(storage.getItem(STORAGE_KEY), text);
  }
});

test('failed writes and unavailable storage surface actionable errors and preserve prior data', () => {
  const original = serializeWorkspace(createWorkspace());
  let value = original;
  const storage = {
    getItem() { return value; },
    setItem() { throw new Error('Quota exceeded'); },
  };
  assert.throws(() => saveWorkspace(storage, addTask(createWorkspace(), { title: 'Unsaved' })), /Could not save/);
  assert.equal(value, original);
  assert.throws(() => loadWorkspace({ getItem() { throw new Error('Access denied'); } }), /storage is unavailable/);
});

test('invalid backups do not reach persistence', () => {
  let writes = 0;
  const storage = { setItem() { writes++; } };
  assert.throws(() => saveWorkspace(storage, { version: 1, lists: [], tasks: [] }), /Inbox/);
  assert.equal(writes, 0);
  assert.throws(() => parseBackup('not JSON'), /Invalid JSON/);
});
