# Slice 6 — Demo : entity versioning + state-at-rank

Walkthrough ~5 min pour re-valider à la main.

**Prérequis** : V008 appliquée. Au moins 1 chapter et/ou 1 event créés (pour avoir des ranks dans le picker).

## 1. Éditer un type d'entity (fields)

1. World → onglet **Entities**.
2. Clic sur un chip de type (ex. "Personnages") → arrive sur `/worlds/$id/entity-types/$typeId`.
3. Clic **+ Add field** trois fois.
4. Renomme : `age` (kind = `int`), `bio` (kind = `text`), `alive` (kind = `bool`).
5. Clic **Save**. Le bouton devient grisé = sauvegardé.
6. Test reorder : `↑` `↓` sur les rows.
7. Retour ← Entities.

## 2. Ajouter des aliases à une entity

1. Clic sur une entity dans la liste (ex. "Iria") → arrive sur `/worlds/$id/entities/$entityId`.
2. Section **Aliases** : tape "la jeune fille" puis Enter, "lui" puis Enter.
3. Vérif : chips affichés avec `×` pour supprimer.

> Les aliases alimentent immédiatement la détection auto-extract et les highlights in-editor.

## 3. Créer une 1ʳᵉ version au rank d'un chapter

1. Picker **Show state as of: — current —** → fiche affiche `(no value)` partout.
2. Clic **+ New version…** → modal s'ouvre.
3. **At rank** : choisis le 1ᵉʳ chapter (ex. "📖 Confrontation à la forteresse").
4. Remplis `age=17`, `bio=Jeune femme intrépide…`, coche `alive`.
5. Clic **Save version**.
6. Vérif : retour sur la fiche, `age=17 / bio=… / alive=true`. "From version at 📖 Confrontation à la forteresse" sous la fiche.
7. **Versions (2)** : "initial" + "at 📖 Confrontation à la forteresse" avec chips diff `age bio alive`.

## 4. Créer une 2ᵈᵉ version plus tard dans la timeline

1. **+ New version…** → modal pré-rempli avec valeurs courantes (age=17, bio=…, alive=true), rank par défaut = dernier item.
2. Change `age=18`, `bio=Capitaine de la garde…`, laisse `alive` coché.
3. Save → Versions (3), 3ᵉ row a chips diff `age bio` (alive inchangé, donc pas dans le diff).

## 5. Scrubber dans le temps

1. Picker **Show state as of:** → choisis l'event du milieu (ex. "📅 Rencontre à la Vieille Forteresse").
2. Vérif : la fiche revient à `age=17 / bio=Jeune femme…` (= v1, qui est la dernière `<= rank` choisi).
3. Repasse à **— current —** → revient à la dernière version.
4. Choisis un rank avant le 1ᵉʳ chapter (si tu en as un avant) → "No version applies at this point" (le sentinel `__init__` gagne, snapshot vide).

## 6. Promote note → entity_version

1. Va sur une note (`Notes` → clic une note).
2. Header : 4 boutons promote, clic **Promote → version**.
3. Modal :
   - Pick une entity dans le dropdown (ex. "Maitre Sorn (Personnages)").
   - At rank : pick un point dans la timeline.
   - Form auto-généré depuis le type, pré-rempli avec valeurs courantes au rank choisi.
   - Remplis (`age=55`, `bio=Vieux maître…`, `alive=true`).
4. Clic **Promote** → redirect vers la fiche entity, version créée. Audit `note_promotions` écrit (target_kind='entity_version').

## Garde-fous validés

- **Append-only** : trigger SQL `entity_versions_no_update` raise `entity_versions is append-only` en cas d'UPDATE direct.
- **DELETE bloqué** : aucune RLS policy DELETE → impossible de supprimer une version sauf cascade depuis l'entity parente.
- **Sentinel `__init__`** : créé automatiquement à la 1ʳᵉ "New version" (donc `state at rank R` retourne null si R < tous les ranks réels).
- **Unicité dropdown** : les chapters et events sont tous mergés dans le même dropdown, triés par `chronological_rank` lex.

## Console attendue

Aucun erreur applicative. Les `[EXCEPTION] message channel closed` sont du bruit de l'extension Chrome, pas de l'app.
