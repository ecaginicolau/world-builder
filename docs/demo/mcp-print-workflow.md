# MCP — Illustrations, éditions et PDF imprimables

Objectif : préparer une édition 6×9 couleur et une édition 5×8 noir et blanc avec les mêmes illustrations, tester les chapitres individuellement, puis exporter les deux intérieurs complets. Les placements et sauts de page restent communs aux éditions ; les dimensions, polices, marges et filtres sont propres à chaque édition.

## Installation

Depuis la racine du dépôt :

```sh
npm install
npm run install-browser -w world-builder-mcp
npm run mcp:build
```

Appliquer `supabase/migrations/V025__mcp_layout_transaction.sql` dans Supabase, après V017–V024, puis redémarrer le serveur MCP. Cette migration est indispensable seulement pour `edit_chapter_layout`. Elle protège simultanément le chapitre et sa version contre les modifications concurrentes, crée une version récupérable pour les changements du corps et conserve le statut publié. La RPC est réservée au rôle de service ; les outils contrôlent explicitement le propriétaire.

Le serveur doit fonctionner depuis ce checkout complet avec les dépendances racine installées : le dossier `dist` du package seul ne suffit pas pour le rendu. Il lance un serveur Vite temporaire sur une adresse loopback et un Chromium headless, sans login dans l’application et sans serveur web à lancer manuellement. La clé de service reste côté Node ; le navigateur reçoit seulement les données du livre et les images demandées. Ses requêtes réseau sont limitées au serveur temporaire.

Variables optionnelles :

- `WORLD_BUILDER_ARTIFACT_DIR` : dossier de sortie absolu, par défaut `output/mcp-print` dans le checkout.
- `PLAYWRIGHT_BROWSERS_PATH` : dossier d’installation de Chromium, identique à l’installation et à l’exécution. Utiliser le script **du workspace MCP**, dont la version de Playwright peut différer de celle des tests de l’application.

Les chemins d’import/export sont sur la machine du serveur MCP. Pour une session distante, transférer les fichiers sur cette machine avant `upload_illustration` ; `get_illustration` et `get_print_pdf_page` peuvent aussi renvoyer les pixels directement dans la réponse MCP.

## Outils

| Outil | Usage |
|---|---|
| `list_book_editions`, `get_book_edition` | Lire les réglages exacts, dont `updated_at`. |
| `create_book_edition` | Créer avec des réglages ou copier une édition d’un autre livre puis surcharger certains champs. |
| `update_book_edition` | Mettre à jour seulement les champs fournis, avec contrôle `expected_updated_at`. |
| `list_illustrations` | Parcourir une galerie par monde ou entité ; suivre `next_offset` jusqu’à `null`. |
| `get_illustration` | Métadonnées, URL, pixels optionnels, téléchargement local et empreinte SHA-256. |
| `upload_illustration` | Importer PNG/JPEG/WebP jusqu’à 10 MiB, vérifier le décodage et mesurer les dimensions. Réutiliser le même `image_id` UUID en cas de reprise. |
| `update_illustration` | Modifier légende, texte alternatif ou ordre. |
| `replace_illustration_asset` | Remplacer le fichier sans changer l’ID ni les placements. Nouvelle URL immuable ; ancien objet conservé pour récupération. Affecte tous les usages. |
| `get_chapter_layout` | Révision, illustration d’ouverture et blocs de texte avec indices commençant à zéro. |
| `edit_chapter_layout` | Modifier l’ouverture, insérer/retirer/déplacer des images et sauts de page ; `dry_run` disponible. |
| `get_book_illustration_usage` | Usages dans le livre et la préface, images manquantes, IDs répétés et compte par chapitre. |
| `generate_print_pdf` | Aperçu par chapitre ou livre entier ; export final avec contrôles. |
| `get_print_pdf_page` | PNG d’une page donnée, pixels MCP et texte extrait pour contrôle visuel. |

La génération artistique reste effectuée par l’outil de génération d’images de l’agent. Le MCP fournit les références, l’importation, la bibliothèque et les placements. Les images sources ne sont pas converties en noir et blanc : les filtres sont appliqués au rendu. Les transparences sont aplaties sur blanc dans le PDF MCP, conservant visuellement les bords fondus.

## Parcours autonome

