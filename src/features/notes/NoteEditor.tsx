import { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

interface Props {
  initialContent: string;
  onChange: (html: string) => void;
  /** Debounce in ms before onChange fires. */
  debounceMs?: number;
}

export function NoteEditor({ initialContent, onChange, debounceMs = 400 }: Props) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: initialContent || '',
    editorProps: {
      attributes: {
        'data-testid': 'note-editor',
        class:
          'prose prose-invert max-w-none min-h-[40vh] focus:outline-none px-4 py-3',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        onChangeRef.current(html);
      }, debounceMs);
    },
  });

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
}

