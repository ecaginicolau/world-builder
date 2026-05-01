# Slice 5 — Plan d'exécution

> Timeline + events + ranks chronologiques.

## Goal

Au bout de Slice 5, l'user peut :

1. **Voir** une timeline qui mélange ses chapters et ses events, triés par `chronological_rank`.
2. Créer / éditer / supprimer des **events** (titre + description + tags).
3. **Réordonner** la timeline (events + chapters) — déplace un item vers le haut ou le bas.
4. **Promote** une note vers un nouvel event (parité avec note → entity / note → chapter).

## Scope sliced down (minimum viable)

- Migration V007 : table `events` (déjà spec dans `docs/data-model.md`) + RLS + indexes + trigger `updated_at`.
- Route `/worlds/$worldId/timeline` accessible depuis le header (`📅` icon + "Timeline" tab).
- UI timeline : liste verticale, items mélangés `chapters ∪ events`, triés `chronological_rank` ASC.
- Create event inline (titre uniquement pour le start, edit pour fields complets).
- Edit event : titre + description + tags inline.
- Delete event (confirm).
- Reorder via boutons `↑ ↓` — recalcule le `chronological_rank` via `rankBetween` (events ET chapters).
- Promote note → event : modal `PromoteToEventModal`, log dans `note_promotions`.

### Anti-patterns Slice 5 (à NE PAS faire)

- ❌ Drag-and-drop (Slice 5.x — boutons ↑↓ suffisent comme pour Slice 4)
- ❌ Filtres / search dans la timeline (Slice 8 search global)
- ❌ Visualisation horizontale type Gantt — liste verticale c'est tout
- ❌ Couleurs par tag d'event — Slice 5.x si besoin
- ❌ Lien "events ↔ entities" (chapter_participants existe pour chapters mais pas pour events ; out of scope)
- ❌ Auto-extraction sur events
- ❌ Archive/status sur events

## Phases

### Phase A — autonome

- A.1 — Migration `V007__slice_5_events.sql` : `events` table + RLS + indexes + trigger.
- A.2 — Type TS `Event` dans `src/features/timeline/types.ts`.
- A.3 — Data layer `src/lib/queries/events.ts` :
  - useEvents(worldId), useCreateEvent, useUpdateEvent, useDeleteEvent
  - useMoveTimelineItem (générique : event ou chapter, déplace ↑ ou ↓)
- A.4 — Route `/worlds/$worldId/timeline` dans `src/router.tsx`.
- A.5 — Ajout du tab "Timeline" dans `AppHeader` (icon `📅`, label "Timeline").
- A.6 — `src/features/timeline/TimelineScreen.tsx` :
  - Merge chapters + events → liste triée `chronological_rank` ASC.
  - Pour chaque item : titre + boutons ↑↓ + edit + delete (events) ou link vers ChapterScreen (chapters).
  - Form create event en haut (titre).
  - Edit event inline (titre, description, tags séparés par virgules).
- A.7 — `PromoteToEventModal` réutilise le pattern `PromoteToChapterModal`.
- A.8 — Bouton "Promote → event" dans `NoteScreen` header.
- A.9 — Tests Vitest sur le helper `mergeTimelineItems` (sort par chronological_rank).
- A.10 — Run dev cycle (typecheck/lint/vitest/playwright/build).
- A.11 — Pilote Chrome live (après V007 appliquée par user).
- A.12 — Update `docs/NEXT-STEPS.md` Status section.

### Phase B — user (~1 min)

| # | Action | Où |
|---|---|---|
| B.1 | Apply `supabase/migrations/V007__slice_5_events.sql` | Dashboard SQL editor |
| B.2 | Pilote live : créer event, reorder, promote note → event, vérifier la timeline | App |

Pas de nouveau secret, pas d'Edge Function.

## Decisions unilatérales

- **Pas de drag-and-drop** dès la Phase A — boutons `↑ ↓` plus simples, suffisants pour valider la timeline. Si le user demande dnd, on l'ajoutera en Slice 5.x via `dnd-kit` (pas encore dans la stack).
- **Form create event minimaliste** : juste un input titre, comme `BookDetailScreen` pour les parts/chapters. Le rich-edit (description, tags) se fait en mode "edit" inline après création.
- **Insertion d'event** : nouveau event créé avec `chronological_rank = nextRankAfter(allItems)` — ajouté à la fin de la timeline. L'user peut ensuite le faire remonter via `↑`.
- **Reorder un chapter** depuis la timeline : ne touche QUE le `chronological_rank`. Le `reading_rank` (position dans la part) reste intact. Permet exactement le cas flashback du design (ch1 lu en pos 7, mais chronologiquement avant ch2).
- **Tags d'event** : `text[]` stocké en DB. UI = input "tag1, tag2, tag3". Pas de picker, pas de coloration en Slice 5.
- **Description d'event** : `text` simple (textarea), pas Tiptap. Un event = un repère sec, on n'écrit pas un chapitre dedans.
- **Promotion note → event** : `description = note.content` (HTML brut, comme draft de chapter). User peut ensuite édit. La note source est NOT archivée par défaut (les events sont moins "définitifs" qu'un chapter).
- **Pas de delete confirm sur events** — les boutons sont petits et on a un `confirm()` natif comme pour les notes pour limiter l'erreur de clic.

## DoD

- [ ] V007 écrite et appliquée
- [ ] Events CRUD marche
- [ ] Timeline merge chapters + events triés par `chronological_rank`
- [ ] Reorder ↑↓ sur events ET chapters (modifie chronological_rank)
- [ ] Promotion note → event crée l'event + un row `note_promotions`
- [ ] typecheck/lint/vitest/playwright verts
- [ ] Pilote Chrome live (post V007) prouve le flow end-to-end
