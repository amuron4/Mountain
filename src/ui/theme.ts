import type { ThemeSetting } from '../domain/types';

const KEY = 'yama-note-theme';

export function applyTheme(setting: ThemeSetting) {
  try {
    localStorage.setItem(KEY, setting);
  } catch {
    /* noop */
  }
  const dark = setting === 'dark' || (setting === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111613' : '#2f6b4f');
}

export function watchSystemTheme(getSetting: () => ThemeSetting): () => void {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => getSetting() === 'auto' && applyTheme('auto');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
