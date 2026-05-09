import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useIllustration, publicUrlFor } from '@/lib/queries/illustrations';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    illustration: {
      insertIllustration: (attrs: { illustrationId: string; entityId: string }) => ReturnType;
    };
  }
}

export const IllustrationExtension = Node.create({
  name: 'illustration',
  group: 'block',
  atom: true,
  draggable: true,
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
        tag: 'figure[data-illustration-id]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // Stored HTML is intentionally minimal: just the figure with the id.
    // The renderer (editor NodeView, public reader, PDF) hydrates the <img src>
    // and caption from the entity_illustrations table at render time.
    return ['figure', mergeAttributes(HTMLAttributes), ['img', {}]];
  },

  addNodeView() {
    return ReactNodeViewRenderer(IllustrationNodeView);
  },

  addCommands() {
    return {
      insertIllustration:
        ({ illustrationId, entityId }) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { illustrationId, entityId },
          }),
    };
  },
});

function IllustrationNodeView({ node, deleteNode, editor }: NodeViewProps) {
  const id = node.attrs.illustrationId as string | null;
  const { data: illustration, isLoading } = useIllustration(id);
  const isEditable = editor.isEditable;
  const url = illustration ? publicUrlFor(illustration.storage_path) : null;

  return (
    <NodeViewWrapper
      as="figure"
      data-illustration-id={id ?? undefined}
      className="my-4 flex flex-col items-center gap-1"
    >
      {url ? (
        <img
          src={url}
          alt={illustration?.alt_text ?? illustration?.caption ?? ''}
          className="max-h-[60vh] max-w-full object-contain"
          draggable={false}
        />
      ) : isLoading ? (
        <div className="rounded border border-border bg-bg-subtle px-4 py-6 text-xs text-fg-muted">
          Loading illustration…
        </div>
      ) : (
        <div className="rounded border border-dashed border-red-500/40 bg-red-500/5 px-4 py-6 text-xs text-red-400">
          Illustration unavailable (deleted from its entity)
        </div>
      )}
      {illustration?.caption ? (
        <figcaption className="text-center text-xs italic text-fg-muted">
          {illustration.caption}
        </figcaption>
      ) : null}
      {isEditable ? (
        <button
          type="button"
          onClick={() => deleteNode()}
          className="text-[10px] text-fg-muted hover:text-red-400"
          contentEditable={false}
          data-testid="illustration-node-remove"
        >
          Remove from chapter
        </button>
      ) : null}
    </NodeViewWrapper>
  );
}
