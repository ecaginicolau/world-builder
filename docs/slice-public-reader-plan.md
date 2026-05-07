# Slice — Public Reader + Reader Annotations

**Goal** : permettre à l'auteur de partager un book à des lecteurs externes via un lien public, et collecter du feedback inline (👍 / 👎 / commentaire) sur sélection de texte. Style Notion mais simplifié.

**Stance** : post-V1, isolé du reste de l'app (pas de couplage RLS, pas de breakage). Une route `/r/:token` non authentifiée + une edge function dédiée. Le reste de l'app continue d'ignorer cette feature.

---

## Périmètre

### In
- Auteur crée des "share links" pour un book (token unique, active flag, allow_comments flag, expires_at par défaut +30 jours).
- Lecteur ouvre `/r/:token`, saisit son nom (persisté localStorage), navigue book → parts → chapters.
- Sur sélection de texte dans un chapter, mini-toolbar flottante (👍 / 👎 / 💬). Mobile = modal.
- Lecteur revoit ses propres annotations en surbrillance à la relecture (pas celles des autres readers, v1).
- Auteur voit dans son UI : liste des links, sessions par link (qui a lu, quand), feedback par chapter avec highlights cliquables → focus commentaire dans sidebar.
- Theme toggle dark (default) / light, persisté localStorage côté reader.

