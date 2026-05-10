import { useState } from 'react';
import {
  defaultEditionDraft,
  useBookEditions,
  useCreateBookEdition,
  useDeleteBookEdition,
  useUpdateBookEdition,
} from '@/lib/queries/bookEditions';
import { useSession } from '@/features/auth/session';
import { useBook } from '@/lib/queries/books';
import { useConfirm } from '@/lib/useConfirm';
import { FONT_CATALOG_NAMES } from '@/lib/pdfFontCatalog';
import { BookEditionPreview } from './BookEditionPreview';
import type { Align, BookEdition, FooterPosition, HeaderMode } from './types';

interface Props {
  bookId: string;
  worldId: string;
  /** Called when the user clicks "Export PDF" on an edition row. Triggers a
   * file download. */
  onExport: (edition: BookEdition) => void;
  /** Called when the user clicks "Preview PDF" on an edition row. Opens an
   * in-app modal showing the rendered PDF in an iframe — no download. */
  onPreview: (edition: BookEdition) => void;
  exporting: boolean;
}

const TRIM_PRESETS: Array<{ label: string; w: number; h: number }> = [
  { label: '5×8 (poche)', w: 127, h: 203.2 },
  { label: '5.25×8', w: 133.35, h: 203.2 },
  { label: '5.5×8.5', w: 139.7, h: 215.9 },
  { label: '6×9 (trade)', w: 152.4, h: 228.6 },
  { label: 'A5', w: 148, h: 210 },
];

