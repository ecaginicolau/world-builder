import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  EntityHighlight,
  setEntityHighlights,
  type EntityHighlightSpec,
} from './entityHighlightExtension';
import { IllustrationExtension } from './illustrationExtension';

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
  /**
   * Fires on every doc-changed transaction, no debounce. Lets callers feed the
   * live editor HTML to debounced consumers (e.g. auto-extract) without waiting
   * for the save round-trip — otherwise the consumer's own debounce starts ~600ms
   * late and never converges while the user keeps typing.
   */
  onLiveUpdate?: (html: string) => void;
}

export interface NoteEditorHandle {
  /** Returns the editor's current HTML synchronously (bypasses debounce). */
  getHTML: () => string;
  /** Inserts an illustration block at the current cursor position. No-op if
   * illustrations aren't enabled or the editor is read-only. */
  insertIllustration: (illustrationId: string, entityId: string) => void;
}

export const NoteEditor = forwardRef<NoteEditorHandle, Props>(function NoteEditor(
  {
    initialContent,
    onChange,
    debounceMs = 400,
    entityHighlights,
    readOnly = false,
    enableIllustrations = false,
    onLiveUpdate,
  },
  ref,
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onLiveUpdateRef = useRef(onLiveUpdate);
  onLiveUpdateRef.current = onLiveUpdate;

  const extensions = useMemo<Extensions>(() => {
    const base: Extensions = [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      EntityHighlight.configure({ entities: entityHighlights ?? [] }),
    ];
    if (enableIllustrations) base.push(IllustrationExtension);
    return base;
    // entityHighlights is fed in dynamically via setEntityHighlights below;
    // we only need to recompute extensions when the illustration toggle flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableIllustrations]);

  const editor = useEditor({
    extensions,
    editable: !readOnly,
    content: initialContent || '',
    editorProps: {
      attributes: {
        'data-testid': 'note-editor',
        class:
          'prose prose-invert max-w-none min-h-[40vh] focus:outline-none px-4 py-3',
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
        // The chained .run() dispatches a docChanged transaction, which onUpdate
        // picks up and pushes through the normal debounced save pipeline.
        editor.chain().focus().insertIllustration({ illustrationId, entityId }).run();
      },
    }),
    [editor, enableIllustrations],
  );

  // Refresh decorations whenever the entities list changes.
  useEffect(() => {
    if (!editor) return;
    setEntityHighlights(editor, entityHighlights ?? []);
  }, [editor, entityHighlights]);

  // Reflect external readOnly toggles.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

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
