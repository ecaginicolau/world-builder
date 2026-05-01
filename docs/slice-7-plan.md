# Slice 7 — Upscale + Proposals (avec versioning du texte du chapter)

**Goal** : boucle écriture → mise à jour entities. L'IA reprend le texte d'un chapter et produit une nouvelle version (Upscale, prompt user-driven). L'IA propose ensuite des diffs structurés sur les entities liées (Proposals) → accept/skip → crée des `entity_versions` au `chronological_rank` du chapter.

## Modèle clé : chapter_versions

Le chapter n'a plus de `draft`/`content`. À la place une **chaîne `chapter_versions`** :
- `v0 = draft` (origin = `'draft'`, écrit from scratch)
- `v1, v2, … = upscales` (origin = `'upscale'`, generated par LLM)
- `vN = manual_edit` (origin = `'manual_edit'`, l'user a édité une version au save)
- **Toutes éditables** ; édition = nouvelle version au save (pas de mutation in-place)
- **`chapters.final_version_id`** pointe la version courante (1 par chapter)
- Toute nouvelle version (upscale OU manual_edit) devient automatiquement `final`

**Source de vérité** pour Upscale et Propose updates = `chapters.final_version_id`.

## Phase A — autonome

### A.1 Migration V009 (déjà appliquée par user)

Cf. discussion. Crée `chapter_versions` + `chapters.final_version_id` + migre l'existant + drop `chapters.draft`/`content` + ajoute `user_settings.{upscale,proposals,extract}_tier`.

### A.2 Types & queries

- `Chapter` type : drop `draft`/`content`, add `final_version_id: string | null`.
- `ChapterVersion` type : id, chapter_id, world_id, owner_id, rank, parent_version_id, origin (`'draft'|'upscale'|'manual_edit'`), user_prompt, text, run_id, created_at, updated_at.
- `src/lib/queries/chapterVersions.ts` : `useChapterVersions(chapterId)`, `useCreateChapterVersion`, `useUpdateChapterVersion` (rare — pour corriger un user_prompt par exemple).
- `useUpdateChapter` : ajout `finalVersionId?`.
- `useCreateChapter` refacto : insère le chapter, **puis** v0 vide, **puis** set final_version_id = v0.
- `useUserSettings` : extend avec les 3 tier columns, defaults `best/medium/cheapest`.

### A.3 LLM modules

`src/lib/llm/upscale.ts` :
- Prompt : world memory + custom_prompt + entity cards (chacune avec son snapshot résolu au `chronological_rank` du chapter via `resolveStateAtRank`) + final version text + user_prompt + (optionnel : event snippets, defer si trop long).
- Tier : depuis `user_settings.upscale_tier` (default `best`).
- Blocking, retourne `string` (le nouveau texte).

`src/lib/llm/proposals.ts` :
- Prompt : world memory + final version text + entity cards (id, name, type, fields shape, current snapshot at chapter rank).
- JSON schema : `[{ entityId: uuid, fieldChanges: { [name]: value }, justification: string }]`. Validation Zod par entity (FieldDef-aware).
- Tier : depuis `user_settings.proposals_tier` (default `medium`).
- Blocking, retourne `Proposal[]`.

### A.4 ChapterScreen refondu

**Layout** : 3 cols `entities | editor | rightPanel`. Le rightPanel a 2 tabs en haut : `[ Versions ⚡ | Chat ]`. Default = Versions.

**Versions tab** :
- Header : "Versions ({n})"
- Liste verticale (newest at bottom) :
  - Radio button "final" à gauche
  - Label : `v0 — Draft` / `v1 — Upscale: "<user_prompt truncated>"` / `v2 — Manual edit`
  - Date/time
  - Click sur la row → sélectionne pour visualisation/édition dans l'éditeur principal
- Bottom : zone "Upscale" avec textarea + Send (= prompt l'upscale depuis la final).

**Editor (col du milieu)** :
- Affiche le texte de la version sélectionnée (default = final).
- Éditable. Quand modifié → bouton "Save changes as new version" en haut. Save crée `origin='manual_edit'`, parent = la version éditée, devient final.
- Si l'user clique une autre version sans save → confirm "Discard changes?" via `useConfirm`.

**Header chapter** :
- Back, title (editable), buttons : `Propose updates`, `Hide chat` (deprecated → on retire car maintenant tab), `Delete`.

**Auto-extract et highlights** : tournent sur le **texte de la version sélectionnée** (pour cohérence visuelle).

### A.5 ProposeUpdatesModal

- Liste des proposals returned by LLM.
- Chaque card :
  - `Iria (Personnages)` (lien fiche)
  - Diff par field : `age: 17 → 18` `title: (vide) → "Capitaine"`
  - Justification (italique, fg-muted)
  - Boutons : `[Accept] [Skip]`
- Top : `[Accept all] [Skip all]`
- Sur Accept : `useCreateEntityVersion` au `chapter.chronological_rank` avec `source_chapter_id` + snapshot complet (current snapshot + fieldChanges merged).

### A.6 Settings : tier per task

3 nouveaux selectors dans SettingsScreen :
- "Upscale tier" → cheapest/medium/best
- "Proposals tier" → cheapest/medium/best
- "Extract tier" → cheapest/medium/best (existant en code dur jusqu'ici)

Mutation via `useUpdateUserSettings` étendue.

## Phase B — user

Aucune. Migration V009 appliquée, edge function inchangée.

## Décisions tranchées

- **Append-only doux** : les rows existantes peuvent en théorie être UPDATE (RLS permissive sur update), mais l'app ne le fait jamais sauf cas exceptionnel (genre corriger un user_prompt). Édition crée une nouvelle row.
- **Final flag** : sur `chapters.final_version_id` (1 colonne FK), pas un boolean dispersé.
- **Auto-extract source** : la version **sélectionnée** dans l'UI (peut être ≠ final).
- **Upscale et Proposals source** : toujours la **final** (pas la sélectionnée). Cohérent : l'user flag ce qu'il considère canonique.
- **Pas de propose-new-fields** en v1 (Slice 7.x).
- **Pas de streaming** (Slice 7.x si besoin).
- **Mode improveDraft vs improveContent** simplifié à un seul flow (le concept content/draft disparaît).
- **Defer summaries S/M/L** en Slice 8 (colonnes laissées sur `chapters`).

## Tests Vitest visés

- `upscale.test.ts` : prompt builder snapshot, mock provider.
- `proposals.test.ts` : prompt builder, schema validation, parse de réponses LLM mockées.
- Eventuellement `chapterVersions.test.ts` : helpers de label + ordering (si on en extrait).
