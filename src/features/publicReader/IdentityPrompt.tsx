import { useState, type FormEvent } from 'react';

interface Props {
  initialName?: string;
  onSubmit: (name: string) => void;
}

export function IdentityPrompt({ initialName, onSubmit }: Props) {
  const [name, setName] = useState(initialName ?? '');
  const trimmed = name.trim();

  function handle(e: FormEvent) {
    e.preventDefault();
    if (!trimmed) return;
    onSubmit(trimmed.slice(0, 60));
  }

  return (
    <div className="reader-modal-backdrop" data-testid="reader-identity-prompt">
      <form className="reader-modal" onSubmit={handle}>
        <h2>Welcome — what name should we use?</h2>
        <p style={{ color: 'var(--reader-fg-muted)', fontSize: '0.85rem', margin: '0 0 12px' }}>
          The author will see this name next to your reactions and comments.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={60}
          data-testid="reader-identity-input"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            type="submit"
            className="reader-btn reader-btn-primary"
            disabled={!trimmed}
            data-testid="reader-identity-submit"
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}
