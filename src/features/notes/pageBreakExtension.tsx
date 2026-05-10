import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useIllustration, publicUrlFor } from '@/lib/queries/illustrations';
import { runLayoutCommand } from './NoteEditor';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      insertPageBreak: (attrs?: {
        illustrationId?: string;
        entityId?: string;
      }) => ReturnType;
    };
  }
}

/**
 * `pageBreak` is an atomic block node that forces a new page in the PDF
 * export. Two flavors, encoded as one node so the chapter HTML serializer
 * stays simple:
 *
 *   - Empty break (no attributes) — just a marker between text segments.
 *   - Full-page illustration break — has `illustrationId` + `entityId`. The
 *     PDF/preview renderer treats this as a dedicated illustration page:
 *     break → centered full-page image (max-fit, ratio preserved) → break.
 */
export const PageBreakExtension = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      illustrationId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-illustration-id'),
        renderHTML: (attrs) =>
          attrs.illustrationId ? { 'data-illustration-id': attrs.illustrationId } : {},
      },
      entityId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-entity-id'),
        renderHTML: (attrs) =>
          attrs.entityId ? { 'data-entity-id': attrs.entityId } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-page-break]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-page-break': 'true' }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageBreakNodeView);
  },

  addCommands() {
    return {
      insertPageBreak:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: attrs ?? {},
          }),
    };
  },
});

function PageBreakNodeView({ node, deleteNode, editor }: NodeViewProps) {
  const illustrationId = node.attrs.illustrationId as string | null;
  // Layout commands work even on a published (read-only) editor — keep the
  // remove button visible and functional in that mode.
  const onRemove = () => runLayoutCommand(editor, () => deleteNode());
  const { data: illustration, isLoading } = useIllustration(illustrationId);
  const url = illustration ? publicUrlFor(illustration.storage_path) : null;

  if (illustrationId) {
    return (
      <NodeViewWrapper
        as="div"
        data-page-break="true"
        data-illustration-id={illustrationId}
        className="my-4 flex flex-col items-stretch gap-1 rounded border-2 border-dashed border-fg-muted/40 bg-bg-subtle/30 p-3"
      >
        <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-fg-muted">
          <span>─ full-page illustration ─</span>
          <button
            type="button"
            onClick={onRemove}
            contentEditable={false}
            className="text-fg-muted hover:text-red-400"
            data-testid="page-break-illustration-remove"
          >
            remove
          </button>
        </div>
        {url ? (
          <img
            src={url}
            alt={illustration?.alt_text ?? illustration?.caption ?? ''}
            className="mx-auto max-h-[40vh] max-w-full object-contain"
            draggable={false}
          />
        ) : isLoading ? (
          <div className="rounded border border-border bg-bg-subtle px-4 py-6 text-center text-xs text-fg-muted">
            Loading illustration…
          </div>
        ) : (
          <div className="rounded border border-dashed border-red-500/40 bg-red-500/5 px-4 py-6 text-center text-xs text-red-400">
            Illustration unavailable (deleted from its entity)
          </div>
        )}
        {illustration?.caption ? (
          <p className="text-center text-xs italic text-fg-muted">
            {illustration.caption}
          </p>
        ) : null}
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="div"
      data-page-break="true"
      className="my-4 select-none border-t-2 border-dashed border-fg-muted/40 pt-2 text-center text-[10px] uppercase tracking-widest text-fg-muted"
    >
      ─ page break ─
    </NodeViewWrapper>
  );
}
