import { useEffect, useRef, useState, type RefObject } from 'react';
import { captureFromRange, type CapturedSelection } from './selectionContext';

interface Props {
  containerRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  allowComments: boolean;
  onReact: (kind: 'up' | 'down', selection: CapturedSelection) => void;
  onComment: (selection: CapturedSelection, anchor: { x: number; y: number }) => void;
}

interface ToolbarState {
  x: number;
  y: number;
  selection: CapturedSelection;
}

export function SelectionToolbar({
  containerRef,
  enabled,
  allowComments,
  onReact,
  onComment,
}: Props) {
  const [state, setState] = useState<ToolbarState | null>(null);
  const stateRef = useRef<ToolbarState | null>(null);
  stateRef.current = state;

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    let timer: number | null = null;

    function update() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setState(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const root = containerRef.current;
      if (!root) return;
      const captured = captureFromRange(root, range);
      if (!captured || captured.selected_text.length < 3) {
        setState(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      // Position below the selection if there's room, otherwise above.
      const toolbarHeight = 40;
      const viewportH = window.innerHeight;
      const below = rect.bottom + 8;
      const useAbove = below + toolbarHeight > viewportH - 16;
      const y = useAbove ? Math.max(8, rect.top - toolbarHeight - 8) : below;
      const x = Math.min(
        Math.max(8, rect.left + rect.width / 2 - 60),
        window.innerWidth - 130,
      );
      setState({ x, y, selection: captured });
    }

    function onSelChange() {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(update, 60);
    }
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement;
      if (target.closest('.reader-toolbar') || target.closest('.reader-comment-popover')) {
        return;
      }
    }

    document.addEventListener('selectionchange', onSelChange);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('selectionchange', onSelChange);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [enabled, containerRef]);

  function handleReact(kind: 'up' | 'down') {
    if (!state) return;
    onReact(kind, state.selection);
    window.getSelection()?.removeAllRanges();
    setState(null);
  }

  function handleComment() {
    if (!state) return;
    onComment(state.selection, { x: state.x, y: state.y });
    setState(null);
  }

  if (!state) return null;

  return (
    <div
      className="reader-toolbar"
      style={{ left: state.x, top: state.y }}
      data-testid="reader-selection-toolbar"
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onClick={() => handleReact('up')}
        title="I like this"
        data-testid="reader-react-up"
      >
        👍
      </button>
      <button
        type="button"
        onClick={() => handleReact('down')}
        title="Not for me"
        data-testid="reader-react-down"
      >
        👎
      </button>
      {allowComments ? (
        <button
          type="button"
          onClick={handleComment}
          title="Leave a comment"
          data-testid="reader-react-comment"
        >
          💬
        </button>
      ) : null}
    </div>
  );
}