### Out (hors scope)
- Authentification du reader (juste un nom local, spoofable et c'est OK).
- Réponse de l'auteur aux commentaires (les commentaires sont read-only côté auteur en v1, à part suppression).
- Threads / mentions / notifications.
- Lecteurs voient les annotations des autres lecteurs.
- Diff / versioning des chapters côté reader (le link expose toujours la `final_version` actuelle au moment du fetch).

---

## Phase A — autonome

### A.1 Migration V016 (à appliquer par user avant code)

Fichier `supabase/migrations/V016__slice_public_reader.sql`. Idempotent.

**Tables** :

```sql
create table share_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  world_id uuid not null references worlds(id) on delete cascade,
  book_id uuid not null references books(id) on delete cascade,
  token text not null unique,
  label text,                       -- nom optionnel donné par l'auteur ("Bêta-lecteurs Q2")
  active boolean not null default true,
  allow_comments boolean not null default true,
  include_drafts boolean not null default false,  -- si true, les chapters status='draft' sont aussi visibles
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index on share_links (owner_id, created_at desc);
create index on share_links (book_id);

create table reader_sessions (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references share_links(id) on delete cascade,
  reader_local_id text not null,    -- uuid v4 généré côté navigateur, persisté localStorage
  name text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (share_link_id, reader_local_id)
);
create index on reader_sessions (share_link_id, last_seen_at desc);

create table reader_annotations (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references share_links(id) on delete cascade,
  reader_session_id uuid not null references reader_sessions(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  kind text not null check (kind in ('up','down','comment')),
  selected_text text not null,
  before_ctx text not null default '',
  after_ctx text not null default '',
  comment_body text,
  created_at timestamptz not null default now()
);
create index on reader_annotations (chapter_id, created_at desc);
create index on reader_annotations (share_link_id, created_at desc);
create index on reader_annotations (reader_session_id);
```

**RLS** : owner-scoped reads/writes sur les 3 tables (l'auteur depuis l'app utilise anon key). **Aucune policy public-anon** — tous les accès reader passent par l'edge function en service-role.

```sql
alter table share_links enable row level security;
alter table reader_sessions enable row level security;
alter table reader_annotations enable row level security;

-- share_links : owner full access
create policy share_links_owner on share_links
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- reader_sessions : owner read via join
create policy reader_sessions_owner_read on reader_sessions
  for select using (
    exists (select 1 from share_links sl where sl.id = share_link_id and sl.owner_id = auth.uid())
  );

-- reader_annotations : owner read + delete via join (delete pour modération)
create policy reader_annotations_owner_read on reader_annotations
  for select using (
    exists (select 1 from share_links sl where sl.id = share_link_id and sl.owner_id = auth.uid())
  );
create policy reader_annotations_owner_delete on reader_annotations
  for delete using (
    exists (select 1 from share_links sl where sl.id = share_link_id and sl.owner_id = auth.uid())
  );
```

### A.2 Edge function `public-reader`

`supabase/functions/public-reader/index.ts`. Service-role client. Single endpoint, dispatch sur `action` field du body. CORS open (`*`).

**Actions** :

| action | input | output | side-effect |
|---|---|---|---|
| `resolve_link` | `{token}` | `{book, parts[], chapters[] (id, title, reading_rank, part_id, status)}` filtered selon `include_drafts` (cf. décisions) | — |
| `register_session` | `{token, reader_local_id, name}` | `{session_id}` | upsert reader_sessions, bump last_seen_at |
| `get_chapter` | `{token, reader_local_id, chapter_id}` | `{chapter (title, final_version_text), my_annotations[]}` | bump last_seen_at |
| `post_annotation` | `{token, reader_local_id, chapter_id, kind, selected_text, before_ctx, after_ctx, comment_body?}` | `{annotation}` | insert; refuse si `allow_comments=false` et `kind='comment'` |
| `delete_my_annotation` | `{token, reader_local_id, annotation_id}` | `{ok:true}` | delete (seulement si `reader_session_id` correspond) |

**Validation systématique** sur chaque action :
- Token existe + `active=true` + `expires_at IS NULL OR expires_at > now()`. Sinon `403 link_invalid`.
- Pour les actions session-scoped : reader_session existe et matche le `share_link_id`.

**Rate limit minimal** : `post_annotation` refuse si > 60 annotations/heure pour cette session (count rapide en DB). Suffisant pour v1.

**Pas de log dans `runs`** (c'est pas du LLM). Les annotations sont elles-mêmes la trace.

### A.3 Reader app routes

Routes ajoutées au router racine (TanStack Router), **sans auth guard** :

- `/r/$token` → ReaderHomeScreen (TOC du book)
- `/r/$token/c/$chapterId` → ReaderChapterScreen

Layout entièrement autonome (`ReaderShell`) — n'utilise pas `AppHeader`, pas de sidebar, pas de Supabase client direct. Tous les fetch passent par un wrapper `callPublicReader(action, payload)` qui POST sur l'edge function avec `apikey: ANON` (pour passer la gateway, le check de token se fait dans la fonction).

**localStorage keys** :
- `reader:<token>:identity` → `{reader_local_id (uuidv4), name}`
- `reader:theme` → `'dark' | 'light'` (default dark)

**Premier accès** :
1. Resolve link. Si invalid → écran "Link invalid or expired".
2. Si pas d'identity en localStorage → modal "Quel nom veux-tu utiliser ?" (validation : non-vide, trim, max 60 chars). Save + register_session.
3. Sinon → register_session silencieusement (pour bump last_seen_at) puis afficher TOC.

### A.4 Reader UI — TOC + Chapter

**ReaderHomeScreen** :
- Titre du book + intro courte si `books.synopsis` existe (pas dans data-model actuel — skip ou ajouter colonne plus tard).
- Liste parts (h2) → liste chapters par `reading_rank`.
- Click → navigate `/r/$token/c/$chapterId`.
- Footer : nom du reader (cliquable pour changer), theme toggle.

**ReaderChapterScreen** :
- Header sticky : titre book / part / chapter, prev/next chapter, back to TOC.
- Body : Tiptap `editable: false` rendu de `final_version_text` (réutilise le même schema que ChapterScreen).
- Highlights de **mes propres annotations** (anchoring détaillé en A.6) — même les 👍/👎 sont surlignés (couleur selon kind : vert / rouge / jaune).
- Click highlight → popover avec mon commentaire (si comment) + bouton "Delete" qui appelle `delete_my_annotation`.
- Floating toolbar de sélection (détaillée en A.5).
- Width `max-w-prose`, line-height généreux, font lecture (Tailwind `prose prose-lg`).

### A.5 Selection toolbar (Notion-style)

`src/features/reader/SelectionToolbar.tsx` :
- Listener `selectionchange` sur le container du chapter. Debounce 50ms.
- Si selection non-vide ET contenue dans le chapter ET length ≥ 3 chars → calculer position via `getBoundingClientRect()` du range.
- Position : sous la sélection si y'a la place (≥ 50px de viewport restant), sinon au-dessus.
- Toolbar = 3 boutons : `👍` / `👎` / `💬`.
- Click 👍/👎 → `post_annotation` immédiat avec `kind='up'|'down'`, pas de commentaire. Toast confirmation.
- Click 💬 → ouvre input popover (textarea + Send + Cancel). Sur desktop = popover inline. Sur mobile (`window.matchMedia('(max-width: 640px)')`) = modal full-screen.
- Sur send → `post_annotation` avec `kind='comment'`, `comment_body=text`. Refresh annotations du chapter.

**Capture du contexte** :
- `selected_text` = `range.toString()`.
- `before_ctx` = 30 chars de plaintext avant le start de la selection (clamp si début du chapter).
- `after_ctx` = 30 chars de plaintext après le end.

### A.6 Anchoring (re-render des highlights)

`src/features/reader/anchorAnnotations.ts` (pure fn, testable) :

```
function findAnchor(plaintext: string, ann: Annotation): { start: number; end: number } | null
```

Algorithme :
1. Construire `needle = before_ctx + selected_text + after_ctx` (le plus discriminant).
2. `idx = plaintext.indexOf(needle)`. Si trouvé → retourne `{start: idx + before_ctx.length, end: idx + before_ctx.length + selected_text.length}`.
3. Sinon, fallback : `idx = plaintext.indexOf(selected_text)` — accepte la première occurrence. Si trouvé → retourne anchor sans contexte.
4. Sinon → null (orphaned, listée en sidebar côté auteur, non rendue inline).

Application :
- Côté reader : `ChapterRenderer` reçoit `text + annotations`, calcule les anchors, génère un Tiptap doc avec marks custom `<reader-annotation data-id=… data-kind=…>` autour des ranges. Tiptap mark plugin minimal.
- Côté auteur (A.8) : même algorithme, même rendering, mais avec onClick → focus du commentaire dans la sidebar.

### A.7 Author UI — Share links management

**Nouvelle section "Share" sur BookScreen** (déjà existant) :
- Bouton `+ Create share link` → modal : label optionnel, `allow_comments` toggle, `include_drafts` toggle (default off, hint "Show chapters that are not yet published"), `expires_at` (default `now + 30j`, picker date, "No expiration" possible).
- Table existante : label, URL `/r/<token>` avec bouton copy, active toggle, expires_at, sessions count, annotations count, action menu (deactivate, delete).
- Click ligne → page détail `/worlds/$worldId/books/$bookId/shares/$linkId` :
  - Header : URL + status + dates.
  - Tab "Readers" : table reader_sessions (name, first_seen_at, last_seen_at, annotations count, dernier chapter visité — déduit du max `created_at` sur annotations).
  - Tab "All annotations" : table flat groupée par chapter, click → naviguer vers le ChapterScreen avec query param `?focusAnnotation=<id>`.

### A.8 Author UI — Reader feedback dans ChapterScreen

VersionsPanel deviendra `Versions ⚡ | Summary | Chat | Reader feedback` (4 tabs).

**Tab Reader feedback** :
- Liste annotations pour ce chapter, groupée par reader (collapsible). Chaque item :
  - Kind icon (👍/👎/💬).
  - Selected text (italique, tronqué 100 chars).
  - Comment body si comment.
  - Reader name + date.
  - Bouton `🗑️` (delete via standard supabase client + RLS).
  - Bouton `↗ Focus` qui scrolle l'éditeur vers l'anchor et flash le highlight.

**Highlights inline dans l'éditeur** (mode read-only ou edit) :
- Overlay non-intrusif : marges latérales avec petits dots colorés au niveau de la ligne contenant l'annotation. Click dot → focus l'item dans la sidebar.
- En mode edit, ne bloque pas la frappe (les highlights sont décoratifs, pas des marks Tiptap stockés en DB).
- Si `?focusAnnotation=<id>` dans l'URL → auto-scroll + flash au mount.

Implémentation : un layer absolu au-dessus de l'éditeur qui calcule les bounding rects des anchors (même algo qu'en A.6) et rend des dots positionnés. Recalc on resize / on chapter content change.

### A.9 Theme toggle reader

Composant `ReaderThemeToggle` dans le footer du reader shell. Click → toggle `'dark' | 'light'`, persiste localStorage, applique class `reader-theme-light` ou `reader-theme-dark` sur le shell root. CSS scoped (pas d'impact sur l'app authoring).

Light mode : background `#fafaf7` (papier), text `#1a1a1a`, accents conservés. Dark mode : background `#0e0e10`, text `#e5e5e5`. Highlights : couleurs ajustées pour contraste suffisant dans les deux thèmes.

---

## Phase B — user

| # | Action | Où |
|---|---|---|
| B.1 | Apply `V016__slice_public_reader.sql` | Dashboard SQL editor |
| B.2 | Deploy edge function `public-reader` | `supabase functions deploy public-reader` |
| B.3 | Pilote live : créer link → ouvrir incognito → name → naviguer → annoter (👍/👎/comment) → revoir highlights → côté auteur voir feedback + delete | App + Chrome incognito |
| B.4 | Test mobile (DevTools mobile emulation) : selection + modal commentaire | Chrome DevTools |

Pas de nouveau secret côté env. La fonction utilise `SUPABASE_SERVICE_ROLE_KEY` déjà configuré.

---

## Décisions tranchées

- **Token = `crypto.randomUUID().replace(/-/g,'')` côté client auteur**, 32 hex chars. Unguessable. Pas de prefix/format spécial. Ne fuit aucune info.
- **Edge function plutôt que RLS public-anon**. Boundary serveur claire, validation centralisée, plus simple à raisonner que des policies anon avec custom JWT claims.
- **Reader voit uniquement ses propres annotations** (v1). Pas de feed social, pas de spoiler des autres bêta-lecteurs. Si un jour on veut "visible aux autres" = flag par link.
- **Visibilité des chapters configurable par link** : `include_drafts=false` (default) → seuls les chapters `status='published'` sont visibles. `include_drafts=true` → tous les chapters avec un `final_version_id` non null sont visibles, badge `DRAFT` côté reader sur ceux non publiés. Les chapters sans `final_version_id` (vides) restent cachés dans les deux cas.
- **Anchoring = `before_ctx + selected_text + after_ctx`** avec fallback `selected_text` first occurrence. Pas de PM positions, pas d'edits-aware diff. Si le texte change beaucoup → annotation orphaned, listée mais pas inline.
- **Default `expires_at` = +30 jours**. L'auteur peut override / désactiver l'expiration via picker. Évite les links zombies.
- **`allow_comments=false` désactive seulement `kind='comment'`** ; `kind='up'|'down'` reste possible (signal léger, pas exploitable comme vector spam).
- **Pas de notif auteur** quand un commentaire arrive (v1). À polish dans une slice ultérieure (badge sur la nav).
- **Suppression**: l'auteur peut supprimer toute annotation (RLS owner). Le reader peut supprimer **les siennes** via l'edge function (vérif `reader_session_id`).
- **Stockage du `reader_local_id` en plain localStorage** : si l'utilisateur clear son storage, il devient un nouveau reader. C'est OK.
- **Pas de bouton "edit" sur un commentaire reader v1**. Delete + recreate. Simplifie.

---

## Tests Vitest visés

- `anchorAnnotations.test.ts` :
  - match exact via context window
  - fallback first-occurrence si context cassé
  - return null si rien trouvé (orphaned)
  - multiple annotations, ordre stable
- `publicReaderClient.test.ts` (mock fetch) : envelope success / link_invalid / rate_limited.
- `selectionContext.test.ts` : extraction before/after context avec clamp aux bornes du document.
- Edge function : skip Vitest (pas dans le workspace), tester via curl en B.3.

## Tests Playwright visés (1 spec)

`tests/e2e/reader.spec.ts` :
- Auteur crée un link sur un book.
- Page incognito ouvre `/r/<token>`, saisit nom, voit TOC, clique chapter 1.
- Sélectionne du texte, click 👍, voit toast + highlight.
- Reload → highlight toujours là.
- Auteur retourne sur ChapterScreen, voit l'annotation dans le tab Reader feedback.

---

## Estimation

- **Migration + edge function** : 1.5h
- **Reader app (routes, TOC, chapter render, theme)** : 2h
- **Selection toolbar + anchoring** : 2h (le morceau le plus délicat — tester sur mobile tôt)
- **Author share-management UI** : 1.5h
- **Author feedback tab + inline highlights** : 1.5h
- **Tests + pilote live** : 1h

Total ≈ 9h, soit 2 sessions focus.

---

## Risques / open questions

- **Selection mobile iOS** : la sélection native iOS affiche son propre menu (Copy / Share / Look Up). Il faut tester si notre toolbar se superpose proprement ou s'il faut intercepter `selectionchange` après dismiss. Plan B = bouton flottant persistant "Annotate selection" si on n'arrive pas à faire cohabiter.
- **Tiptap render read-only** : on a déjà la pattern dans le reader view de slice 8 — réutilise.
- **Highlights inline dans l'éditeur auteur (mode edit)** : si trop intrusif, fallback à dots dans la marge seulement (pas d'overlay sur le texte). Décider après pilote.
- **Books n'ont pas de "synopsis"** dans le data-model actuel. Reader TOC affichera juste le titre. Si on veut une intro = ALTER TABLE séparé, hors scope.
