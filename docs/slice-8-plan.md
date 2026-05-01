# Slice 8 — Reader view + Summaries + PCC + Search + Published + Runs history

**Goal** : polish + ergonomie. Cinq morceaux + une feature glissée :

1. **Reader view** — navigation Books → Parts → Chapters en mode lecture confortable, mini-fiche entity au state du chapter.
2. **Summaries S/M/L** — par chapter, generate via LLM depuis la final version.
3. **PCC (Previous-Chapter Context)** — config world-level `["raw","L","M","S","S","S"]`. Upscale et chat-on-chapter peuvent injecter les N chapters précédents (par `chronological_rank`) à des niveaux décroissants.
4. **Search global** — modal Cmd+K, FTS Postgres sur notes + chapter_versions + entities.
5. **Chapter `published` flag** — toggle qui bloque toutes les mutations chapter (manual edit, upscale, propose updates, change final, generate summaries). Unpublish ramène à éditable.
6. **Runs history** — écran dédié `/worlds/$id/runs` avec filtres (kind, status, range) + pagination + agrégats. Footer Monitoring reste comme raccourci.

## Phase A — autonome

### A.1 Migration V010 (à appliquer par user avant code)

Cf. `supabase/migrations/V010__slice_8_search_pcc.sql`. Ajoute :
- 3 index FTS GIN (notes, chapter_versions, entities).
- `worlds.previous_chapter_context jsonb` default `["raw","L","M","S","S","S"]`.

### A.2 Types & queries

- `World` type : ajoute `previous_chapter_context: ('raw'|'L'|'M'|'S')[]`.
- `useUpdateWorld` : accepte `previousChapterContext?`.
- `src/lib/queries/search.ts` : `useGlobalSearch(worldId, query)` qui parallélise 3 requêtes FTS + map en `{ kind, id, title, snippet }[]`.
- `src/lib/queries/chapters.ts` : `useUpdateChapter` accepte `summaryS / summaryM / summaryL` et `status / publishedAt`.
- `useRecentRuns` : étendre en `useRunsPage(worldId, { kindFilter, statusFilter, dateRange, page, pageSize })` avec count via Postgres `count: 'exact'`.

### A.3 LLM module : summaries

`src/lib/llm/summaries.ts` :
- Prompt : world memory + final version text + cible (S/M/L) + cibles longueur ("S = 2 phrases", "M = 1 paragraphe", "L = 3-5 paragraphes").
- Tier : `user_settings.summarize_tier` (default `cheapest`). On l'ajoute si pas déjà là.
- Blocking, retourne `string`. logRun avec `kind='summarize'`.

### A.4 LLM upscale & chat — wiring PCC

`src/lib/llm/pcc.ts` (nouveau) :
- `resolvePreviousChapters(currentChapter, allChapters, slots: ContextLevel[]): { chapter, level, text }[]`.
- Itère sur les chapters dont `chronological_rank < current.chronological_rank`, ordre desc, prend les `slots.length` premiers, mappe slot par slot (slot[0] = chapter le plus récent en backward order).
- Pour chaque slot : si `level=raw` → text de la final version (fetched), sinon → `summary_<level>`. Fallback : si summary null, downgrade dans l'ordre `S→M→L→raw` jusqu'à trouver du contenu (avec un drapeau `usedFallback: true` exposé en UI éventuellement).

Modifier `upscale.ts` et la construction du prompt chat pour accepter optionnellement un `previousChapters: PreviousChapter[]` et l'injecter en bloc :

```
# Previous chapters (chronologique, du plus ancien au plus récent)

## "<title>" (raw)
<full text>

## "<title>" (Large summary)
<summary_l>
…
```

UI : checkbox "Include previous chapters (N)" dans le form upscale et dans ChatPanel quand `parentKind='chapter'`. Default ON. State persisté en local (zustand UI store).

### A.5 Reader view

Route `/worlds/$worldId/read` (TOC du world) et `/worlds/$worldId/read/$chapterId` (chapter en lecture).

**TOC** : list books (collapsible par book), à l'intérieur les parts (h3), à l'intérieur la liste des chapters par `reading_rank`. Chaque chapter row : title, badge `DRAFT` si `status='draft'`, link → `/read/$chapterId`.

