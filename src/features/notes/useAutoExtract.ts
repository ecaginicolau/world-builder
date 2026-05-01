import { useEffect, useRef, useState } from 'react';
import { getExtractor, type EntityCandidate } from '@/lib/llm/extract';
import { useEntities } from '@/lib/queries/entities';
import { useEntityTypes } from '@/lib/queries/entityTypes';

const MIN_CHARS = 80;
const DEBOUNCE_MS = 5000;

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

interface Args {
  noteId: string;
  worldId: string;
  plainText: string;
  /** When false, the hook is dormant (e.g. while the note is loading). */
  enabled?: boolean;
}

/**
 * Debounced auto-extraction of entity candidates from a note's plain text.
 * Skips: text too short, identical hash already extracted, in-flight call.
 * The hook keeps last result in local state — caller is responsible for
 * acting on candidates (auto-tag matches / surface in UI).
 */
export function useAutoExtract({ noteId, worldId, plainText, enabled = true }: Args) {
  const entitiesQ = useEntities(worldId);
  const typesQ = useEntityTypes(worldId);
  const [state, setState] = useState<State>({ candidates: [], status: 'idle' });
  const inFlightRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset when switching notes.
  useEffect(() => {
    setState({ candidates: [], status: 'idle' });
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
    }, DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [plainText, enabled, state.fromHash, entitiesQ.data, typesQ.data]);

  return state;
}
