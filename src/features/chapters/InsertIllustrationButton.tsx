import { useState } from 'react';
import { IllustrationPicker } from './IllustrationPicker';

interface Props {
  worldId: string;
  chapterId: string;
  disabled?: boolean;
  onPick: (illustrationId: string, entityId: string) => void;
}

export function InsertIllustrationButton({
  worldId,
  chapterId,
  disabled,
  onPick,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="w-full bg-bg-subtle px-3 py-2 text-sm hover:bg-bg-panel disabled:opacity-50"
        data-testid="chapter-insert-illustration"
      >
        + Insert illustration
      </button>
      {open ? (
        <IllustrationPicker
          worldId={worldId}
          chapterId={chapterId}
          onClose={() => setOpen(false)}
          onPick={(illustrationId, entityId) => {
            onPick(illustrationId, entityId);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
