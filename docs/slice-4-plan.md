# Slice 4 — Plan d'exécution

> Hiérarchie narrative : Books → Parts → Chapters + promotion note → chapter.

## Goal

Au bout de Slice 4, l'user peut :

1. Créer des **Books** dans un world (avec un titre + ordre).
2. Créer des **Parts** dans un book.
3. Créer des **Chapters** dans une part — avec éditeur Tiptap (StarterKit) auto-save.
4. **Promote** une note vers un nouveau chapter (sélection part de destination + titre, le contenu de la note devient le draft du chapter).

## Scope sliced down (minimum viable)

- Books / Parts / Chapters CRUD : create, list, delete, rename.
- Chapter content : draft text via Tiptap (StarterKit complet, comme note pour l'instant).
- Auto-save debouncé sur le contenu chapter (300-500ms).
- Promotion note → chapter : modal sur NoteScreen ("Promote to chapter"), liste les parts dispo, crée un chapter et log `note_promotions`.

### Anti-patterns Slice 4 (à NE PAS faire)

- ❌ Drag-to-reorder (Slice 4.x — boutons up/down si besoin)
- ❌ `chronological_rank` override UI — défault = composite `book.rank|part.rank|reading_rank`
- ❌ `published` flag UI — Slice 8
- ❌ Summaries S/M/L — Slice 8
- ❌ Chat panel sur chapter — Slice 4.x (refactor ChatPanel pour parentKind générique)
- ❌ chapter_participants UI — Slice 4.x ou Slice 5
- ❌ Auto-extraction sur chapter content — Slice 5 ou Slice 8
- ❌ Toolbar Tiptap visible — utiliser raccourcis keyboard pour le moment

## Phases

### Phase A — autonome

- A.1 — Migration `V005__slice_4_chapters.sql` : `books`, `parts`, `chapters`, `chapter_participants` + RLS + indexes + trigger updated_at.
- A.2 — Types TS : `Book`, `Part`, `Chapter`.
- A.3 — Data layer queries :
  - books : useBooks, useCreateBook, useUpdateBook, useDeleteBook
  - parts : usePartsByBook, useCreatePart, useUpdatePart, useDeletePart
  - chapters : useChaptersByPart, useChapter, useCreateChapter, useUpdateChapter, useDeleteChapter
- A.4 — Helpers ranks : nouveau `nextRankAfter(items)` qui appelle `rankBetween(lastRank, null)`.
- A.5 — Routes :
  - `/worlds/$worldId/books` — liste des books, create, delete
  - `/worlds/$worldId/books/$bookId` — détail book : liste parts + leurs chapters, create part / chapter
  - `/worlds/$worldId/chapters/$chapterId` — éditeur chapter (Tiptap StarterKit, auto-save)
- A.6 — Lien "Books" dans header de WorldDetailScreen.
- A.7 — Bouton "Promote to chapter" sur NoteScreen → modal (select part + title input) → crée chapter avec note.content comme draft + log promotion.
- A.8 — Tests + pilote local
- A.9 — Docs + commit

### Phase B — user (~1 min)

| # | Action | Où |
|---|---|---|
| B.1 | Apply `V005__slice_4_chapters.sql` | Dashboard SQL editor |
| B.2 | Pilote live : créer book → part → chapter, écrire dedans, promouvoir une note vers un chapter | App |

## Decisions unilatérales

- **Default `chronological_rank`** = composite `book.rank + '|' + part.rank + '|' + reading_rank`. L'user peut override via SQL pour les flashbacks (UI Slice 5).
- **Promotion note → chapter** : la note reste `open`, n'est pas archivée. Le chapter a `source_note_id = note.id` + `note_promotions` row.
- **Chapter editor** = même `NoteEditor` que pour les notes (StarterKit). Si on veut différencier plus tard (toolbar, etc.), on créera `ChapterEditor` séparé.
- **Champs chapter renseignés** : `draft = note.content` à la promotion ; `content` reste vide jusqu'à ce qu'on définisse une distinction draft/content (Slice 7 upscale ?).
- **Pas de `chapter_participants` initialisé à la promotion** — l'user re-tagera si besoin (et on le fera proprement quand on aura le pivot UI).

## DoD

- [ ] V005 écrite et appliquée
- [ ] Books / Parts / Chapters CRUD marche
- [ ] Chapter editor save automatiquement
- [ ] Promotion note → chapter crée le chapter avec le draft + un row note_promotions
- [ ] typecheck/lint/vitest/playwright verts
- [ ] Pilote Chrome live (post V005) prouve le flow end-to-end
