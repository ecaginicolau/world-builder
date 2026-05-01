# Future Ideas (post-v1)

Idées notées au fil des discussions, à considérer après le v1. Complète la section 13 "v1.x Ideas" du [design original](./Dynamic%20World%20Builder%20Product%20Design.md).

## Promues in-scope v1

- ~~Auto-highlight / auto-extraction d'entités~~ → désormais in-scope (cf. [product-design.md](./product-design.md) §5.3).

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