export function BookEditionsPanel({ bookId, worldId, onExport, onPreview, exporting }: Props) {
  const session = useSession();
  const editionsQ = useBookEditions(bookId);
  const createEdition = useCreateBookEdition();
  const [editingId, setEditingId] = useState<string | null>(null);

  function onCreateDefault() {
    if (session.status !== 'authed') return;
    void createEdition.mutateAsync({
      bookId,
      worldId,
      ownerId: session.session.user.id,
      draft: defaultEditionDraft(),
    });
  }

  return (
    <section
      className="rounded-md border border-border bg-bg-panel"
      data-testid="book-editions-panel"
    >
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-medium">Print editions</h2>
        <button
          type="button"
          onClick={onCreateDefault}
          disabled={createEdition.isPending}
          className="text-xs text-fg-muted hover:text-fg disabled:opacity-50"
          data-testid="create-edition-btn"
        >
          + New edition
        </button>
      </header>

      {editionsQ.isLoading ? (
        <p className="px-3 py-3 text-sm text-fg-muted">Loading…</p>
      ) : editionsQ.data && editionsQ.data.length === 0 ? (
        <p className="px-3 py-3 text-sm text-fg-muted">
          No edition yet. Click "New edition" to add a 6×9 default. Each edition is a
          separate PDF layout (trim size, fonts, margins, headers/footers, illustrations).
        </p>
      ) : editionsQ.data ? (
        <ul className="divide-y divide-border" data-testid="editions-list">
          {editionsQ.data.map((e) => (
            <li key={e.id}>
              <EditionRow
                edition={e}
                bookId={bookId}
                isEditing={editingId === e.id}
                onToggleEdit={() => setEditingId(editingId === e.id ? null : e.id)}
                onExport={() => onExport(e)}
                onPreview={() => onPreview(e)}
                exporting={exporting}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function EditionRow({
  edition,
  bookId,
  isEditing,
  onToggleEdit,
  onExport,
  onPreview,
  exporting,
}: {
  edition: BookEdition;
  bookId: string;
  isEditing: boolean;
  onToggleEdit: () => void;
  onExport: () => void;
  onPreview: () => void;
  exporting: boolean;
}) {
  const updateEdition = useUpdateBookEdition();
  const deleteEdition = useDeleteBookEdition();
  const confirm = useConfirm();
  const bookQ = useBook(bookId);

  function patch(p: Partial<BookEdition>) {
    void updateEdition.mutateAsync({ id: edition.id, patch: p });
  }

  async function onDelete() {
    const ok = await confirm({
      title: `Delete edition "${edition.name}"?`,
      danger: true,
    });
    if (!ok) return;
    deleteEdition.mutate({ id: edition.id, bookId: edition.book_id });
  }

  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-2">
        <input
          value={edition.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="flex-1 bg-transparent text-sm font-medium focus:outline-none"
          data-testid="edition-name"
        />
        <span className="text-xs text-fg-muted">
          {edition.trim_width_mm}×{edition.trim_height_mm} mm · {edition.body_font}
        </span>
        <button
          type="button"
          onClick={onPreview}
          className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:border-fg-muted hover:text-fg"
          data-testid="edition-preview-pdf"
          title="Render the PDF in an in-app viewer (no download)"
        >
          Preview PDF
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:border-fg-muted hover:text-fg disabled:cursor-wait disabled:opacity-40"
          data-testid="edition-export"
        >
          {exporting ? 'Generating…' : 'Export PDF'}
        </button>
        <button
          type="button"
          onClick={onToggleEdit}
          className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:border-fg-muted hover:text-fg"
          data-testid="edition-toggle-edit"
        >
          {isEditing ? 'Close' : 'Edit'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="px-1 py-1 text-xs text-fg-muted hover:text-red-400"
          data-testid="edition-delete"
        >
          delete
        </button>
      </div>

      {isEditing ? <EditionForm edition={edition} onPatch={patch} /> : null}
      {isEditing && bookQ.data ? (
        <div className="mt-3" data-testid="edition-preview">
          <BookEditionPreview
            edition={edition}
            bookId={bookId}
            bookTitle={bookQ.data.title}
          />
        </div>
      ) : null}
    </div>
  );
}

function EditionForm({
  edition,
  onPatch,
}: {
  edition: BookEdition;
  onPatch: (p: Partial<BookEdition>) => void;
}) {
  return (
    <div className="mt-3 space-y-4 rounded border border-border bg-bg-subtle/30 p-3 text-xs">
      {/* ── Trim ─────────────────────────────────────────────────── */}
      <Section title="Trim size">
        <div className="flex flex-wrap gap-2">
          {TRIM_PRESETS.map((p) => {
            const active = edition.trim_width_mm === p.w && edition.trim_height_mm === p.h;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => onPatch({ trim_width_mm: p.w, trim_height_mm: p.h })}
                className={`rounded border px-2 py-1 ${
                  active ? 'border-accent text-fg' : 'border-border text-fg-muted hover:border-fg-muted'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <Row>
          <Field label="Width (mm)">
            <NumberInput
              value={edition.trim_width_mm}
              onChange={(v) => onPatch({ trim_width_mm: v })}
              step={0.1}
            />
          </Field>
          <Field label="Height (mm)">
            <NumberInput
              value={edition.trim_height_mm}
              onChange={(v) => onPatch({ trim_height_mm: v })}
              step={0.1}
            />
          </Field>
        </Row>
      </Section>

      {/* ── Margins ──────────────────────────────────────────────── */}
      <Section title="Margins (mm) — inside = gutter side, outside = far edge">
        <Row>
          <Field label="Inside">
            <NumberInput
              value={edition.margin_inside_mm}
              onChange={(v) => onPatch({ margin_inside_mm: v })}
            />
          </Field>
          <Field label="Outside">
            <NumberInput
              value={edition.margin_outside_mm}
              onChange={(v) => onPatch({ margin_outside_mm: v })}
            />
          </Field>
          <Field label="Top">
            <NumberInput
              value={edition.margin_top_mm}
              onChange={(v) => onPatch({ margin_top_mm: v })}
            />
          </Field>
          <Field label="Bottom">
            <NumberInput
              value={edition.margin_bottom_mm}
              onChange={(v) => onPatch({ margin_bottom_mm: v })}
            />
          </Field>
        </Row>
        <p className="text-[10px] text-fg-muted">
          V1 limitation: body text uses the average of inside/outside as symmetric L/R
          padding. Headers and page numbers ARE parity-aware (outside edge).
        </p>
      </Section>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <Section title="Body">
        <Row>
          <Field label="Font">
            <FontSelect
              value={edition.body_font}
              onChange={(v) => onPatch({ body_font: v })}
            />
          </Field>
          <Field label="Size (pt)">
            <NumberInput
              value={edition.body_font_size_pt}
              onChange={(v) => onPatch({ body_font_size_pt: v })}
              step={0.5}
            />
          </Field>
          <Field label="Line height">
            <NumberInput
              value={edition.body_line_height}
              onChange={(v) => onPatch({ body_line_height: v })}
              step={0.05}
            />
          </Field>
          <Field label="Indent (mm)">
            <NumberInput
              value={edition.paragraph_indent_mm}
              onChange={(v) => onPatch({ paragraph_indent_mm: v })}
              step={0.5}
            />
          </Field>
        </Row>
        <Row>
          <Toggle
            label="Justify"
            value={edition.body_justify}
            onChange={(v) => onPatch({ body_justify: v })}
          />
          <Toggle
            label="Drop cap (first letter of chapter)"
            value={edition.drop_cap}
            onChange={(v) => onPatch({ drop_cap: v })}
          />
          <Toggle
            label="Include illustrations"
            value={edition.include_illustrations}
            onChange={(v) => onPatch({ include_illustrations: v })}
          />
        </Row>
      </Section>

      {/* ── Chapter title ────────────────────────────────────────── */}
      <Section title="Chapter title">
        <Row>
          <Field label="Font">
            <FontSelect
              value={edition.chapter_title_font}
              onChange={(v) => onPatch({ chapter_title_font: v })}
            />
          </Field>
          <Field label="Size (pt)">
            <NumberInput
              value={edition.chapter_title_size_pt}
              onChange={(v) => onPatch({ chapter_title_size_pt: v })}
            />
          </Field>
          <Field label="Align">
            <AlignSelect
              value={edition.chapter_title_align}
              onChange={(v) => onPatch({ chapter_title_align: v })}
            />
          </Field>
        </Row>
        <Row>
          <Toggle
            label="Bold"
            value={edition.chapter_title_bold}
            onChange={(v) => onPatch({ chapter_title_bold: v })}
          />
          <Toggle
            label="Italic"
            value={edition.chapter_title_italic}
            onChange={(v) => onPatch({ chapter_title_italic: v })}
          />
        </Row>
      </Section>

      {/* ── Header ───────────────────────────────────────────────── */}
      <Section title="Running header">
        <Row>
          <Field label="Mode">
            <select
              value={edition.header_mode}
              onChange={(e) => onPatch({ header_mode: e.target.value as HeaderMode })}
              className="w-full bg-bg-panel px-2 py-1 text-xs"
            >
              <option value="none">None</option>
              <option value="book_title">Book title</option>
              <option value="chapter_title">Chapter title</option>
              <option value="alternating">Alternating (verso = book / recto = chapter)</option>
              <option value="author">Author</option>
            </select>
          </Field>
          <Field label="Font">
            <FontSelect
              value={edition.header_font}
              onChange={(v) => onPatch({ header_font: v })}
            />
          </Field>
          <Field label="Size (pt)">
            <NumberInput
              value={edition.header_size_pt}
              onChange={(v) => onPatch({ header_size_pt: v })}
            />
          </Field>
        </Row>
        <Row>
          <Toggle
            label="Italic"
            value={edition.header_italic}
            onChange={(v) => onPatch({ header_italic: v })}
          />
          <Toggle
            label="Show on chapter's first page"
            value={edition.header_show_on_chapter_first_page}
            onChange={(v) => onPatch({ header_show_on_chapter_first_page: v })}
          />
        </Row>
      </Section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <Section title="Page numbers (footer)">
        <Row>
          <Toggle
            label="Show page numbers"
            value={edition.footer_page_numbers}
            onChange={(v) => onPatch({ footer_page_numbers: v })}
          />
          <Field label="Position">
            <select
              value={edition.footer_position}
              onChange={(e) => onPatch({ footer_position: e.target.value as FooterPosition })}
              className="w-full bg-bg-panel px-2 py-1 text-xs"
            >
              <option value="outside">Outside (verso left, recto right)</option>
              <option value="center">Center</option>
              <option value="inside">Inside (gutter)</option>
            </select>
          </Field>
          <Field label="Size (pt)">
            <NumberInput
              value={edition.footer_size_pt}
              onChange={(v) => onPatch({ footer_size_pt: v })}
            />
          </Field>
        </Row>
        <Row>
          <Toggle
            label="Show on chapter's first page"
            value={edition.footer_show_on_chapter_first_page}
            onChange={(v) => onPatch({ footer_show_on_chapter_first_page: v })}
          />
        </Row>
      </Section>

      {/* ── Per-chapter framing ──────────────────────────────────── */}
      <Section title="Chapter header & footer (per-chapter framing — epigraph, monolog…)">
        <Row>
          <Field label="Header font">
            <FontSelect
              value={edition.chapter_header_font}
              onChange={(v) => onPatch({ chapter_header_font: v })}
            />
          </Field>
          <Field label="Header size (pt)">
            <NumberInput
              value={edition.chapter_header_size_pt}
              onChange={(v) => onPatch({ chapter_header_size_pt: v })}
            />
          </Field>
          <Field label="Header align">
            <AlignSelect
              value={edition.chapter_header_align}
              onChange={(v) => onPatch({ chapter_header_align: v })}
            />
          </Field>
          <Toggle
            label="Header italic"
            value={edition.chapter_header_italic}
            onChange={(v) => onPatch({ chapter_header_italic: v })}
          />
        </Row>
        <Row>
          <Field label="Footer font">
            <FontSelect
              value={edition.chapter_footer_font}
              onChange={(v) => onPatch({ chapter_footer_font: v })}
            />
          </Field>
          <Field label="Footer size (pt)">
            <NumberInput
              value={edition.chapter_footer_size_pt}
              onChange={(v) => onPatch({ chapter_footer_size_pt: v })}
            />
          </Field>
          <Field label="Footer align">
            <AlignSelect
              value={edition.chapter_footer_align}
              onChange={(v) => onPatch({ chapter_footer_align: v })}
            />
          </Field>
          <Toggle
            label="Footer italic"
            value={edition.chapter_footer_italic}
            onChange={(v) => onPatch({ chapter_footer_italic: v })}
          />
        </Row>
      </Section>

      {/* ── Behavior ─────────────────────────────────────────────── */}
      <Section title="Behavior">
        <Row>
          <Toggle
            label="Chapters start on recto (right page) — V1: not enforced, use manual page breaks"
            value={edition.chapter_starts_on_recto}
            onChange={(v) => onPatch({ chapter_starts_on_recto: v })}
          />
        </Row>
      </Section>
    </div>
  );
}

// ── Form primitives ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">{title}</h3>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-[120px] flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-fg-muted">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        if (!Number.isNaN(n)) onChange(n);
      }}
      className="w-full bg-bg-panel px-2 py-1 text-xs"
    />
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-w-[120px] cursor-pointer items-center gap-1.5 text-[11px] text-fg-muted">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="cursor-pointer"
      />
      <span>{label}</span>
    </label>
  );
}

function FontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-bg-panel px-2 py-1 text-xs"
    >
      {FONT_CATALOG_NAMES.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

function AlignSelect({ value, onChange }: { value: Align; onChange: (v: Align) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Align)}
      className="w-full bg-bg-panel px-2 py-1 text-xs"
    >
      <option value="left">Left</option>
      <option value="center">Center</option>
      <option value="right">Right</option>
    </select>
  );
}
