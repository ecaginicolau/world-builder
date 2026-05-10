import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor, Extensions } from '@tiptap/core';

/**
 * Run a layout-only command (insert page break, insert illustration, delete a
 * layout node). Kept as a wrapper for semantic clarity at call sites — the
 * editor is now always `editable=true` (read-only is enforced by intercepting
 * user input events), so no editable-flag toggling is needed. Programmatic
 * commands like `editor.chain().insertContent(...)` always succeed.
 */
export function runLayoutCommand(_editor: Editor, run: () => void) {
  run();
}
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  EntityHighlight,
  setEntityHighlights,
  type EntityHighlightSpec,
} from './entityHighlightExtension';
import { IllustrationExtension } from './illustrationExtension';
import { PageBreakExtension } from './pageBreakExtension';

interface Props {
  initialContent: string;
  onChange: (html: string) => void;
  /** Debounce in ms before onChange fires. */
  debounceMs?: number;
  /** Entities to highlight in the editor. Updated reactively. */
  entityHighlights?: EntityHighlightSpec[];
  /** Read-only: disables editing and the typing UI. */
  readOnly?: boolean;
  /** Enable the illustration block node (chapter editor only). */
  enableIllustrations?: boolean;
  /** Enable the page-break block node (chapter editor only). */
  enablePageBreaks?: boolean;
  /**
   * Fires on every doc-changed transaction, no debounce. Lets callers feed the
   * live editor HTML to debounced consumers (e.g. auto-extract) without waiting
   * for the save round-trip — otherwise the consumer's own debounce starts ~600ms
   * late and never converges while the user keeps typing.
   */
  onLiveUpdate?: (html: string) => void;
  placeholder?: string;
  /** Tailwind class for the editor's min-height. Default 'min-h-[40vh]'. */
  minHeightClass?: string;
  /** data-testid override for the editable surface. */
  testId?: string;
}

export interface NoteEditorHandle {
  /** Returns the editor's current HTML synchronously (bypasses debounce). */
  getHTML: () => string;
  /** Inserts an illustration block at the current cursor position. No-op if
   * illustrations aren't enabled or the editor is read-only. */
  insertIllustration: (illustrationId: string, entityId: string) => void;
  /** Inserts a page-break block at the current cursor position. No-op if
   * page-breaks aren't enabled or the editor is read-only. */
  insertPageBreak: () => void;
  /** Inserts a full-page illustration break (page break carrying an
   * illustration). The PDF export renders this as a dedicated full-page
   * image. No-op if page-breaks aren't enabled or the editor is read-only. */
  insertFullPageIllustration: (illustrationId: string, entityId: string) => void;
}