1. Lire les chapitres et les éditions de référence. Copier les éditions du tome précédent avec `copy_from_edition_id`. Pour une nouvelle édition, `settings` peut être `{}` (6×9 couleur). Pour le 5×8 : `trim_width_mm: 127`, `trim_height_mm: 203.2`, `image_grayscale: true`.
2. Inventorier les illustrations déjà placées. Pour chaque personnage/lieu à représenter, parcourir sa galerie et regarder les pixels avec `get_illustration`. Télécharger les images de référence pour l’outil de génération. Vérifier la ressemblance avant d’importer le résultat.
3. Lire `get_chapter_layout`. Le champ `before_block` désigne une frontière **du document original**, avant un bloc de premier niveau ; `blocks.length` signifie la fin. Les indices de `remove_blocks` désignent uniquement des blocs d’image ou de saut de page. Les octets du texte et de sa mise en forme sont conservés. Pour déplacer une image, retirer son bloc et la réinsérer dans **la même requête**.
4. Affecter une image d’ouverture et insérer une seconde image au passage choisi. Un placement `full_page` produit une planche dédiée ; `inline` reste dans le flux. Un `page_break` n’a pas d’image. `opening_illustration_id: null` retire l’ouverture ; champ omis la conserve.
5. Générer avec `edition_id`, `chapter_id`, `purpose: "preview"`. Le résultat inclut `export_id`, le PDF local, le manifeste, les contrôles et le nombre de pages. Utiliser `get_print_pdf_page` avec des pages commençant à **1** pour vérifier les pages du chapitre. Corriger puis régénérer.
6. Répéter sur l’autre édition. Un aperçu de chapitre recommence sa pagination à 1 ; la parité et la marge de reliure finale exigent un contrôle du livre complet.
7. Générer le livre entier sans `chapter_id`. Pour l’export final, utiliser `purpose: "final"`, un `print_profile` explicite et, pour le projet à deux images par chapitre, `expected_illustrations_per_chapter: 2`. Profils : `black_white`, `black_cream`, `standard_color`, `premium_color`.
8. Inspecter les pages du PDF complet, particulièrement les débuts/fins de chapitres et les planches. Les deux éditions doivent être vérifiées séparément. Le PDF intérieur n’est pas le fichier de couverture KDP.

Exemple de placement (IDs et révision à remplacer par les valeurs lues) :

```json
{
  "chapter_id": "UUID_CHAPITRE",
  "expected_revision": "SHA256_RETOURNE_PAR_GET_CHAPTER_LAYOUT",
  "opening_illustration_id": "UUID_IMAGE_OUVERTURE",
  "remove_blocks": [],
  "insert": [{"before_block": 12, "kind": "full_page", "illustration_id": "UUID_IMAGE_SCENE"}],
  "dry_run": true
}
```

## Contrôles et limites

L’export teste les dimensions réelles des pages, les polices incorporées, les marges de reliure selon le nombre de pages, les marges extérieures, les tailles de texte configurées, la taille du fichier, les annotations et les limites de pagination du profil d’impression. Les limites automatiques de pagination concernent les formats 5×8 et 6×9 sans fond perdu. Référence : [consignes officielles KDP](https://kdp.amazon.com/en_US/help/topic/G201857950), consultées le 12 octobre 2026.

Les images sont téléchargées et décodées avant le rendu : pas de remplacement silencieux par une URL couleur si un filtre échoue. L’export détecte les IDs répétés et les fichiers identiques sous des IDs différents. `allow_repeated_illustrations` permet une répétition délibérée. La résolution est estimée à la taille d’affichage à partir des dimensions décodées ; les planches avec légende utilisent une estimation conservatrice. Un fichier peut passer ces contrôles et nécessiter encore des corrections de composition visuelle.

En aperçu, les problèmes figurent dans le rapport et le PDF reste consultable. En final, une erreur produit `status: "blocked"` et `isError: true`, tout en conservant le PDF de diagnostic. `status: "validated"` signifie **contrôles automatiques passés**, pas approbation par Amazon. Toujours inspecter le rendu et le Print Previewer de KDP avant publication.

Le réglage `chapter_starts_on_recto` est appliqué par deux passes : mesure des débuts de chapitre, puis ajout des pages blanches nécessaires avant les illustrations d’ouverture. Chaque début de chapitre est vérifié sur une page impaire ; son illustration précédente est donc sur la page paire en regard. La numérotation et les marges alternées utilisent la pagination finale. Ce traitement s’applique aussi aux aperçus de chapitre.

Limites conservées du moteur partagé : pas de césure française ; lettrine simulée. Les images imbriquées dans d’autres blocs ou dans le framing header/footer ne sont pas prises en charge et sont signalées. La suppression des images d’une édition retire désormais aussi les planches d’ouverture et de milieu de chapitre.

Les manifestes conservent les réglages, versions source, empreintes des textes/images et du PDF. Les anciens objets issus d’un remplacement d’image et les exports locaux ne sont pas purgés automatiquement.

## Validation de développement

- Tests unitaires : conservation du texte, déplacements, refus de suppression du texte, patchs partiels, contrôle du propriétaire et des révisions, pagination des lectures et préflight PDF.
- `e2e/mcp-print.spec.ts` : moteur Chromium/Vite isolé, PDF 6×9 couleur et 5×8 gris, test des pixels, transparence fondue sur blanc, aperçus de chapitre et édition sans images.
- Test réel en lecture seule : création d’un aperçu de chapitre existant et rendu d’une page via les outils MCP. Aucun contenu du livre n’est modifié.
- Test réel en écriture validé le 12 octobre 2026 après application de V025 : `node packages/mcp-server/scripts/smoke-layout.mjs --live`. Crée un monde temporaire, teste les éditions, imports, placements, révisions concurrentes et PDF couleur/monochrome via STDIO, puis supprime ses données de base et de stockage. Le rapport reste dans `output/mcp-print/smoke-<UUID>/report.json`.
