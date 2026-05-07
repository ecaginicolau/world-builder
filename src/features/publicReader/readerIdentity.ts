import type { ReaderTheme } from './types';

const IDENTITY_KEY_PREFIX = 'reader:identity:';
const THEME_KEY = 'reader:theme';

export interface ReaderIdentity {
  reader_local_id: string;
  name: string;
}

export function loadIdentity(token: string): ReaderIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY_PREFIX + token);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.reader_local_id === 'string' &&
      typeof parsed.name === 'string' &&
      parsed.reader_local_id.length > 0 &&
      parsed.name.length > 0
    ) {
      return parsed as ReaderIdentity;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveIdentity(token: string, id: ReaderIdentity): void {
  try {
    localStorage.setItem(IDENTITY_KEY_PREFIX + token, JSON.stringify(id));
  } catch {
    // ignore quota errors
  }
}

export function newReaderLocalId(): string {
  // crypto.randomUUID is widely available; fall back to a manual generator.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
}

export function loadTheme(): ReaderTheme {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'dark' || raw === 'light') return raw;
  } catch {
    // ignore
  }
  return 'dark';
}

export function saveTheme(theme: ReaderTheme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}
