# Slice 5 — Timeline & Events — Demo guide

> ~3 min walkthrough pour valider la timeline, le reorder cross-table, et les events.

## Prérequis

- Connecté à l'app, au moins **1 world** ouvert.
- **Au moins 1 chapter** existant dans ce world (Slice 4 — sinon crée-le vite via `Books → un book → un part → + Chapter`). Idéalement nomme-le pour qu'on le reconnaisse.
- Migration **V007 appliquée** (sinon la timeline rend une erreur PostgREST rouge sur les events).

## Setup en 30 s

1. Depuis le world dashboard, clique le tab **`Timeline`** 📅 dans le header.
2. Vérifie : URL passe à `/worlds/.../timeline`, le chapter existant apparaît dans la liste avec son contexte (`📖 Chapter · <Book> · <Part>`), et le compteur en haut à droite affiche `1 chapter · 0 events`.

## Golden path

1. **Créer un event** : tape `La Grande Bataille` dans l'input du haut, clique **+ Event**.
   - ✅ Le compteur passe à `1 chapter · 1 event`.
   - ✅ Le nouvel event apparaît **en bas** de la liste (rank > chapter).
2. **Reorder ↑** : sur la ligne de l'event, clique le triangle haut.
   - ✅ L'event remonte au-dessus du chapter.
   - ✅ Le triangle haut de l'event devient grisé (déjà premier).
3. **Reorder ▼** : sur l'event (toujours), clique le triangle bas.
   - ✅ L'event redescend sous le chapter.
4. **Edit l'event** : clique `edit` sur la ligne event.
   - ✅ Un panneau s'ouvre sous l'event avec `Title`, `Description` (textarea), `Tags`.
   - Tape une description multi-ligne et des tags séparés par des virgules (ex : `war, off-screen`), clique **Save**.
   - ✅ Le panneau se ferme. La ligne event affiche `📅 Event · war, off-screen` en header et la description en gris dessous (line breaks préservés).
5. **Promote une note → event** : retourne sur `Notes` (header), ouvre n'importe quelle note avec du contenu.
   - ✅ Le header de la note a un bouton **`Promote → event`** entre `Promote → chapter` et `Archive`.
   - Clique-le. Modal `Promote to event` s'ouvre avec un input title, un input tags optionnel.
   - Saisis un titre (ex : `Rencontre à la Forteresse`) et des tags, clique **Promote**.
   - ✅ Redirige automatiquement vers `/timeline`. Le compteur passe à `1 chapter · 2 events`. Le nouvel event est en bas, sa **description** = le texte plain de la note.
6. **Delete un event via ConfirmDialog** : sur l'event créé en (1), clique `delete`.
   - ✅ Une modal themed sombre apparaît : `Delete event "La Grande Bataille"?`, deux boutons : `Cancel` et **`Delete`** (en rouge).
   - Clique **Delete** (ou tape `Enter`).
   - ✅ L'event disparaît, compteur à `1 chapter · 1 event`. Pas d'erreur dans la console.

## Edge cases à essayer

- **Boutons reorder bornés** : sur le tout premier item, le `↑` est grisé ; sur le tout dernier, le `▼` est grisé.
- **Reorder un chapter** : clique `▼` ou `↑` sur la ligne du chapter dans la timeline → seul son `chronological_rank` change. Va sur `Books → ce book → son part` : l'ordre du chapter dans la part (`reading_rank`) est resté identique. C'est le pattern flashback.
- **Edit puis Cancel** : ouvre l'edit panel d'un event, modifie quelque chose, clique `Cancel` → rien n'est sauvé, le panel se ferme.
- **ConfirmDialog dismiss** :
  - Clique le delete d'un event puis : tape **`Esc`** → cancel
  - Refais : clique **en dehors** du dialog (sur le backdrop sombre) → cancel
  - Refais : tape **`Enter`** sans rien → confirme et delete
- **Promote → event sans titre** : ouvre le modal Promote, vide le titre, le bouton `Promote` se désactive (disabled tant que titre vide).
- **Pas de console error** : ouvre la devtools console pendant tout le flow → seule erreur attendue est l'`asynchronous response` warning de Chrome extension (pas applicatif).

## Ce que tu ne verras pas (out of scope Slice 5)

- Drag-and-drop : on a fait `↑↓` exprès — dnd-kit en Slice 5.x si demandé.
- Couleurs par tag d'event : juste du texte gris.
- Filtres / recherche dans la timeline : Slice 8.
- Timeline horizontale type Gantt : non, liste verticale c'est tout.
