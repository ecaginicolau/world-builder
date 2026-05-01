# Future Ideas (post-v1)

Idées notées au fil des discussions, à considérer après le v1. Complète la section 13 "v1.x Ideas" du [design original](./Dynamic%20World%20Builder%20Product%20Design.md).

## Promues in-scope v1

- ~~Auto-highlight / auto-extraction d'entités~~ → désormais in-scope (cf. [product-design.md](./product-design.md) §5.3).

## Auto-tag respecte les untag user

Aujourd'hui (Slice 3 → 4.y) : quand l'auto-extract trouve un match sur une entity existante, on l'auto-tague (`pinned_manually=false` pour les notes). Si l'user untag, c'est OK pour le moment courant. Mais à la prochaine extraction (le user re-édite la note) → l'effet d'auto-tag voit que l'entity est dans candidates ET pas dans taggedIds → re-tag.

**Fix proposé** : persister la liste des "user explicitly unlinked" en DB ou localStorage, par `(parent, entity)`. L'auto-tag effect saute les entries dans cette liste. Re-tag manuel via le picker enlève l'entry.

DB option : ajouter colonne `user_unlinked_at timestamptz` à `note_entities` (mais la ligne est supprimée au untag…) — donc plutôt une nouvelle table `user_excluded_entity_links (parent_kind, parent_id, entity_id, owner_id, excluded_at)`.

LocalStorage option : par-user simple, perd au reset.

Décision pour v1.x : laisser le comportement actuel + petit message UI ("Auto-tagged from text. Untag again if you want it gone.") puisque l'extraction tourne rarement (debounced 5s) et l'user qui untag s'en rendra compte.

## Améliorations highlight in-editor (post-3.y)

La v1 du highlight (Slice 3.y) sera regex-naïve : matche `entity.name` exact (et `entity.aliases` exact). À explorer ensuite :

- **Partial match** : si entity = "Maître Sorn", aussi matcher "Sorn" tout court (avec heuristique sur le type — un Character porte souvent un prénom seul, un Location moins).
- **Fuzzy / Unicode normalize** : "Maitre" sans accent doit matcher "Maître" avec.
- **Pronoms / coréférences** : "il", "elle" qui réfèrent à une entité contextuellement — nécessite un vrai modèle de NLP, pas du regex.
- **Désambiguation** : si "Voss" est l'alias d'Edran ET aussi un nouveau personnage candidat → présenter le choix à l'user.
- **Décorations Tiptap éphémères** : le highlight ne doit jamais polluer le `content` HTML stocké en DB — uniquement Tiptap Decoration au runtime.

## Settings : exposer les prompts

Slice 3.x ajoute `worlds.custom_prompt` qui est **appended** au system prompt (pas un remplacement). Plus tard, on pourrait :

- **Per-feature prompts** : un custom_prompt par kind (chat / extract / upscale / propose_updates / summarize) — utile si l'user veut un ton différent selon la tâche.
- **Versioning des prompts** : garder l'historique des prompts du world pour pouvoir comparer "avant/après changement de voix".
- **Bibliothèque communautaire** : partager des prompts par genre (dark fantasy, sci-fi, polar...).
- **Mode "expert"** : éditer le prompt complet (pas juste l'addition), avec validation côté UI pour éviter de casser les contraintes JSON ou les sections obligatoires.

## Monitoring avancé

Slice 3.x ajoute un footer minimal listant les 20 derniers `runs`. Pour aller plus loin :

- **Filtres** : par kind (chat / extract / upscale), par status (errors only), par date range.
- **Stats agrégées** : tokens totaux par jour/semaine, coût estimé en $, durée moyenne par kind.
- **Graphs** : timeline des runs, histogramme de durations, repartition par model.
- **Export CSV / JSON** pour analyse externe.
- **Reopen session** : depuis un run de chat, recréer le contexte exact (`input_summary` capture les pins) pour rejouer la conversation.
- **Realtime** : Supabase Realtime sur la table `runs` au lieu du polling 5s, pour les utilisateurs ayant plusieurs onglets ou devices.

## Collaboration & partage

### Partage en lecture seule
Donner un lien à un beta reader pour qu'il lise ton world (Reader view) sans avoir besoin d'un compte plein. Token magique d'invitation, scope limité.

### Commentaires de beta readers
Sur les chapitres en lecture, permettre des annotations / commentaires renvoyés à l'auteur.

## Brainstorm avancé

### Suggestions IA proactives
Pendant que tu écris une note, l'IA peut proposer des angles : "Et si on creusait pourquoi Iria a peur de l'eau ?", "As-tu pensé à la réaction de Moonblade ?". Intrusif si mal calibré, mais potentiellement très puissant.

### Linking automatique entre notes
"Cette note semble parler du même sujet que Note #42 — fusionner ?"

### Voice-to-text pour mobile
Capture vocale → transcription → note. Énorme pour le mobile use case (idée en marchant).

## Recall & cohérence

### Embeddings + recherche sémantique
"Trouve-moi tout ce que j'ai déjà écrit qui touche aux relations Iria/Moonblade", même si les mots-clés exacts ne matchent pas. pgvector dans Supabase rend ça trivial à activer.

### Détection de contradictions
Quand on écrit un chapitre, l'IA peut signaler "Tu as écrit que Iria avait 20 ans dans le chapitre 3, mais ici elle en a 22 deux semaines plus tard".

## Modélisation enrichie

### Distinction "canon facts" vs "voice notes"
Faits durs (Iria a 20 ans, yeux verts) vs guides de style ("ton sec, beaucoup d'ironie") — peut-être deux types d'attributs différents sur les entités, ou deux types d'entités, à explorer.

### Relations typées entre entités
"Iria → ami_de → Moonblade" plutôt que de simples relationship lists.

### Templates d'EntityTypes pré-faits
Bibliothèque de types prêts (Character, Location, Magic System, Faction...) à importer dans un nouveau world.

## Export & publication

### Export complet du world
JSON / Markdown / EPUB pour archivage ou portage.

### Export du livre seul
Concaténer les chapitres dans l'ordre books → parts → chapters, en docx/PDF/EPUB pour partage ou édition externe.

## Token budgeting

(Out of scope v1 selon design original §13)
- Compactage automatique du contexte si trop d'entités pinnées
- Compteur de tokens en temps réel
- Suggestions "tu peux pinner X de plus avant la limite"

## Liens

- [product-design.md](./product-design.md)
- [NEXT-STEPS.md](./NEXT-STEPS.md)
