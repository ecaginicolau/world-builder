import { useEffect, useState, type ReactNode } from 'react';
import './reader.css';
import { loadTheme, saveTheme } from './readerIdentity';
import type { ReaderTheme } from './types';

interface Props {
  children: ReactNode;
  bookTitle?: string;
  readerName?: string;
  onChangeName?: () => void;
}

export function ReaderShell({ children, bookTitle, readerName, onChangeName }: Props) {
  const [theme, setTheme] = useState<ReaderTheme>('dark');

  useEffect(() => {
    setTheme(loadTheme());
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    saveTheme(next);
  }

  return (
    <div
      className={`reader-shell ${theme === 'light' ? 'reader-light' : ''}`}
      data-testid="reader-shell"
      data-theme={theme}
    >
      <header className="reader-header">
        <div>
          <strong>{bookTitle ?? '—'}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {readerName ? (
            <span className="reader-meta">
              <button
                type="button"
                className="reader-btn"
                onClick={onChangeName}
                data-testid="reader-change-name"
                title="Change name"
                style={{ padding: '2px 8px', fontSize: '0.8rem' }}
              >
                {readerName}
              </button>
            </span>
          ) : null}
          <button
            type="button"
            className="reader-btn"
            onClick={toggleTheme}
            data-testid="reader-theme-toggle"
            title="Toggle theme"
            style={{ padding: '2px 8px', fontSize: '0.8rem' }}
          >
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
