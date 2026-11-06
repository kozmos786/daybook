import { MENU } from './extras.js';
import { targetOn } from './school.js';

export const BEANS_PER_SUBJECT = 1;
export const BEANS_ALL_MET = 3;
export const BEANS_VISIT = 1;

// Beans are derived from the logs, so lowering a day's log takes its beans back.
export function earnedBeans(workspace) {
  const dates = [...new Set(workspace.school.logs.map((log) => log.date))];
  let total = 0;
  for (const date of dates) {
    let counted = 0;
    let met = 0;
    for (const list of workspace.lists) {
      const target = targetOn(list, date);
      if (!target) continue;
      if (workspace.school.daysOff.some((entry) => entry.listId === list.id && entry.date === date)) continue;
      counted += 1;
      const logged = workspace.school.logs.find((log) => log.listId === list.id && log.date === date)?.units ?? 0;
      if (logged >= target) met += 1;
    }
    total += met * BEANS_PER_SUBJECT;
    if (counted > 0 && met === counted) total += BEANS_ALL_MET;
  }
  return total;
}

export function spentBeans(cafe) {
  return cafe.purchases.reduce((sum, id) => sum + (MENU.find((item) => item.id === id)?.cost ?? 0), 0);
}

export function beanBalance(workspace) {
  const earned = earnedBeans(workspace) + workspace.cafe.visits.length * BEANS_VISIT;
  return Math.max(0, earned - spentBeans(workspace.cafe));
}

export function visit(workspace, today) {
  if (workspace.cafe.visits.includes(today)) return workspace;
  return { ...workspace, cafe: { ...workspace.cafe, visits: [...workspace.cafe.visits, today].sort() } };
}

export function buy(workspace, id) {
  const item = MENU.find((entry) => entry.id === id);
  if (!item) throw new Error('That item is not on the menu.');
  if (item.kind === 'decor' && workspace.cafe.purchases.includes(id)) throw new Error('You already own that decoration.');
  const balance = beanBalance(workspace);
  if (balance < item.cost) {
    const need = item.cost - balance;
    throw new Error(`You need ${need} more ${need === 1 ? 'bean' : 'beans'} for the ${item.label}.`);
  }
  return { ...workspace, cafe: { ...workspace.cafe, purchases: [...workspace.cafe.purchases, id] } };
}

export function setCozy(workspace, cozy) {
  return { ...workspace, cafe: { ...workspace.cafe, cozy } };
}

export function favourite(cafe) {
  const counts = new Map();
  for (const id of cafe.purchases) {
    if (MENU.find((item) => item.id === id)?.kind === 'decor') continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return top ? MENU.find((item) => item.id === top[0]) : null;
}

export function greeting(hour, usual) {
  const base = hour < 5 ? 'Burning the midnight oil?' : hour < 12 ? 'Good morning!' : hour < 17 ? 'Good afternoon!' : hour < 21 ? 'Good evening!' : 'Cozy night, huh?';
  return usual ? `${base} The usual ${usual.label.toLowerCase()}?` : `${base} What can I get you?`;
}
