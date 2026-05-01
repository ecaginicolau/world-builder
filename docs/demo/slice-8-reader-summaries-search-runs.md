# Slice 8 — Reader · Summaries · PCC · Search · Published · Runs

Walkthrough ~5-7 min pour re-valider tout slice 8 à la main.

## Pré-requis

- V010 appliquée (3 search_text columns + triggers + GIN indexes + `worlds.previous_chapter_context` + `user_settings.summarize_tier`).
- Au moins un world avec 3+ chapters dans des books/parts pour tester la PCC.
- `.env.local` avec `VITE_LLM_PROVIDER=openai` + edge function llm-call déployée pour les LLM features.

## 1. Reader view

1. `[📖]` dans l'AppHeader → page TOC.
2. Click un book → expand/collapse. Vois la liste des parts puis chapters dans l'ordre `reading_rank`.
3. Chaque chapter affiche un badge `DRAFT` ou `PUBLISHED`.
4. Click un chapter → page lecture, typo prose, max-w-3xl. Title + badge si draft.
5. Click sur un nom d'entité highlighted → mini-popup avec snapshot au `chronological_rank` du chapter.
6. Boutons `← Prev` / `Next →` dans le header sticky pour parcourir.
7. `← Contents` revient à la TOC.

## 2. Summaries S/M/L

1. Ouvrir un ChapterScreen avec du texte dans la final version.
2. Right panel → click tab `Summary`.
3. 3 sections (S/M/L). Click `Generate` sur S → ⟳ Generating… → texte rempli automatiquement.
4. Edit la textarea → bouton `Save` s'active. Save → persiste dans `chapters.summary_s`.
5. Re-`Generate` quand un texte existe → confirm modal "Replace existing?" → OK overwrite.
6. Tier configurable : Settings → "Summarize" tier (default `cheapest`).

## 3. PCC (Previous-Chapter Context)

1. Settings → section "Previous-chapter context (PCC)".
2. Édite la liste (chips colorés) :
   - `← →` pour reorder (slot 1 = chapter le plus récent).
   - `×` pour remove.
   - `+ raw / + L / + M / + S` pour ajouter.
   - `Reset to default` → `[raw, L, M, S, S, S]`.
3. Saved instantanément (badge "Saved" vert).

### Validation upscale + PCC

1. Ouvrir un ChapterScreen qui a au moins **un chapter précédent** dans le world (par `chronological_rank`).
2. Right panel → tab `Versions`. Form upscale en bas.
3. Checkbox **`Include previous N chapters as context`** (visible si PCC.length > 0).
4. Pré-requis pour que le `raw` slot fonctionne : le chapter précédent doit avoir une final version. Pour les slots S/M/L : doit avoir le summary correspondant (sinon fallback automatique S→M→L→raw).
5. Tape un prompt upscale, Send → le LLM voit en plus un bloc `# Previous chapters` dans son system prompt.
6. Vérifie que le résultat respecte le contexte des chapters précédents.

### Validation chat + PCC

1. ChapterScreen → tab `Chat`.
2. ⚙ → drawer paramètres : checkbox "Include previous N chapters as context" (default ON).
3. Send un message → le LLM reçoit le PCC en contexte.

## 4. Search global

1. AppHeader → 🔍 (ou Ctrl/Cmd+K).
2. Tape ≥ 2 chars → résultats groupés `Notes (N) / Chapters (N) / Entities (N)`.
3. Click un hit → navigate vers la page correspondante.
4. ESC ou click outside → ferme.

## 5. Chapter `published` flag

1. ChapterScreen header → bouton vert `Publish`.
2. Click → status passe à `published`, `published_at = now()`. Badge `PUBLISHED` visible. Tous les writes désactivés :
   - Title input : read-only.
   - NoteEditor : `editable: false`.
   - Versions panel : pas de save manual edit, upscale form disabled (placeholder dit "Unpublish to upscale").
   - Summary panel : Generate/Save disabled.
   - Propose updates button : disabled, tooltip "Unpublish to propose updates".
3. Click `Unpublish` → tout redevient éditable.

## 6. Runs history

1. Footer 📊 (Monitoring panel) → click `View all →` (en haut à droite).
2. Page `/runs` :
   - Filtres : Kind (chat/upscale/proposals/summarize/extract/all), Status (success/error/cancelled/all), Range (today/7d/30d/all).
   - Table avec timestamp, kind, model, status (coloré), duration, tokens (in/out).
   - Click une row → expand `input_summary` JSON (+ `error_message` si error).
   - Pagination Prev/Next (50 par page).
   - Top-right : agrégats sur la page courante + total filtré.
3. Le footer Monitoring continue à fonctionner indépendamment comme raccourci 20 derniers runs.

## Ce qui n'est PAS dans Slice 8

- **Streaming** sur upscale/summary (génération bloquante, OK jusqu'à 30s).
- **Versioning des summaries** (overwrite à chaque generate).
- **Mode "published only" du Reader** (toggle pour cacher les drafts).
- **Stats agrégées sur tout le history** (page Runs ne fait que la page courante côté client).
- **FTS multilingue** (`'simple'` config sans stemming, multilingue-safe par accident).
- **Snippet highlighting** (le snippet montre 200 chars autour du match, pas de surlignage).
- **Versioning de chapter au moment du publish** — le toggle est pur, pas de snapshot fige.
