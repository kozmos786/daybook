const pad = (value, width) => String(value).padStart(width, '0');

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function localDate(date = new Date()) {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
}

// setUTCFullYear avoids Date.UTC treating years 0-99 as 1900-1999.
function toUtc(date) {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(0);
  result.setUTCFullYear(year, month - 1, day);
  return result;
}

function format(date) {
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
}

// 0 = Sunday ... 6 = Saturday
export function weekday(date) {
  return toUtc(date).getUTCDay();
}

export function addDays(date, days) {
  const result = toUtc(date);
  result.setUTCDate(result.getUTCDate() + days);
  return format(result);
}

export function daysBetween(from, to) {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

export function monthStart(year, month) {
  return `${pad(year, 4)}-${pad(month, 2)}-01`;
}

export function monthEnd(year, month) {
  const result = new Date(0);
  result.setUTCFullYear(year, month, 0);
  return format(result);
}
