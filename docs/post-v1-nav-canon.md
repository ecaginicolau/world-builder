# Post-v1 — Nav redesign + Canon expansion

**Document vivant.** Brainstorm en cours, mis à jour au fil des discussions. Cette session-ci = brainstorm + 2 quick fixes sur le versioning (cf. § "Polish déjà livré"). Les chunks listés ici sont à attaquer dans des sessions futures, indépendamment.

## Contexte

V1 livrée (Slices 0-8). En usage réel sur un projet d'écriture, 3 frottements :

1. **Nav plate ne reflète pas les 3 modes mentaux de l'app.** Aujourd'hui : `Notes / Entities / Books / Timeline / Read`. Mentalement, le user travaille en :
   - **Brainstorm** = `Notes`
   - **Canonical / ground truth** = `Entities + Timeline` (ce qui est vrai du monde, indépendamment de la narration)
   - **Narrative** = `Books + Read` (l'histoire racontée)
2. **Entity types et entities se font concurrence visuellement** sur la même page alors que types = config rare, entities = contenu quotidien.
3. **Events sous-exploités.** Juste `title + description text + tags`. Pas de chat IA, pas de participants, pas de "propose updates". Asymétrie forte avec chapters.

## Macro-décisions tranchées (brainstorm 2026-05-02)

> ⚠ Cette section a évolué pendant le brainstorm. La version courante reflète le modèle "events-first canon" (point 4 ci-dessous), qui supersede certaines décisions intermédiaires précédentes (chapter avec `chronological_rank`, `events.chapter_id` 1:M, etc.). L'historique des versions intermédiaires est conservé en bas du doc dans § "Évolution du brainstorm".

1. **3 modes = bon cadre conceptuel** mais **pas de sous-menus / routes nestées**. L'appbar reste plate, avec groupement **visuel** (séparateurs + couleur).
2. **Entity types relégués** derrière un bouton (pas derrière une route distincte). Probablement `⚙ Types` en haut à droite de `/entities`, ouvre une modal ou une page secondaire.
3. **Pas de table `documents` unifiée chapter+event.** Garder les 2 tables. Factoriser **composants UI et helpers** (chat workspace, propose updates modal, context builder paramétré).
4. **Le canon = events (uniquement). Chapter = retelling narratif.**
   - `entity_versions` proviennent **uniquement d'events**, jamais directement d'un chapter. Un chapter peut **déclencher** une analyse LLM, mais le résultat passe par un funnel à 2 étapes : (1) propose **events à créer ou lier**, (2) ces events génèrent ensuite leurs `entity_versions`.
   - **Chapter ⟷ Event = many-to-many** via une pivot `chapter_events (chapter_id, event_id, narrative_rank)`. Un même event peut être raconté dans plusieurs chapitres (flashback, rappel en dialogue). Le `narrative_rank` = ordre de récit dans le chapter (≠ chronological_rank de l'event).
   - **Chapter perd son `chronological_rank`.** Sa position chronologique est **dérivée** de ses events liés. Il ne garde que `reading_rank`. Auteur ne place plus le chapter dans la timeline — il place ses events.
   - **Chapter sans events liés** = présent dans le narrative tree (Books > Parts > Chapters) mais **absent de la timeline** jusqu'à ce qu'au moins 1 event soit lié.
5. **Timeline (canonical view)** : events en liste chronologique primary, chapters apparaissent comme **chips/badges sur chaque event** ("📖 Ch. 3 · Ch. 5") indiquant dans quels chapitres l'event est raconté. Events off-screen (aucun chapter chip) visuellement distincts. Vue séparée "narrative" par chapter (events en `narrative_rank`) pour le travail côté chapter.
6. **Events = workspace "chapter-light"** : chat IA + participants + propose updates + description riche (Tiptap mini). **PAS** d'upscale, **PAS** de versions de texte, **PAS** de summaries S/M/L.
7. **Pas de rétrocompat des données existantes** — pré-MVP, la data en DB est de la data de test. (d) drop tout : `chapters.chronological_rank` enlevé, `entity_versions.source_chapter_id` / `source_chapter_version_id` enlevés, contenu existant des entity_versions reset. Discipline rétrocompat reprend une fois MVP en prod.
8. **Un chapter ne peut pas exister sans au moins 1 event lié** (règle métier, pas contrainte SQL). UI le force aux entry points : création de chapter via "+ New chapter" demande un titre de chapter + titre du premier event ; promote note → chapter idem (titre d'event pré-rempli depuis la note) ; chapter né depuis un event existant ("retell this event"). Si un chapter perd tous ses events (delete cascade ou unlink manuel), il devient invisible en timeline mais reste accessible dans le narrative tree avec un badge "no events linked — add one".
9. **Entity peut exister sans event ; les entity_versions ont un event source — sauf l'initiale.** Règle stricte :
   - À la création d'une entity, on insère automatiquement une v0 (`source_event_id = null`, snapshot = valeurs initiales saisies).
   - **Toute autre `entity_version` a `source_event_id` non-null** (vient d'un event, créé via le flow propose canon ou directement depuis l'EventScreen).
   - Enforcement DB : index unique partiel `entity_versions_single_init on entity_versions (entity_id) where source_event_id is null`.
   - NewVersionModal direct disparaît : pour modifier l'état d'une entity, il faut passer par un event (créer un event "manual edit at rank X" ou attacher à un event existant). Permet de garder la traçabilité du canon.

## Chunks (par ordre de risque croissant)

### a. Cosmétique appbar — groupement visuel par mode ✅ LIVRÉ (2026-05-02 PM)

**Goal** : que le user voie d'un coup d'œil les 3 modes sans cliquer.

**Palette retenue — "Writer's desk"** (encre / parchemin / cuir relié)
- `--mode-brainstorm: #7dd3fc` (sky-300, encre fraîche)
- `--mode-canon: #d97706` (amber-600, sceau de cire / parchemin)
- `--mode-narrative: #9f1239` (rose-800, cuir bordeaux)

Cohérent avec le ton "world-builder", assez sourd pour pas crier sur le dark theme, distinct au coup d'œil.

**Tasks**
- Définir les 3 CSS vars (`--mode-brainstorm`, `--mode-canon`, `--mode-narrative`) dans `index.css` ou équivalent.
- AppHeader : réordonner les tabs en `[Notes] | [Entities · Timeline] | [Books · Read]` (séparateurs `|` ou gaps). Tab actif = bordure colorée selon son mode.
- Réutiliser ces couleurs ailleurs où ça aide :
  - dot dans la rail timeline d'`EntityDetailScreen`
  - badge sur les notes promues vers chapter/event/entity (couleur = mode de la cible)
  - hint colorée sur les boutons "Promote → entity / chapter / event"

**Estimation** : ~1h. Pas de modèle DB. Pas de routing. Pure cosmétique.

**Critères de validation**
- Switch `Notes → Entities → Books` montre 3 couleurs distinctes dans l'underline du tab actif.
- Aucun CLS / regression visuelle sur les pages.

### b. Reléguer entity types — édition derrière un bouton ✅ LIVRÉ (2026-05-02 PM)

**Goal** : `/entities` redevient une vraie page de travail sur les entités, pas un mélange config + contenu.

**Tasks**
- Sur `/entities`, retirer la section "Entity types" du flow principal. Ajouter un bouton `⚙ Types` en haut à droite (ou à côté du `+ Entity name`).
- Click → modal `EntityTypesEditor` (ou navigation vers `/entity-types` si on préfère page entière — TBD).
- Garder le color picker, l'add/edit/delete de fields, l'add/delete de type.
- Conserver les filtres "Items × Lieux × Personnages ×" sur la page entities — c'est de la nav, pas de la config.

**Estimation** : ~1h.

**Critères de validation**
- `/entities` ne montre plus de section "Entity types" en flux principal.
- Le bouton `⚙ Types` ouvre tout le scope d'édition de types qu'on avait avant.
- Pas de régression sur la création d'entité (le `<select>` du type fonctionne).

### c. Page Entities enrichie — vraie page de travail ✅ LIVRÉ (2026-05-02 PM)

**Notes d'implém** :
- Pas de migration `entity_types.preview_fields` — on prend automatiquement les 2 premiers fields utilisables du type (string/text, hors `alive`) via le helper local `pickPreviewFields`. Si un control fin par type devient utile, ressortir la migration.
- **Type tabs ajoutées** post-livraison (retour user) : barre de tabs "All N" + un tab par type (avec compteur), au-dessus de la liste. Tab actif = chip pastel + texte coloré (couleur du type). Quand un type unique est sélectionné, le heading de groupe disparaît. Compteurs reflètent l'état post-search/post-hide-dead.

**Tasks** (mini-slice, ~½ journée)
- **Search bar** au top : filtre client-side (debounced 150ms) sur `name + aliases`. Indispensable au-delà de ~30 entités.
- **Filtre "vivants au rank N"** (optionnel, pour Personnages) : si le type a un field `alive` boolean, picker de rank chronologique → cache la liste à ce qui est vivant. Utilise `resolveStateAtRank`.
- **Aperçu inline du state actuel** : afficher 1-2 fields clés du type sur chaque row (configurable par type via une nouvelle colonne `entity_types.preview_fields text[]`). Évite d'ouvrir chaque entité.
- **Tri** : par nom (default), par "dernière update" (= max `entity_versions.created_at`), par rank de première apparition (min `valid_from_rank`).
- Conserver le grouping par type, le quick-create par type, les chips colorées.

**Skip** (volontairement, mono-auteur 50-200 entités) : bulk ops, drag & drop, tags personnalisés.

**Migration potentielle** : `entity_types.preview_fields text[] default '{}'`. Petite, isolée.

**Critères de validation**
- Sur un world peuplé : chercher "Iria" filtre la liste à 1 row. Effacer rétablit tout.
- Filtrer "vivants au chapitre 3" cache les morts.
- L'aperçu inline montre `bio (court)` sur Personnages sans clic.
- Tri par "dernière update" remonte les entities récemment modifiées.

### d. Event upgrade — events comme source canonique + funnel d'extraction depuis les chapters

**Goal** : passer du modèle "chapters comme source canon" au modèle "events comme source canon, chapters comme retellings". Workflows bottom-up (note→event→chapter) et top-down (chapter draft→propose events→accept→entity_versions) tous deux fluides.

**Tasks**

- **Migration `V012`** (pré-MVP, on drop la data existante — cf. macro-décision 7) :
  - `alter table events add column description_html text` — édition riche (Tiptap mini : paragraph + bold/italic + lists, pas plus).
  - Garder `events.description text` pour search_text/fallback plain.
  - Nouvelle pivot `chapter_events (chapter_id, event_id, narrative_rank)` — M:M, `narrative_rank` = ordre de récit dans le chapter (text-fractional). Index `(chapter_id, narrative_rank)`. Cascade delete des deux côtés.
  - Nouvelle table `event_participants (event_id, entity_id, pinned_manually)` — calque de `chapter_participants`.
  - `alter table entity_versions drop column source_chapter_id`, `drop column source_chapter_version_id` (cette dernière n'aura été ajoutée que si V011 a été appliquée — sinon n'existe pas).
  - `alter table entity_versions add column source_event_id uuid references events(id) on delete set null`.
  - `alter table chapters drop column chronological_rank` (la position chrono d'un chapter est désormais dérivée de ses events liés).
  - `truncate entity_versions` (data de test, on reset).
  - `alter table chapters add column last_analyzed_at timestamptz` — pour le badge "stale prose, re-run analysis" dans le header.
  - `create unique index entity_versions_single_init on entity_versions (entity_id) where source_event_id is null` — enforcement de la règle "exactement 1 version initiale par entity".
- **Route dédiée** `/worlds/$worldId/events/$eventId`.
- **`EventScreen`** layout 3-col (mêmes proportions que ChapterScreen) :
  - Colonne 1 : description editor (Tiptap mini) + bouton "Propose entity updates from this event".
  - Colonne 2 : `LinkedEntitiesPanel` (via `EventLinkSource`) + `DetectedEntitiesPanel`.
  - Colonne 3 : `ChatPanel` avec `parentKind = 'event'`.
  - **Header** : section "Told in chapters: [chip Ch.3 ×] [chip Ch.5 ×] [+ Link chapter…]". Lien M:M depuis l'event vers ses chapters.
- **`ChapterScreen`** étendu : panel "Events covered" (liste des events liés via `chapter_events` ordonnés par `narrative_rank`, drag-to-reorder, "+ Link existing event" et "+ New event from this chapter"). L'analyse "Propose updates" sur un chapter devient **"Propose canon from chapter"** : LLM retourne des candidats event (title + description + suggested entity participants + suggested entity diffs). User accepte → events créés et liés au chapter.
  - **UX du panel Events covered** :
    - Vertical drag list (dnd-kit), drag handle `⋮⋮` à gauche de chaque row, pour reorder le `narrative_rank`. Row = titre event + description courte (1 ligne) + chips participants.
    - Bouton "Toggle chronological view" en haut du panel : bascule en read-only ordonné par `event.chronological_rank`. Permet de vérifier qu'aucun flashback non-intentionnel n'a glissé. Drag désactivé en chrono view.
- **`chapters.last_analyzed_at` timestamp** : ajouté en V012. Update à chaque accept de "Propose canon from chapter". Si `final_version_id` updated_at > `last_analyzed_at` → badge "Prose changed since last canon analysis — re-run?" dans le header du chapter. Pas bloquant, juste un nudge.
- **Pas de versioning d'event** : les events sont des faits atomiques. Si un event devient stale, on l'amende ou on en crée un nouveau ; pas de chaîne `event_versions`. Un re-run de l'analyse peut générer des updates additionnelles sur un event existant (extension de description, nouveaux participants, nouveaux entity diffs).
- **`useEventLinkSource` + `eventParticipants.ts` queries** — calques de `useChapterLinkSource`.
- **`ProposeUpdatesModal` étendu** :
  - Côté **event** : direct, comme avant — entity_versions créées avec `source_event_id`, rank dérivé du chrono rank de l'event.
  - Côté **chapter** : flow funnel — au lieu de créer entity_versions directement, propose events. Modal renommé conceptuellement **"Propose canon from chapter"**.
  - **Ordre des inserts à l'accept d'un event proposé** :
    1. Créer les entities nouvelles que le LLM propose (insert `entities`).
    2. Insert l'event (`events`).
    3. Insert `chapter_events` (lien event ↔ chapter, avec `narrative_rank` = nextRankAfter(events déjà liés à ce chapter)).
    4. Insert `event_participants` (lien event ↔ entities existantes + nouvellement créées).
    5. Insert les `entity_versions` (avec `source_event_id` = event.id, rank dérivé du chrono rank de l'event via helper symétrique à `rankAfterChapter`).
    Séquentiel, 1 transaction si possible (sinon await chain côté app avec rollback best-effort).
  - Layout 2 niveaux :
    ```
    ▼ EVENT: "Iria rencontre Maitre Sorn"           [✓]
      description: "Au pied de la forteresse, Iria…"
      participants: [Iria] [Maitre Sorn]
      Entity updates from this event:
        • Iria.bio → "Jeune femme intrépide…"  ✓
        • Maitre Sorn.bio → "Vieux maître…"    ✓
    ▶ EVENT: "Edran Voss observe de loin"           [✗]
    ```
    Toggle ✓/✗ au niveau event ET au niveau chaque diff. Accept event = insert event + chapter_events + entity_versions filtrées par les ✓ internes. Skip event = rien.
  - **Re-analysis** : bouton "Run again" sur le même modal. LLM reçoit en contexte la prose + les events déjà liés au chapter + leurs diffs déjà appliqués → propose (a) nouveaux events, (b) updates sur events existants ("ce paragraphe précise X à ajouter à l'event Y"), (c) flag d'orphelins éventuels (event lié plus présent dans la prose — signaler, pas auto-delete).
- **Context LLM** :
  - Sur un event : (1) la description de l'event, (2) les chapters parents (description courte ou linked entities) si présents, (3) les events précédents (chrono). Settings "events context size" parallèle de PCC.
  - Sur un chapter (analyse) : la prose du chapter + les events déjà liés (pour ne pas re-proposer ce qui est déjà canon).
- **TimelineScreen — refonte canonical-first** :
  - Liste chronologique **d'events**.
  - Chaque event row : titre + description courte + chips d'entity participants + **chips de chapters** où il est raconté ("📖 Ch. 3 · Ch. 5"). Click chapter chip → ouvre le chapter.
  - Events off-screen (aucun chapter chip) : marqueur visuel discret (italique ou icône `(off-canvas)`).
  - Filtre : "show only off-screen events" / "show events in chapter X" / "show all".
  - Pas de bandes / divisions par chapter (un même chapter chevauche, donc une bande cohérente n'existe pas).
- **`ChapterDetailScreen`** dédié à la vue narrative : events couverts, en `narrative_rank` (drag to reorder), pour visualiser l'ordre du récit.
- **Bouton "Promote → event"** (existant) : modale offre picker multi-select "Link to chapters: [Ch.3, Ch.5, …] (optional)".
- **Création de chapter — flow obligeant 1 event** :
  - "+ New chapter" dans Part : modale demande `chapter title` + `first event title` (required) + `first event description` (optional). Insert chapter + insert event + insert chapter_events en séquentiel avec rollback côté app si l'event ou la pivot rate.
  - "Promote note → chapter" : modale étendue, demande `chapter title` (pré-rempli) + `first event title` (pré-rempli depuis note title). Behind the scenes : insert event au passage avec description = htmlToPlainText(note.content) ou similaire.
  - "Retell this event as a chapter" depuis EventScreen : crée un chapter dans un Part choisi + lien chapter_events automatique. Pas de saisie supplémentaire d'event.
  - Si un chapter perd tous ses events (delete d'event cascade vers chapter_events, ou unlink manuel) : pas de delete auto du chapter ; affichage avec badge "no events linked" + nudge "Add an event to make this chapter appear in the timeline".

**Skip** : upscale (l'event est factuel, pas narratif), versions de texte sur events, summaries S/M/L sur events.

**Critères de validation**

- Créer un event "Iria perd sa main", le lier aux chapters "Confrontation" et "Souvenirs" (flashback) → l'event apparaît dans la timeline avec 2 chips de chapter ; chaque chapter a l'event dans son panel "Events covered".
- Chat sur l'event répond avec contexte (description event + chapters parents + entities liées).
- Propose updates depuis l'event crée des `entity_version` avec `source_event_id` au rank dérivé.
- "Propose canon from chapter" sur Confrontation → propose 3 events candidats → accept all → 3 events créés et liés au chapter, leurs entity diffs sont dans `entity_versions` avec `source_event_id`. **Aucun `entity_version` n'a `source_chapter_id` rempli pour ce flow nouveau.**
- Off-screen event (chips chapters vide) reste cliquable, éditable, et est marqué visuellement.
- Un event lié à 2 chapters n'apparaît qu'une fois dans la timeline (déduplication).

**Risque architectural** : factoriser proprement chapter/event sans dupliquer 80% du code. Le test = quand on touche un bug commun, on le fixe à un seul endroit. Pattern à suivre : composants génériques `<AIWorkspace />` + `LinkSource` abstraite + `ProposeContext` interface.

**Migration des données existantes** : pré-MVP (cf. macro-décision 7), on drop la data de test. Pas de stratégie de rétrocompat à coder. Truncate `entity_versions` dans V012 ; les `chapter_participants` existants peuvent être migrés vers `event_participants` via une utility one-shot ou abandonnés.

**Question ouverte sur la résolution d'entity state**

Avec events comme source canon, la rail timeline d'`EntityDetailScreen` affiche directement les anchors "after Event Y" (chronologique). Les chapters ne sont plus des anchors — ils n'ont plus de rank chrono. La rail devient plus pure : initial → after event 1 → after event 2 → … → current. Plus de confusion "après le chapitre 3" puisque le chapter n'a plus de rank chrono propre.

À spec quand on attaque (d).

### Reader — ordre de lecture et état des popups

**Ordre de lecture** : déjà résolu via `chapters.reading_rank` (within `parts`, within `books`), full author-controlled, indépendant des events. Pas de changement.

**État des entity popups** : pour v1, simplement le **current state** (latest version de chaque entity). Simple, suffit pour l'auteur qui relit son brouillon. La résolution chrono fine (état "as of this chapter" pour spoiler-free beta readers, anchor explicite per chapter, etc.) est un raffinement **post-MVP** — déplacé en backlog.

## Polish déjà livré (cette session, 2026-05-02)

### `rankAfterChapter` — bug fix accept de proposals

**Symptôme** : accepter une "Propose updates" créait une `entity_version` au rank exact du chapitre. S'il existait déjà une version à ce rank (re-clic, ou promotion antérieure), `resolveStateAtRank` retournait l'ancienne (comparaison stricte `>` dans la boucle). Bug : "version créée mais pas la dernière".

**Fix** : nouveau helper `rankAfterChapter(chapterRank, timelineItems, entityVersions)` dans [versioning.ts:96](../src/features/entities/versioning.ts:96). Calcule un rank fractionnaire strictement entre le chapitre et le prochain item de timeline, en évitant les versions existantes. Wired dans [ProposeUpdatesModal.tsx:178](../src/features/chapters/ProposeUpdatesModal.tsx:178).

**Sémantique secondaire** : la version créée est désormais labellée "after Chapter X" (plus "at"), ce qui matche le mental model du user ("la perte de la main = à la fin du chapitre, pas au début").

**Validation** : 4 nouveaux tests Vitest, typecheck ok, smoke Chrome live sur Iria — la rail montre "after Confrontation à la forteresse · 5 updates" (= les doublons hérités d'avant le fix).

### `TimelineRail` — UX states-as-timeline

**Avant** : `<select>` "Show state as of" + une liste plate de versions en bas.

**Après** : sidebar gauche cliquable, anchors en ordre chronologique top→bottom (`initial → after item 1 → ... → — current —`). Dot rempli si une version commence à cet anchor + count d'updates. Click → met à jour le state à droite. Le panneau de droite liste les versions de l'anchor sélectionné avec diff chips + excerpt.

**Helpers introduits** dans `versioning.ts` : `TimelineAnchor`, `buildAnchors`, `anchorLabel`, `resolveStateAtAnchor`, `versionsByAnchor`.

**Layout** : `lg:grid-cols-[260px_1fr]`, sticky rail.

### Migration V011 — `source_chapter_version_id` (prête, **NE PAS APPLIQUER**)

**Fichier** : [V011__slice_7x_entity_version_chapter_version.sql](../supabase/migrations/V011__slice_7x_entity_version_chapter_version.sql).

**Status** : **obsolète depuis le pivot brainstorm V3**. Ne pas appliquer.

**Raison** : V011 ajoute `entity_versions.source_chapter_version_id`, qui supposait que les chapters étaient une source canonique de premier ordre. Dans le nouveau modèle (events comme source canon), les `entity_versions` proviennent uniquement d'events. La colonne devient inutile.

**Action** : laisser le fichier dans `supabase/migrations/` mais ne pas l'appliquer. À supprimer / remplacer par V012 quand on attaque (d). On peut aussi le drop maintenant et renuméroter (mais inutile vu qu'il n'a jamais touché la DB).

## À revisiter plus tard

- **Edit in-place de la v0 d'une entity** tant qu'aucune autre version n'existe. Question : est-ce qu'on autorise l'auteur à fixer/modifier les fields initiaux d'une entity librement avant de créer le moindre event lié, ou doit-on imposer la rigidité "v0 figé après création" ? Pas tranché — à reprendre quand le NewVersionModal disparaîtra dans le chunk (d).
- **Reader popup state — résolution chrono fine** (anchor per chapter, modes narrative / spoiler-free, etc.). Drop pour v1 (current state suffit). À reprendre quand on aura un cas d'usage beta-reader concret.

## Backlog non-prioritaire (lié au sujet mais skippable)

### Doublons hérités à rank exact

Sur Iria : 5 versions au rank exact "Confrontation à la forteresse" (créées avant `rankAfterChapter`). Le resolver est non-déterministe entre elles. Pas bloquant — invisible une fois qu'on accepte une nouvelle proposal qui produit une version au rank "après Confrontation". Si le user veut nettoyer, préparer un SQL :
```sql
-- Garde la plus récente par created_at par (entity_id, valid_from_rank).
-- À vérifier avant exec : la trigger prevent_modification ne bloque PAS DELETE,
-- mais RLS ne permet pas DELETE direct — exécuter via service_role dans le
-- dashboard SQL editor.
```

### Contexte LLM "after chapter" pour Propose updates re-runs

**Symptôme** : re-cliquer "Propose updates" sur un chapitre dont une proposal a déjà été acceptée → le LLM re-propose le même diff parce que `runProposals` envoie le snapshot à `chapter.chronological_rank` (= avant les versions post-chapter qu'on vient d'accepter).

**Fix** (à coder dans la même session que la migration V011 / source_chapter_version_id) : envoyer le snapshot **après** le chapitre. Helper `resolveStateAfterChapter(versions, chapterRank, items)` qui retourne la latest version avec `valid_from_rank < nextItem.rank`. Wired dans `runProposals` à la place de `resolveStateAtRank(...,chapter.chronological_rank)`.

**Effet attendu** : sur un même `chapter_version`, re-runs ne reproposent plus les mêmes diffs. Sur un nouveau `chapter_version` (re-tweak), tout est reset (le filtre stale rend les versions précédentes invisibles).

## Ordre suggéré des sessions futures

1. **(a) Cosmétique appbar** ✅ — 1h, isolé, low risk.
2. **(b) Reléguer entity types** ✅ — 1h, isolé.
3. **(c) Page Entities enrichie** ✅ — ½ journée, mini-slice.
4. **(d) Event upgrade + pivot canonical** ⏳ prochaine session — gros chunk (>1 journée), inclut migration V012, refonte TimelineScreen, funnel propose-events-from-chapter, M:M chapter_events. V011 reste obsolète/non-appliquée — V012 part directement de l'état V010 et reset les `entity_versions`.

## Évolution du brainstorm (historique)

Ce doc a évolué plusieurs fois pendant la session 2026-05-02 AM. Garde ici les pivots majeurs pour comprendre pourquoi le modèle final est ce qu'il est.

### V1 (initial) — "events au même niveau que chapters"

Modèle hérité de la V1 livrée : chapters et events sont peers, chacun avec un `chronological_rank`, mergés flat dans la timeline.

### V2 — "chapter = période, event = point, 1:M via `events.chapter_id`"

Premier pivot : on a reconnu que chapter ≠ event au niveau (chapter contient events). Modèle : `events.chapter_id` nullable (1:M). Un event est dans 0 ou 1 chapter. Timeline rendue avec chapters comme bandes, events nested.

**Problème de cette version** : ne gère pas un event raconté dans plusieurs chapitres (flashback, rappel en dialogue). Ne décolle pas vraiment canon de narrative — le chapter reste "porteur" des events.

### V3 (courante) — "events = source canon, chapter = retelling, M:M"

Pivot final de la session : le canon vit dans les events seulement. Chapter = retelling narratif. M:M via `chapter_events` pivot. Chapter perd son `chronological_rank` (dérivé). Timeline rendue events-first avec chips de chapters. Le flow "propose updates depuis chapter" devient un funnel à 2 étapes (propose events → events génèrent entity_versions).

C'est la version reflétée dans les sections § "Macro-décisions" et § "d. Event upgrade".
