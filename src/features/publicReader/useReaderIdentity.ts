import { useEffect, useState } from 'react';
import { loadIdentity, newReaderLocalId, saveIdentity, type ReaderIdentity } from './readerIdentity';

export function useReaderIdentity(token: string) {
  const [identity, setIdentity] = useState<ReaderIdentity | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setIdentity(loadIdentity(token));
    setHydrated(true);
  }, [token]);

  function setName(name: string) {
    const trimmed = name.trim().slice(0, 60);
    if (!trimmed) return;
    const id = identity ?? { reader_local_id: newReaderLocalId(), name: trimmed };
    const next: ReaderIdentity = { ...id, name: trimmed };
    saveIdentity(token, next);
    setIdentity(next);
  }

  return { identity, hydrated, setName };
}
