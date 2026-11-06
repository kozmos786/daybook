const SECTIONS = {
  home: () => document.getElementById('home'),
  planner: () => document.querySelector('.app'),
  games: () => document.getElementById('games'),
  cafe: () => document.getElementById('cafe'),
};

export function initTabs(hooks = {}, first = 'home') {
  let current = null;

  function show(name) {
    if (!SECTIONS[name]) return;
    if (current && current !== name) hooks[current]?.leave?.();
    for (const [key, find] of Object.entries(SECTIONS)) {
      find().hidden = key !== name;
      document.getElementById(`tab-${key}`).setAttribute('aria-pressed', String(key === name));
    }
    const changed = current !== name;
    current = name;
    if (changed) hooks[name]?.enter?.();
  }

  for (const key of Object.keys(SECTIONS)) {
    document.getElementById(`tab-${key}`).addEventListener('click', () => show(key));
  }
  show(first);
  return { show, current: () => current };
}
