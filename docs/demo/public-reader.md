# Public Reader — share a book + collect inline feedback

## What it does

- Auteur génère un **share link** sur un book (token unique 32 chars).
- Quelqu'un avec le lien ouvre `/r/<token>`, saisit son nom (stocké en localStorage), navigue le book → parts → chapters.
- Sur sélection de texte dans un chapter, mini-toolbar flottante (👍 / 👎 / 💬). Notion-style.
- Le reader voit ses propres annotations en surbrillance (vert/rouge/jaune). Click sur une highlight = supprimer.
- Côté auteur : tab **Feedback** dans `ChapterScreen` + dots colorés dans la marge gauche du Tiptap. Click un dot = focus le commentaire dans la sidebar.
- Page détail link : liste des sessions reader + table des annotations, deletables.
- Theme dark (default) / light dans le reader, persisté localStorage.

## Pré-requis

1. **Migration V016** appliquée (3 tables : `share_links`, `reader_sessions`, `reader_annotations`).
2. **Edge function `public-reader`** déployée :
   ```bash
   supabase functions deploy public-reader --no-verify-jwt
   ```
   Secrets utilisés : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (déjà set).

## Walkthrough auteur

1. `/worlds/$worldId/books/$bookId` — scrolle en bas, panel **Public reader links**.
2. Click `+ Create link`.
3. Renseigne :
   - **Label** (optionnel, ex. "Bêta-lecteurs Q2")
   - ☑ **Allow comments** (default on)
   - ☐ **Include unpublished chapters (drafts)** (default off — seulement les chapters `status='published'`)
   - Expiration : 30 days (default) / Custom (date picker) / No expiration
4. Click `Create link` → la row apparaît avec l'URL `https://<host>/r/<token>`. Click `copy` à côté de l'URL.
5. Tu peux à tout moment :
   - Click la ligne → page détail (tab Readers + tab All feedback)
   - `Deactivate` (toggle) → le lien retourne `link_invalid` côté reader
   - `delete` → suppression cascade (sessions + annotations)

## Walkthrough reader (incognito)

1. Ouvre `/r/<token>` en navigation privée.
2. Modal "Welcome — what name should we use?" → saisis un nom → `Continue`.
3. TOC s'affiche : titre du book, parts, chapters cliquables.
4. Click un chapter → page de lecture, typo serif, large interlignage.
5. Sélectionne du texte → toolbar flottante apparaît juste sous (ou au-dessus si pas la place) :
   - 👍 / 👎 → save instantané, toast "Reaction saved"
   - 💬 → popover (desktop) ou modal (mobile <640px) avec textarea, Cancel / Send
6. Reload → tes annotations sont toujours surlignées (couleur selon kind).
7. Click une de tes annotations → confirm → delete.
8. Bouton du nom en haut à droite → modal pour changer le nom.
9. Bouton `☀ Light` / `☾ Dark` → toggle theme persisté.

## Walkthrough auteur — voir le feedback

1. Sur `ChapterScreen` du chapter annoté : nouveau tab **Feedback (N)** à droite du tab Chat.
2. Tab affiche la liste des annotations groupées par reader, avec :
   - Icône kind (👍/👎/💬), nom du reader, label du link, date.
   - Texte sélectionné en italique tronqué.
   - Body du commentaire si comment.
   - `↗ focus` → highlight l'annotation dans la sidebar (focus state).
   - `delete` → confirme + delete.
3. **Margin dots** : sur le côté gauche de l'éditeur, petits cercles colorés (vert/rouge/jaune). Click un dot → switch tab Feedback + focus l'item correspondant.
4. **Deeplink depuis la page détail link** : click "on <chapter title>" dans la table All feedback → `/worlds/.../chapters/$chapterId#ann=<id>` → ouvre la page chapter avec le tab Feedback déjà focused sur l'annotation.

## Anchoring (où sont stockées les sélections)

Chaque annotation stocke `{selected_text, before_ctx (~30 chars), after_ctx (~30 chars), chapter_id}`.

À l'affichage, on cherche `before + selected + after` dans le plaintext du chapter. Si trouvé → highlight inline. Sinon fallback sur `selected_text` seul (première occurrence). Sinon → "orphaned" (visible côté auteur dans le tab Feedback, pas inline).

→ **Conséquence** : si l'auteur édite massivement un chapter, les annotations qui pointaient sur ce passage deviennent orphelines mais restent listées. Pas de drift silencieux.

## Garde-fous

- **Token unguessable** : 32 hex chars (`crypto.randomUUID().replace(/-/g,'')`).
- **Validation à chaque appel edge fn** : token existe + active + non-expiré. Sinon `403 link_invalid`.
- **Session check** : reader_local_id (uuid localStorage) doit matcher une `reader_sessions` row attachée au link. Sinon `403 session_not_registered`.
- **Rate limit** : 60 annotations/heure/session. Au-delà → `429 rate_limited`.
- **Visibilité chapter** : si `include_drafts=false` (default), seules les `status='published'` accessibles. Sinon tous les chapters avec `final_version_id` non-null.
- **Cross-book guard** : `chapter_id` doit appartenir au book référencé par le link. Sinon `403 chapter_not_in_book`.

## Limites connues v1

- **Pas de notif auteur** quand un commentaire arrive. À vérifier en consultant la page détail link ou le tab Feedback.
- **Reader voit seulement ses annotations** (pas celles des autres readers). Si tu veux du social plus tard = flag par link.
- **Mobile iOS** : menu de sélection natif Safari (Copy/Share/Look Up) coexiste avec notre toolbar. Notre toolbar reste cliquable. Si conflit visuel : `selectionchange` se déclenche bien après que iOS a affiché son menu. À retester si feedback utilisateur.
- **Pas d'edit du commentaire reader** — delete + recreate.
- **Pas de threads / réponses auteur** — moderation = delete.

## Tests

- Vitest : `anchorAnnotations.test.ts`, `selectionContext.test.ts`, `renderAnnotatedHtml.test.ts` — 17 tests qui couvrent l'algo de re-localisation, capture de sélection, rendu HTML annoté.
- Playwright : `e2e/public-reader.spec.ts` — verify que `/r/<bad-token>` ne redirige pas vers login.
- Pilote live nécessaire pour la sélection toolbar (DOM-dependent).