export const NoteEditor = forwardRef<NoteEditorHandle, Props>(function NoteEditor(
  {
    initialContent,
    onChange,
    debounceMs = 400,
    entityHighlights,
    readOnly = false,
    enableIllustrations = false,
    enablePageBreaks = false,
    onLiveUpdate,
    placeholder = 'Start writing…',
    minHeightClass = 'min-h-[40vh]',
    testId = 'note-editor',
  },
  ref,
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onLiveUpdateRef = useRef(onLiveUpdate);
  onLiveUpdateRef.current = onLiveUpdate;
  // The readOnly flag is read inside ProseMirror event handlers via this ref
  // so the soft-read-only state always matches the current prop without
  // having to re-create the editor instance.
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  const extensions = useMemo<Extensions>(() => {
    const base: Extensions = [
      StarterKit,
      Placeholder.configure({ placeholder }),
      EntityHighlight.configure({ entities: entityHighlights ?? [] }),
    ];
    if (enableIllustrations) base.push(IllustrationExtension);
    if (enablePageBreaks) base.push(PageBreakExtension);
    return base;
    // entityHighlights is fed in dynamically via setEntityHighlights below;
    // we only need to recompute extensions when toggles flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableIllustrations, enablePageBreaks, placeholder]);

  const editor = useEditor({
    extensions,
    // Stay editable=true even when readOnly. Hard read-only (contenteditable=
    // false) blocks cursor placement, which would prevent the user from
    // pointing the editor at a paragraph before clicking "+ Page break" / "+
    // Full-page illustration". Instead we let cursor placement and selection
    // through but reject all content-mutating user input via the editor props
    // below — programmatic commands (insertContent, deleteNode) still pass.
    editable: true,
    content: initialContent || '',
    editorProps: {
      attributes: {
        'data-testid': testId,
        class:
          `prose prose-invert max-w-none ${minHeightClass} focus:outline-none px-4 py-3`,
      },
      handleTextInput: () => readOnlyRef.current,
      handlePaste: () => readOnlyRef.current,
      handleDrop: () => readOnlyRef.current,
      handleKeyDown: (_view, event) => {
        if (!readOnlyRef.current) return false;
        // Allow navigation, selection, copy. Block typing, deletion, Enter
        // and any modifier-driven content mutation (Ctrl+V, Ctrl+Z, …).
        const navKeys = new Set([
          'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
          'Home', 'End', 'PageUp', 'PageDown',
          'Shift', 'Control', 'Alt', 'Meta', 'Tab', 'Escape',
        ]);
        if (navKeys.has(event.key)) return false;
        if ((event.ctrlKey || event.metaKey) && (event.key === 'c' || event.key === 'a')) {
          return false;
        }
        return true;
      },
    },
    onUpdate: ({ editor, transaction }) => {
      // docChanged filters out decoration-only / meta transactions
      // (e.g. setEntityHighlights). The downstream onChange callback is
      // responsible for ignoring no-op edits via its own equality check —
      // we don't gate on isFocused here because chained commands like
      // editor.chain().focus().insertX().run() and NodeView button clicks
      // can dispatch updates while the editor isn't yet (or no longer) the
      // focused element.
      if (!transaction.docChanged) return;
      const html = editor.getHTML();
      onLiveUpdateRef.current?.(html);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        onChangeRef.current(html);
      }, debounceMs);
    },
  }, [extensions]);

  useImperativeHandle(
    ref,
    () => ({
      getHTML: () => editor?.getHTML() ?? '',
      insertIllustration: (illustrationId, entityId) => {
        if (!editor || !enableIllustrations) return;
        // Layout-only command — bypass readOnly so we can insert a layout
        // node on a published chapter without unpublishing first. Free-form
        // typing remains locked because the editable flag flips back as soon
        // as the synchronous command finishes.
        runLayoutCommand(editor, () =>
          editor.chain().focus().insertIllustration({ illustrationId, entityId }).run(),
        );
      },
      insertPageBreak: () => {
        if (!editor || !enablePageBreaks) return;
        runLayoutCommand(editor, () =>
          editor.chain().focus().insertPageBreak().run(),
        );
      },
      insertFullPageIllustration: (illustrationId, entityId) => {
        if (!editor || !enablePageBreaks) return;
        runLayoutCommand(editor, () =>
          editor
            .chain()
            .focus()
            .insertPageBreak({ illustrationId, entityId })
            .run(),
        );
      },
    }),
    [editor, enableIllustrations, enablePageBreaks],
  );

  // Refresh decorations whenever the entities list changes.
  useEffect(() => {
    if (!editor) return;
    setEntityHighlights(editor, entityHighlights ?? []);
  }, [editor, entityHighlights]);

  // No setEditable toggle needed — the editor stays editable=true and the
  // editorProps handlers (gated on readOnlyRef.current) decide whether to
  // accept user input. This keeps cursor placement working in read-only mode
  // so authors can position the caret before invoking layout commands.

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      className="rounded-md border border-border bg-bg-panel"
      data-testid="note-editor-container"
    >
      <EditorContent editor={editor} />
    </div>
  );
});
