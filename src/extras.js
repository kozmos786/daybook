import { isCalendarDate } from './dates.js';

export const WIDGETS = [
  'today', 'reminders', 'subjects', 'upcoming', 'grades', 'schedule', 'daysoff',
  'calendar', 'quickadd', 'tasks', 'log', 'cafe', 'verse',
];
export const SIZES = ['small', 'wide', 'tall'];
export const DEFAULT_SIZES = {
  today: 'wide', reminders: 'small', subjects: 'wide', upcoming: 'small', grades: 'small', schedule: 'wide',
  daysoff: 'small', calendar: 'tall', quickadd: 'small', tasks: 'tall', log: 'small', cafe: 'small', verse: 'wide',
};
export const COSMETICS = ['plant', 'lamp', 'frame', 'cat', 'books', 'neon'];
export const MENU = [
  { id: 'coffee', label: 'Coffee', icon: '☕', cost: 2, kind: 'drink' },
  { id: 'tea', label: 'Tea', icon: '🍵', cost: 2, kind: 'drink' },
  { id: 'cocoa', label: 'Hot cocoa', icon: '🍫', cost: 3, kind: 'drink' },
  { id: 'latte', label: 'Latte', icon: '🥛', cost: 4, kind: 'drink' },
  { id: 'cookie', label: 'Cookie', icon: '🍪', cost: 3, kind: 'pastry' },
  { id: 'muffin', label: 'Muffin', icon: '🧁', cost: 4, kind: 'pastry' },
  { id: 'croissant', label: 'Croissant', icon: '🥐', cost: 5, kind: 'pastry' },
  { id: 'plant', label: 'Plant', icon: '🪴', cost: 10, kind: 'decor' },
  { id: 'lamp', label: 'Lamp', icon: '🏮', cost: 15, kind: 'decor' },
  { id: 'frame', label: 'Picture', icon: '🖼️', cost: 20, kind: 'decor' },
  { id: 'cat', label: 'Cafe cat', icon: '🐈', cost: 25, kind: 'decor' },
  { id: 'books', label: 'Books', icon: '📚', cost: 15, kind: 'decor' },
  { id: 'neon', label: 'Neon sign', icon: '✨', cost: 30, kind: 'decor' },
];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function emptyHub() {
  return { layout: WIDGETS.map((id) => ({ id, visible: true, size: DEFAULT_SIZES[id] })) };
}

export function validateHub(value) {
  if (value === undefined) return emptyHub();
  if (!isRecord(value) || !Array.isArray(value.layout)) throw new Error('The Home layout is invalid.');
  const seen = new Set();
  const layout = [];
  for (const item of value.layout) {
    if (!isRecord(item) || !WIDGETS.includes(item.id) || seen.has(item.id) || typeof item.visible !== 'boolean' ||
        !SIZES.includes(item.size)) {
      throw new Error('The Home layout has an unknown or repeated widget.');
    }
    seen.add(item.id);
    layout.push({ id: item.id, visible: item.visible, size: item.size });
  }
  for (const id of WIDGETS) if (!seen.has(id)) layout.push({ id, visible: true, size: DEFAULT_SIZES[id] });
  return { layout };
}

export function emptyVerses() {
  return { list: null, pinned: null, shuffle: null };
}

export function validateVerses(value) {
  if (value === undefined) return emptyVerses();
  if (!isRecord(value)) throw new Error('Verse data is invalid.');
  let list = null;
  if (value.list !== null && value.list !== undefined) {
    if (!Array.isArray(value.list) || value.list.length > 1000) throw new Error('The verse list is invalid.');
    const ids = new Set();
    list = value.list.map((verse) => {
      if (!isRecord(verse) || typeof verse.id !== 'string' || !verse.id || ids.has(verse.id) ||
          typeof verse.ref !== 'string' || !verse.ref.trim() || verse.ref.length > 60 ||
          typeof verse.text !== 'string' || !verse.text.trim() || verse.text.length > 1000) {
        throw new Error('A verse needs a unique ID, a reference, and its text.');
      }
      ids.add(verse.id);
      return { id: verse.id, ref: verse.ref.trim(), text: verse.text.trim() };
    });
  }
  const pinned = typeof value.pinned === 'string' ? value.pinned : null;
  let shuffle = null;
  if (isRecord(value.shuffle) && isCalendarDate(value.shuffle.date) && typeof value.shuffle.id === 'string') {
    shuffle = { date: value.shuffle.date, id: value.shuffle.id };
  }
  return { list, pinned, shuffle };
}

export function emptyCafe() {
  return { visits: [], purchases: [], cozy: false };
}

export function validateCafe(value) {
  if (value === undefined) return emptyCafe();
  if (!isRecord(value) || !Array.isArray(value.visits ?? []) || !Array.isArray(value.purchases ?? [])) {
    throw new Error('Break room data is invalid.');
  }
  const visits = [...new Set((value.visits ?? []).filter(isCalendarDate))].sort();
  const known = new Set(MENU.map((item) => item.id));
  const purchases = (value.purchases ?? []).map((id) => {
    if (!known.has(id)) throw new Error('The break room has an unknown menu item.');
    return id;
  });
  const decor = purchases.filter((id) => MENU.find((item) => item.id === id).kind === 'decor');
  if (new Set(decor).size !== decor.length) throw new Error('Each decoration can only be bought once.');
  return { visits, purchases, cozy: value.cozy === true };
}