**Reader page** :
- Header sticky : titre du book / part / chapter, prev/next chapter (basé sur l'ordre `reading_rank` global du book), back to TOC.
- Body : final version text dans une typo lecture (`max-w-prose`, `prose-invert` Tailwind, line-height généreux).
- Highlights des entities **comme dans NoteEditor** mais cliquables → mini-popover avec snapshot au `chronological_rank` du chapter (réutilise `resolveStateAtRank`).
- Mode read-only strict (pas d'éditeur Tiptap, juste un `dangerouslySetInnerHTML` ou render Tiptap en `editable: false`).

Lien "Read" ajouté dans AppHeader (à côté de Timeline).

### A.6 Summaries tab dans ChapterScreen

VersionsPanel devient un container avec 3 tabs : `Versions ⚡ | Summary | Chat`. Tab Summary :
- 3 sections empilées : `S (2 phrases)`, `M (1 paragraphe)`, `L (3-5 paragraphes)`.
- Chaque section : textarea (editable), bouton `Generate` (regenère depuis la final version, overwrite après confirm si le textarea n'est pas vide), bouton `Save`.
- Read-only quand `chapter.status='published'`.

### A.7 Published toggle

ChapterScreen header : nouveau bouton `Publish` / `Unpublish`. Click → update `chapters.status` + `published_at = now()` (ou null si unpublish). Quand published :
- VersionsPanel : pas de Save manual edit possible, pas d'upscale.
- ProposeUpdatesModal : disabled.
- SummariesTab : disabled.
- Editor : `editable: false`.
- Header : badge `PUBLISHED` à côté du title.

Reader page affiche les drafts aussi (badge DRAFT) — la lecture est utile à l'auteur pour s'auto-relire.

### A.8 Search modal

Composant `GlobalSearchModal` mounté globalement comme `ConfirmDialog`. Trigger :
- Bouton 🔍 dans AppHeader.
- Raccourci clavier `Cmd+K` / `Ctrl+K`.

Layout :
- Input recherche en haut (autoFocus).
- Liste résultats groupés par kind (`Notes (3)`, `Chapters (2)`, `Entities (5)`).
- Chaque résultat : title + snippet (200 chars autour du match, hl basique).
- Click → navigate vers la page correspondante, close modal.

Côté DB, on construit la query :
```ts
const fts = plainToTsQuery(input);
// 3 queries .from('notes' | 'chapter_versions' | 'entities')
//   .textSearch(<col_or_expr>, fts, { config: 'simple' })
//   .eq('world_id', worldId).limit(20)
```

`textSearch` de PostgREST traduit en `to_tsvector(...) @@ to_tsquery(...)`. Comme nos index sont sur l'expression `to_tsvector('simple', expr)`, on utilise `.textSearch('expr', q, { config: 'simple' })` mais avec une **vue materialisée** ou plus simplement on crée une **colonne générée** `search_text` indexée pour pouvoir faire `.textSearch('search_text', q)`.

**Décision** : on génère des colonnes `search_text` via la migration plutôt que de bricoler côté front. Voir migration.

### A.9 Runs history page

Route `/worlds/$worldId/runs`.

Layout :
- Header : back, title, agrégats (total runs, total tokens approx, fenêtre last 7 days vs all time).
- Filters : 3 selects (kind, status, range = `today | 7d | 30d | all`).
- Table : created_at, kind, model, status, duration_ms, tokens. Click row → expand `input_summary` JSON.
- Pagination "Load more" (page size 50).

Lien `View all` ajouté en bas du footer Monitoring.

### A.10 Settings UI étendu

SettingsScreen ajoute une nouvelle section **"Previous-chapter context"** :
- Affiche la liste actuelle du world (chips ordonnés `raw → L → M → S → S → S`).
- Boutons `+ raw / + L / + M / + S` qui append.
- Chaque chip : `↑↓` pour reorder, `×` pour remove.
- `Reset to default` button.

Aussi : ajoute selector `Summarize tier` (default `cheapest`) si on touche `user_settings`.

## Phase B — user

| # | Action | Où |
|---|---|---|
| B.1 | Apply `V010__slice_8_search_pcc.sql` | Dashboard SQL editor |
| B.2 | Pilote live : reader, summary generate, PCC sur upscale, search, publish/unpublish, runs page | App + Chrome |

Pas de nouveau secret, pas d'edge function.

## Décisions tranchées

- **Reader inclut drafts** (badge DRAFT) — auto-relecture utile à l'auteur. Si on veut un mode "published only" plus tard = setting toggle.
- **Search config** = `'simple'` (pas de stemming FR/EN) — cohérent avec note `data-model.md`.
- **Search index strategy** : colonnes générées `search_text` pour pouvoir utiliser `.textSearch()` PostgREST proprement. Index GIN sur ces colonnes.
- **PCC ordering** : `chronological_rank` (cohérence narrative).
- **PCC fallback** : si summary manque pour un slot, on downgrade `S→M→L→raw`. Si même raw manque (final version vide), on skip le chapter.
- **Summaries** : pas de versioning — overwrite à chaque generate. Si on veut historique = slice 8.x.
- **Published flag** : toggle pur, pas de snapshot. Bloque toutes les mutations (manual edit, upscale, propose updates, summary generate, change final).
- **Runs page** : agrégats simples (count, sum tokens) côté client sur la page courante. Pour des stats vraiment fiables sur tout le history = vue SQL plus tard.

## Tests Vitest visés

- `pcc.test.ts` : `resolvePreviousChapters` (slot mapping, fallback chain, edge cases : moins de chapters que de slots, chapter sans summary).
- `summaries.test.ts` : prompt builder par niveau, mock provider.
- `search.test.ts` : combinaison 3 résultats, dedup, ranking simple.
