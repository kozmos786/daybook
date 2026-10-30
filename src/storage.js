import { createWorkspace, validateWorkspace } from './model.js';

export const STORAGE_KEY = 'personal-task-planner.workspace.v1';

export function parseBackup(text) {
  let value;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error('Invalid JSON. Choose a task planner JSON backup.', { cause: error });
  }
  return validateWorkspace(value);
}

export function loadWorkspace(storage) {
  let text;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch (error) {
    throw new Error('Browser storage is unavailable. Allow site storage and reload; no data was changed.', { cause: error });
  }
  if (text === null) return createWorkspace();
  try {
    return parseBackup(text);
  } catch (error) {
    throw new Error(`Saved data could not be loaded. It has not been overwritten. Import a valid JSON backup to recover. ${error.message}`, { cause: error });
  }
}

export function serializeWorkspace(workspace) {
  return JSON.stringify(validateWorkspace(workspace), null, 2);
}

export function saveWorkspace(storage, workspace) {
  const text = serializeWorkspace(workspace);
  try {
    storage.setItem(STORAGE_KEY, text);
  } catch (error) {
    throw new Error('Could not save changes. Browser storage may be full or blocked. Your previous saved data is unchanged; export a backup and check storage permissions.', { cause: error });
  }
}
