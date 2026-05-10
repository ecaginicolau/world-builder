# Demo — Book editions (print layouts)

Slice livrée post-v1. Chaque livre peut avoir N "éditions" — une édition = une mise en page PDF prête pour KDP (trim, marges, polices, headers/footers, illustrations). Le but : pouvoir uploader directement le PDF généré sur Amazon KDP.

## Pré-requis

- V019 appliquée (`book_editions` table créée)
- Au moins un livre avec au moins un chapitre publié (final version posée)

## Walkthrough

### 1. Créer une édition

1. Ouvrir un livre — `/worlds/$worldId/books/$bookId`
2. Faire défiler jusqu'au panneau **Print editions** (sous la liste des chapitres)
3. Cliquer **+ New edition** — crée une édition par défaut "6×9 — Trade paperback" (Garamond 11pt, marges 19/13/19/19, headers alternés, page numbers à l'extérieur)

### 2. Personnaliser l'édition (avec preview live)

1. Cliquer **Edit** sur la ligne de l'édition
2. Le formulaire s'ouvre en place avec 8 sections — **et un preview WYSIWYG live en dessous** : 2 pages face à face (verso + recto) qui mettent à jour instantanément à chaque changement de champ. Mêmes polices que le PDF (EB Garamond, Cormorant Garamond, JetBrains Mono via @fontsource webfonts), vrai mirror margins, headers/footers parity-aware, drop cap.
3. **Limites du preview** annoncées en label : "approximate · HTML rendering, not PDF — exact line breaks may differ". Le rendu HTML diverge du PDF sur la justification, l'hyphénation et les coupures de lignes — c'est suffisant pour choisir typo/marges/structure mais pas pour valider les coupures de mots à la ligne près.
4. Le preview affiche les 15 premiers paragraphes de chaque page (rendre tout le chapitre gèle Chrome). C'est largement assez pour évaluer la mise en page.
5. Sections du form :
   - **Trim size** : presets (5×8, 5.25×8, 5.5×8.5, 6×9, A5) + saisie custom mm
   - **Margins** : `inside` (côté reliure) / `outside` (côté tranche) / `top` / `bottom`. ⚠️ V1 : marges miroir approximées — le corps de texte utilise la moyenne `(inside+outside)/2` comme padding L/R symétrique. Les headers et page numbers SONT eux parity-aware (positionnés sur l'extérieur). Mirror exact = V2 (nécessite pagination manuelle).
   - **Body** : font, size, line height, indent, justify, drop cap, include illustrations (pour faire une édition "pocket sans images" en parallèle d'une édition "trade avec images")
   - **Chapter title** : font, size, bold/italic, alignement
   - **Running header** : mode (none / book title / chapter title / alternating verso↔recto / author), font, size, italic, masquer sur 1ʳᵉ page chapitre
   - **Page numbers (footer)** : on/off, position (outside / center / inside), masquer sur 1ʳᵉ page chapitre
   - **Chapter header & footer** : style typographique appliqué aux nœuds `chapter_header` / `chapter_footer` (Tiptap HTML par chapitre, V018) — sert au minilog comptable
   - **Behavior** : `chapter starts on recto` (toggle stocké, V1 : non enforce — utiliser saut de page manuel pour forcer)

### 3. Saut de page manuel dans un chapitre

1. Aller sur un chapitre — `/worlds/$worldId/chapters/$chapterId`
2. Dans la barre latérale gauche, cliquer **+ Page break** — insère un nœud `pageBreak` à la position du curseur
3. Le nœud s'affiche comme un séparateur pointillé "─ page break ─" dans l'éditeur
4. Au PDF : démarre une nouvelle page à cet endroit

### 3-ter. Frontispiece (illustration d'ouverture du chapitre)

1. Aller sur un chapitre éditable
2. Dans la sidebar gauche, panneau **Opening illustration (frontispiece)** → cliquer **+ Set opening illustration** → picker → choisir
3. La miniature s'affiche dans le panneau, avec **Replace** / **Clear**
4. Au PDF : émet une page planche dédiée **immédiatement avant la 1ʳᵉ page du chapitre**. Pas de header, page number visible, image centrée max-fit dans les marges miroir. Le chapitre reprend ensuite normalement (page de titre + body) sur la page suivante.
5. Dans le preview WYSIWYG : si le chapitre 1 a un frontispiece, c'est lui qui s'affiche sur le verso du spread (priorité sur les inline full-page illustrations du chapitre 1).
6. **Limite parité** : pas d'enforcement — le frontispiece tombe sur verso ou recto selon la pagination cumulée. Pour le pattern classique "verso illustration + recto titre", ajoute un saut de page manuel à la fin du chapitre précédent si besoin de réaligner.

### 3-bis. Illustration pleine page (au milieu d'un chapitre)

1. Dans la barre latérale gauche d'un chapitre éditable, cliquer **+ Full-page illustration**
2. Un picker s'ouvre (mêmes illustrations que pour l'insertion inline, groupées par entity, "in this chapter" en premier)
3. Cliquer sur l'illustration choisie → un nœud `pageBreak` portant l'`illustrationId` est inséré à la position du curseur. Dans l'éditeur il s'affiche comme un cadre tireté avec la miniature et la caption.
4. Au PDF : génère une **page dédiée** pour cette illustration — pas de running header, image centrée, max-fit dans les marges, ratio préservé. Le **page number reste affiché** (convention : pas de header sur planche, mais pagination continue pour ne pas perdre le lecteur). Le contenu chapitre reprend sur la page suivante.
5. Dans le preview WYSIWYG : si le chapitre 1 contient une illustration pleine page, c'est elle qui occupe la page de gauche du preview (à la place du running content) — pour visualiser le rendu de la planche.

C'est la solution proposée pour le problème de pagination imprévisible : tu places explicitement l'illustration dans le flow du chapitre, et elle prend une page entière exactement là où tu veux.

### 4. Polices comptable (Le comptable de la guilde)

Pour les minilog comptables (chapter_header / chapter_footer), choisir **JetBrains Mono** comme `chapter_header_font` et `chapter_footer_font` dans l'édition. Donne le rendu monospace tabulaire.

### 5. Iteration loop (preview ↔ adjust ↔ preview)

Trois features pour boucler vite sans le yoyo unpublish/republish :

**Layout edits sur chapitre publié — cursor inclus.** Sur un chapitre `PUBLISHED`, l'éditeur reste cliquable : tu peux placer le curseur dans n'importe quel paragraphe, puis cliquer "+ Page break" → le saut de page s'insère exactement à la position du curseur. Pareil pour "+ Full-page illustration" / "+ Insert illustration". Implémentation : "soft read-only" — le ProseMirror est `contenteditable=true` (curseur, sélection, copie OK) mais `editorProps.handleTextInput` / `handleKeyDown` / `handlePaste` rejettent les modifications-utilisateur. Les commandes programmatiques passent (elles ne traversent pas ces handlers).

Sur un chapitre `PUBLISHED`, tu peux désormais :
- Éditer librement `chapter_header` / `chapter_footer` (epigraphe, monolog) — ils sont chapter-row, pas dans la version canonique
- Set / replace / clear le frontispiece (opening illustration)
- Insérer / supprimer des `+ Page break` et `+ Full-page illustration` dans le body
- Insérer / supprimer des illustrations inline

Le texte canonique du chapitre (les phrases) reste verrouillé tant que publié. Seule la mise en page bouge.

Implémentation : `runLayoutCommand(editor, () => …)` flippe `editable=true` le temps d'une commande synchrone, puis revient à `false`. La saisie clavier reste bloquée, mais les commandes Tiptap dispatchées par les boutons passent.

**Preview PDF in-app (full book).** Sur l'écran livre, dans le panneau "Print editions", chaque édition a maintenant 2 boutons : **Preview PDF** et **Export PDF**.
- Preview ouvre un modal plein écran avec le PDF rendu dans un `<iframe>` (viewer browser natif). Pas de download. Le modal a un bouton "Download" si tu veux quand même le sauver.
- Export = comportement classique (download direct).
- Le modal mesure le temps de génération et l'affiche en haut.

**Preview PDF single chapter.** Sur l'écran chapitre, bouton **Preview PDF** dans la barre d'actions (à côté de "Propose canon"). Génère un PDF du chapitre courant uniquement, sans page de titre du livre — la page 1 c'est directement le frontispiece (s'il y en a un) ou le titre du chapitre.
- Sur le comptable : chapitre seul = ~3-4s vs livre complet = ~11s
- Utilise la 1ʳᵉ édition du livre par défaut. Si pas d'édition, message "Create a print edition first" avec lien.

### 6. Export PDF

1. Sur la ligne de l'édition, cliquer **Export PDF**
2. Le bouton passe en `Generating…` ~5-15s pour un livre de 30k mots
3. Le PDF est téléchargé sous `${book title} - ${edition name}.pdf` (nom sanitisé en ASCII)
4. Polices embarquées (KDP-compatible) : EB Garamond, Cormorant Garamond, JetBrains Mono — toutes Open Font License

⚠️ **Throttle Chrome** : si tu déclenches plusieurs exports en moins de ~30s, Chrome bloque silencieusement les downloads suivants. Pour piloter : un seul export par fenêtre de temps, ou fermer/ré-ouvrir l'onglet entre.

### 6. Multi-éditions

Pour avoir une version pocket sans illustrations + une version grand format avec illustrations :
1. Créer une 2ᵉ édition (ex : "5×8 — Pocket sans illustrations")
2. Choisir trim 5×8, body font 10pt, **désactiver Include illustrations**
3. Export → un 2ᵉ PDF avec une mise en page totalement indépendante

### 7. Page de "part" auto-skippée

Si le livre n'a qu'un seul `part` avec des chapitres (ou des parts vides en plus), la page de titre de partie est **automatiquement omise** — sinon elle ne contient que le nom du part et reste mostly-blank. Le titre du part est toujours stocké et apparaît si tu rajoutes un 2ᵉ part avec contenu plus tard. Aucune option à activer.

## Limitations V1 connues

| # | Limitation | Workaround | Plan |
|---|---|---|---|
| 1 | Marges miroir approximées dans le PDF (corps centré). **Le preview WYSIWYG montre lui le vrai mirror via CSS** | Headers/footers du PDF ARE parity-aware | Vraie pagination dans le PDF = Paged.js ou pagination manuelle |
| 2 | `chapter_starts_on_recto` non enforce dans le PDF | Saut de page manuel | Idem |
| 3 | Pas d'hyphénation FR | Justifier ou laisser ragged-right | Intégrer dictionnaire FR |
| 4 | Drop cap = capitale agrandie inline (pas vraie 2-ligne) | Activable comme flourish | Idem |
| 5 | ~~Bleed + planches pleine page~~ → **Full-page illustrations livrées** via `pageBreak` avec `illustrationId` (page dédiée, pas de header/footer, image centrée max-fit ratio préservé) | n/a | Bleed pour image-jusqu'au-bord = future — actuellement contenu reste dans les marges |
| 6 | Front matter / back matter (titre, copyright, ISBN, TOC) hors scope | KDP gère ça à l'upload | Décision produit : on ne fait pas |
| 6 | Preview WYSIWYG ≠ PDF exact (justify, line breaks) | Voir le label "approximate" + Export PDF pour vérifier | Si fidélité 1:1 nécessaire un jour, basculer le PDF vers Paged.js (HTML→PDF unique source of truth) |
| 7 | Preview = 15 paragraphes par page max | Suffit pour le typo, pas pour la pagination réelle | Idem si Paged.js |

## Vérifier qu'on n'a rien cassé

- 9 chapitres exportés en ~9s pour le livre comptable (33k mots)
- Polices embarquées dans le PDF (vérifier dans Adobe Reader → File → Properties → Fonts → "Embedded Subset" partout)
- Headers alternés visibles : verso = titre du livre, recto = titre du chapitre
- Page numbers à l'extérieur (recto = à droite, verso = à gauche)
- Le minilog `chapter_header` (Fond accessible / Mouvement) apparaît centré italique en haut du chapitre
- Le minilog `chapter_footer` apparaît en bas du dernier segment du chapitre
