# Slice 7 — Demo : Upscale + Proposals + chapter text versioning

Walkthrough ~5 min pour re-valider à la main. Prérequis : V009 appliquée.

## 1. Découvrir le panneau Versions

1. Aller sur un chapter existant.
2. Le panneau de droite a deux tabs : **Versions ⚡** (par défaut) / **Chat**.
3. Versions affiche `v0 — Draft` au démarrage (avec radio "final" actif).
4. L'éditeur au milieu montre le texte de la version sélectionnée.

## 2. Upscale (avec prompt user-driven)

1. En bas du panneau Versions : zone textarea "Describe the upscale…".
2. Taper par exemple : *"Upscale en 3 phrases courtes, ajoute une brève description du paysage nocturne, garde les noms et faits inchangés. Réponds en français."*
3. Cliquer **Upscale** → loader 5-15s (tier `best` par défaut, configurable dans Settings).
4. Vérif :
   - Nouvelle row apparaît : `v1 — Upscale` avec le user_prompt en italique sous le label.
   - Radio "final" passe sur v1.
   - L'éditeur affiche le texte généré.
   - Highlights des entities (Maitre Sorn / Iria / etc.) appliqués.

## 3. Édition manuelle = nouvelle version au save

1. Dans l'éditeur, taper du texte (ex. ajouter un mot quelque part).
2. Une bannière jaune apparaît dans le panneau Versions : *"Unsaved manual edits in the editor"* + bouton `Save as new version`.
3. Cliquer → nouvelle row `v2 — Manual edit`, devient final, l'éditeur reflète le texte sauvé.

> Note : l'édition de la **draft (v0)** s'autosave en place (pas de nouvelle version). Les autres origines sont append-only — Save crée une nouvelle row.

## 4. Switcher de version + flag final

1. Cliquer la row `v0 — Draft` → l'éditeur affiche le texte du draft. Le bouton "final" reste sur v2.
2. Cliquer le radio "final" sur v0 → Maintenant le draft est la final. Upscale et Propose updates utiliseront ce texte.
3. Si tu as des unsaved edits quand tu switches → ConfirmDialog "Discard unsaved edits?" demande confirmation.

## 5. Propose entity updates

1. Header chapter : bouton **Propose updates** → modal s'ouvre.
2. Modal indique le nombre d'entities en scope (= linked entities du chapter).
3. Clic **Run analysis** → loader 10-20s (tier `medium` par défaut).
4. Liste des proposals retournées :
   - Pour chaque proposition : nom de l'entity (cliquable vers la fiche), diff par field (`bio: → "..."`), justification LLM en italique.
   - Boutons par card : `[Skip] [Accept]`. En haut : `Accept all` / `Skip all`.
5. Clic **Accept all** → chaque proposal devient une nouvelle `entity_version` au `chronological_rank` du chapter, avec `source_chapter_id = chapter.id` et `note_excerpt = justification`.
6. Status passe à "accepted" (vert) sur chaque card.

## 6. Vérifier sur la fiche entity

1. Aller sur l'entity (lien `Maitre Sorn` dans la modal, par ex.).
2. La liste des versions inclut la nouvelle version `at 📖 <chapter title>` avec le diff chip `bio` (et autres fields modifiés).
3. Selon le rank du chapter et celui des versions précédentes, la "current state" peut afficher la nouvelle valeur ou pas (si une version plus récente l'écrase) — **comportement correct** du modèle versionné.

## 7. Settings : tier per task

1. ⚙ → SettingsScreen → section "LLM tiers per task".
2. 3 selects : Upscale (default `best`), Proposals (default `medium`), Auto-extract (default `cheapest`).
3. Sauvegardé immédiatement à chaque changement.

## Garde-fous validés

- **Append-only doux** : les rows existantes restent, l'app ne les UPDATE jamais (sauf v0 draft via auto-save).
- **Final pointer unique** : `chapters.final_version_id` est un FK simple, pas de boolean dispersé.
- **Migration data** : tous les chapters existants ont reçu un v0 row au moment de V009 (avec `text = old draft column`). `chapters.draft` et `chapters.content` ont été dropées.
- **Rank ordering byte-wise** : le sort se fait côté client (`rows.sort(...)`), parce que Postgres default collation est case-insensitive et casse l'ordre `'01' < 'U' < 'j'` du fractional indexing.
- **Audit complet** : chaque entity_version créée par Accept proposal a `source_chapter_id` + `note_excerpt = justification LLM`. Les Upscale runs sont loggués dans `runs` (kind=`upscale`), proposals aussi (`propose_updates`).

## Pending UI

- Pendant un Upscale : banner `⟳ Upscaling… (this may take 5–30s)` au-dessus du bouton + bouton lui-même `⟳ Upscaling…` avec spinner + textarea grisée. Click hammering bloqué.
- Pendant un Propose updates : `⟳ Analyzing chapter… (this may take 5–30s)` dans la modal.

## Console attendue

Aucun erreur applicative. Les `[EXCEPTION] message channel closed` restent du bruit de l'extension Chrome.
