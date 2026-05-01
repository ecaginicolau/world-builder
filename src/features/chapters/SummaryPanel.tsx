import { useEffect, useState } from 'react';
import type { Chapter } from './types';
import type { SummaryLength } from '@/lib/llm/summaries';
import { useConfirm } from '@/lib/useConfirm';

interface Props {
  chapter: Chapter;
  finalText: string;
  generating: SummaryLength | null;
  generateError: string | null;
  onGenerate: (len: SummaryLength) => Promise<void>;
  onSave: (len: SummaryLength, text: string) => Promise<void>;
  savePending: boolean;
  readOnly?: boolean;
}

const LENGTHS: { key: SummaryLength; label: string; hint: string; rows: number }[] = [
  { key: 'S', label: 'S — short', hint: '~2 sentences (50w)', rows: 3 },
  { key: 'M', label: 'M — medium', hint: '~1 paragraph (150w)', rows: 6 },
  { key: 'L', label: 'L — long', hint: '~3-5 paragraphs (400w)', rows: 12 },
];

export function SummaryPanel({
  chapter, finalText, generating, generateError,
  onGenerate, onSave, savePending, readOnly = false,
}: Props) {
  return (
    <div
      className="flex h-full min-h-0 w-full min-w-0 flex-col rounded-md border border-border bg-bg-panel"
      data-testid="summary-panel"
    >
      <header className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        Summaries
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {finalText.trim() === '' ? (
          <p className="text-xs italic text-fg-muted">
            The chapter has no final text yet — write something first, then generate.
          </p>
        ) : null}
        {generateError ? (
          <p className="text-xs text-red-400" data-testid="summary-error">
            {generateError}
          </p>
        ) : null}
        {LENGTHS.map((len) => (
          <SummaryRow
            key={len.key}
            chapter={chapter}
            len={len}
            generating={generating === len.key}
            anyGenerating={generating !== null}
            disabled={readOnly}
            onGenerate={() => onGenerate(len.key)}
            onSave={(text) => onSave(len.key, text)}
            savePending={savePending}
          />
        ))}
      </div>
    </div>
  );
}

function SummaryRow({
  chapter, len, generating, anyGenerating, disabled, onGenerate, onSave, savePending,
}: {
  chapter: Chapter;
  len: { key: SummaryLength; label: string; hint: string; rows: number };
  generating: boolean;
  anyGenerating: boolean;
  disabled: boolean;
  onGenerate: () => Promise<void>;
  onSave: (text: string) => Promise<void>;
  savePending: boolean;
}) {
  const stored = chapterField(chapter, len.key);
  const [text, setText] = useState<string>(stored ?? '');
  const confirm = useConfirm();

  useEffect(() => {
    setText(stored ?? '');
  }, [stored, chapter.id]);

  const dirty = (text ?? '') !== (stored ?? '');

  async function tryGenerate() {
    if (text.trim() && stored && stored.trim()) {
      const ok = await confirm({
        title: `Replace existing ${len.key} summary?`,
        message: 'Generating will overwrite the current summary in this textarea (you can still edit before saving).',
        danger: false,
        confirmLabel: 'Generate',
      });
      if (!ok) return;
    }
    await onGenerate();
  }

  return (
    <div className="space-y-1" data-testid={`summary-row-${len.key}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <span className="text-sm font-semibold">{len.label}</span>
          <span className="ml-2 text-xs text-fg-muted">{len.hint}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled || anyGenerating}
            onClick={() => void tryGenerate()}
            className="bg-bg-subtle px-2 py-0.5 text-xs hover:bg-bg disabled:opacity-50"
            data-testid={`summary-generate-${len.key}`}
          >
            {generating ? '⟳ Generating…' : 'Generate'}
          </button>
          <button
            type="button"
            disabled={disabled || !dirty || savePending}
            onClick={() => void onSave(text)}
            className="bg-accent px-2 py-0.5 text-xs font-medium text-accent-fg disabled:opacity-50"
            data-testid={`summary-save-${len.key}`}
          >
            {savePending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={len.rows}
        cols={1}
        disabled={disabled || generating}
        placeholder={disabled ? 'Read-only (chapter is published)' : 'Empty — click Generate or type manually.'}
        className="w-full px-2 py-1 text-sm disabled:opacity-50"
        data-testid={`summary-textarea-${len.key}`}
      />
    </div>
  );
}

function chapterField(c: Chapter, len: SummaryLength): string | null {
  switch (len) {
    case 'S': return c.summary_s;
    case 'M': return c.summary_m;
    case 'L': return c.summary_l;
  }
}
