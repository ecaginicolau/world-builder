import { useEffect, useState } from 'react';
import type { CapturedSelection } from './selectionContext';

interface Props {
  selection: CapturedSelection;
  anchor: { x: number; y: number };
  onSubmit: (body: string) => void;
  onCancel: () => void;
}

export function CommentInput({ selection, anchor, onSubmit, onCancel }: Props) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  function submit() {
    const trimmed = body.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    onSubmit(trimmed);
  }

  const inner = (
    <>
      <div style={{ fontSize: '0.8rem', color: 'var(--reader-fg-muted)', marginBottom: 8 }}>
        Selected: <em>"{truncate(selection.selected_text, 80)}"</em>
      </div>
      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What did you think?"
        maxLength={4000}
        data-testid="reader-comment-textarea"
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          className="reader-btn"
          onClick={onCancel}
          disabled={submitting}
          data-testid="reader-comment-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          className="reader-btn reader-btn-primary"
          onClick={submit}
          disabled={!body.trim() || submitting}
          data-testid="reader-comment-submit"
        >
          {submitting ? 'Saving…' : 'Send'}
        </button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div className="reader-modal-backdrop" data-testid="reader-comment-modal">
        <div className="reader-modal">{inner}</div>
      </div>
    );
  }

  return (
    <div
      className="reader-comment-popover"
      style={{ left: anchor.x, top: anchor.y + 48 }}
      data-testid="reader-comment-popover"
    >
      {inner}
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
