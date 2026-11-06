const KEY = 'daybook.theme';
const CHOICES = ['auto', 'light', 'dark'];

export function resolveTheme(choice, prefersDark) {
  if (choice === 'light' || choice === 'dark') return choice;
  return prefersDark ? 'dark' : 'light';
}

export function initTheme(select, storage = window.localStorage, media = window.matchMedia?.('(prefers-color-scheme: dark)')) {
  let choice = 'auto';
  try {
    const saved = storage.getItem(KEY);
    if (CHOICES.includes(saved)) choice = saved;
  } catch {
    // Storage can be unavailable; fall back to Auto.
  }
  const apply = () => {
    document.documentElement.dataset.theme = resolveTheme(choice, Boolean(media?.matches));
    document.documentElement.style.setProperty('color-scheme', document.documentElement.dataset.theme);
  };
  select.value = choice;
  select.addEventListener('change', () => {
    choice = CHOICES.includes(select.value) ? select.value : 'auto';
    try { storage.setItem(KEY, choice); } catch { /* keep the choice for this session only */ }
    apply();
  });
  media?.addEventListener?.('change', apply);
  apply();
}
