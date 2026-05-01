import { useEffect, useRef, useState } from 'react';
import { getExtractor, type EntityCandidate } from '@/lib/llm/extract';
import { useEntities } from '@/lib/queries/entities';
import { useEntityTypes } from '@/lib/queries/entityTypes';
import { useUserSettings } from '@/lib/queries/userSettings';

const MIN_CHARS = 80;
const DEFAULT_DEBOUNCE_MS = 5000;

interface State {
  candidates: EntityCandidate[];
  status: 'idle' | 'pending' | 'success' | 'error';
  error?: string;
  /** Hash of the text the candidates were computed from. */
  fromHash?: string;
}

function tinyHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return String(h);
}

/**
 * Module-level cache: surviving across remounts (e.g. when the user navigates
 * away from a note and comes back). Key = noteId, value = { hash, candidates }.
 * In-memory only — refresh wipes it, which is acceptable.
 */
const cache = new Map<string, { hash: string; candidates: EntityCandidate[] }>();

interface Args {
  noteId: string;
  worldId: string;
  plainText: string;
  /** When false, the hook is dormant (e.g. while the note is loading). */
  enabled?: boolean;
}

export function useAutoExtract({ noteId, worldId, plainText, enabled = true }: Args) {
  const entitiesQ = useEntities(worldId);
  const typesQ = useEntityTypes(worldId);
  const settingsQ = useUserSettings();
  const debounceMs = settingsQ.data?.autoExtractDebounceMs ?? DEFAULT_DEBOUNCE_MS;
  const cached = cache.get(noteId);
  const [state, setState] = useState<State>(() =>
    cached
      ? { candidates: cached.candidates, status: 'success', fromHash: cached.hash }
      : { candidates: [], status: 'idle' },
  );
  const inFlightRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const c = cache.get(noteId);
    if (c) {
      setState({ candidates: c.candidates, status: 'success', fromHash: c.hash });
    } else {
      setState({ candidates: [], status: 'idle' });
    }
    inFlightRef.current = false;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, [noteId]);

  useEffect(() => {
    if (!enabled) return;
    if (plainText.length < MIN_CHARS) return;
    const hash = tinyHash(plainText);
    if (state.fromHash === hash) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setState((s) => ({ ...s, status: 'pending' }));
      try {
        const extractor = getExtractor();
        const knownTypes = (typesQ.data ?? []).map((t) => t.name);
        const existing = (entitiesQ.data ?? []).map((e) => {
          const t = (typesQ.data ?? []).find((tt) => tt.id === e.entity_type_id);
          return {
            id: e.id,
            name: e.name,
            type: t?.name ?? 'Unknown',
            aliases: e.aliases,
          };
        });
        const result = await extractor({ noteText: plainText, existing, knownTypes });
        cache.set(noteId, { hash, candidates: result.candidates });
        setState({
          candidates: result.candidates,
          status: 'success',
          fromHash: hash,
        });
      } catch (err) {
        setState((s) => ({
          ...s,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        }));
      } finally {
        inFlightRef.current = false;
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [plainText, enabled, state.fromHash, entitiesQ.data, typesQ.data, noteId, debounceMs]);

  return state;
}
