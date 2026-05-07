import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  EntityHighlight,
  setEntityHighlights,
  type EntityHighlightSpec,
} from './entityHighlightExtension';

interface Props {
  initialContent: string;
  onChange: (html: string) => void;
  /** Debounce in ms before onChange fires. */
  debounceMs?: number;
  /** Entities to highlight in the editor. Updated reactively. */
  entityHighlights?: EntityHighlightSpec[];
  /** Read-only: disables editing and the typing UI. */
  readOnly?: boolean;
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
}

export const NoteEditor = forwardRef<NoteEditorHandle, Props>(function NoteEditor(
  { initialContent, onChange, debounceMs = 400, entityHighlights, readOnly = false, onLiveUpdate },
  ref,
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onLiveUpdateRef = useRef(onLiveUpdate);
  onLiveUpdateRef.current = onLiveUpdate;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      EntityHighlight.configure({ entities: entityHighlights ?? [] }),
    ],
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
      // Skip programmatic updates (initial setContent, decoration refresh, etc.)
      // We only want to react to user input — gated by isFocused.
      if (!editor.isFocused) return;
      // Belt-and-suspenders: also require the transaction to actually change the doc.
      if (!transaction.docChanged) return;
      const html = editor.getHTML();
      onLiveUpdateRef.current?.(html);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        onChangeRef.current(html);
      }, debounceMs);
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      getHTML: () => editor?.getHTML() ?? '',
    }),
    [editor],
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
