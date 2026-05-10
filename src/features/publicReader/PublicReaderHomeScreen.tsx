import { useEffect, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { ReaderShell } from './ReaderShell';
import { IdentityPrompt } from './IdentityPrompt';
import { useReaderIdentity } from './useReaderIdentity';
import { registerSession, resolveLink, type ResolvedLinkPayload } from './publicReaderClient';

export function PublicReaderHomeScreen() {
  const { token } = useParams({ from: '/r/$token' });
  const { identity, hydrated, setName } = useReaderIdentity(token);
  const [data, setData] = useState<ResolvedLinkPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askName, setAskName] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    resolveLink(token)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.code ?? 'unknown');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Once we have an identity + a valid link, ping register_session to bump
  // last_seen_at and ensure the row exists. Idempotent.
  useEffect(() => {
    if (!data || !identity) return;
    void registerSession({
      token,
      readerLocalId: identity.reader_local_id,
      name: identity.name,
    }).catch(() => {
      // non-fatal
    });
  }, [data, identity, token]);

  if (error) {
    return (
      <ReaderShell>
        <div className="reader-error" data-testid="reader-link-error">
          <h2>This link can't be opened</h2>
          <p style={{ color: 'var(--reader-fg-muted)' }}>
            It may have been deactivated, expired, or never existed.
          </p>
        </div>
      </ReaderShell>
    );
  }

  if (!data) {
    return (
      <ReaderShell>
        <div className="reader-toc">
          <p style={{ color: 'var(--reader-fg-muted)' }}>Loading…</p>
        </div>
      </ReaderShell>
    );
  }

  if (hydrated && !identity) {
    return (
      <ReaderShell bookTitle={data.book.title}>
        <IdentityPrompt onSubmit={setName} />
      </ReaderShell>
    );
  }

  if (askName) {
    return (
      <ReaderShell bookTitle={data.book.title} readerName={identity?.name}>
        <IdentityPrompt
          initialName={identity?.name}
          onSubmit={(n) => {
            setName(n);
            setAskName(false);
          }}
        />
      </ReaderShell>
    );
  }

  const preface = data.chapters.find((c) => c.is_preface) ?? null;
  const partsWithChapters = data.parts.map((p) => ({
    ...p,
    chapters: data.chapters.filter((c) => !c.is_preface && c.part_id === p.id),
  }));

  return (
    <ReaderShell
      bookTitle={data.book.title}
      readerName={identity?.name}
      onChangeName={() => setAskName(true)}
    >
      <div className="reader-toc" data-testid="reader-toc">
        <h1>{data.book.title}</h1>
        {data.book.description ? (
          <p style={{ color: 'var(--reader-fg-muted)', fontStyle: 'italic' }}>
            {data.book.description}
          </p>
        ) : null}
        {preface ? (
          <section data-testid="reader-toc-preface">
            <h2>Preface</h2>
            <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
              <li>
                <Link
                  to="/r/$token/c/$chapterId"
                  params={{ token, chapterId: preface.id }}
                  className="reader-link"
                  data-testid="reader-toc-preface-link"
                >
                  {preface.title?.trim() || 'Preface'}
                </Link>
                {preface.status === 'draft' ? (
                  <span className="reader-draft-badge" title="Not yet published">
                    DRAFT
                  </span>
                ) : null}
              </li>
            </ul>
          </section>
        ) : null}
        {partsWithChapters.length === 0 && !preface ? (
          <p style={{ color: 'var(--reader-fg-muted)' }}>No chapters available yet.</p>
        ) : (
          partsWithChapters.map((p) => (
            <section key={p.id}>
              {p.title ? <h2>{p.title}</h2> : null}
              {p.chapters.length === 0 ? (
                <p
                  style={{
                    color: 'var(--reader-fg-muted)',
                    fontStyle: 'italic',
                    fontSize: '0.85rem',
                  }}
                >
                  (no chapters in this part)
                </p>
              ) : (
                <ol>
                  {p.chapters.map((c, i) => (
                    <li key={c.id}>
                      <Link
                        to="/r/$token/c/$chapterId"
                        params={{ token, chapterId: c.id }}
                        className="reader-link"
                        data-testid={`reader-toc-chapter-${i}`}
                      >
                        {c.title?.trim() || '(untitled chapter)'}
                      </Link>
                      {c.status === 'draft' ? (
                        <span className="reader-draft-badge" title="Not yet published">
                          DRAFT
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))
        )}
        <div className="reader-footer">
          <span>
            {partsWithChapters.reduce((acc, p) => acc + p.chapters.length, 0) +
              (preface ? 1 : 0)}{' '}
            chapters
          </span>
          <span>Reading as {identity?.name}</span>
        </div>
      </div>
    </ReaderShell>
  );
}
