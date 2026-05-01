# Backend (Supabase)

Supabase fournit en un seul service tout ce dont on a besoin : Postgres, Auth, Edge Functions, Realtime, Storage.

## Composants utilisés

| Service | Rôle | v1 ? |
|---|---|---|
| **Postgres** | Stockage principal (mondes, entités, versions, chapitres, runs) | ✅ |
| **Auth** | Comptes utilisateurs (Magic link + Google OAuth) | ✅ |
| **Row Level Security (RLS)** | Isolation des données par utilisateur | ✅ |
| **Edge Functions** | Proxy LLM (clés API hors du client) | ✅ |
| **Realtime** | Sync multi-device live | v1.x (au début, simple refetch via TanStack Query) |
| **Storage** | Export/import de mondes, images | plus tard |
| **pgvector** | Embeddings pour recherche sémantique | v2+ (cf. design original §13) |

## Auth

- **Magic link email** par défaut (pas de mot de passe à gérer).
- **Google OAuth** comme alternative rapide.
- Sessions JWT gérées par `@supabase/supabase-js`.
- Skip Apple / GitHub / autres pour v1.

UI : un écran de login simple, providers en 2 boutons.

## Row Level Security (RLS)

Toutes les tables sont **scoped to `auth.uid()`** — un user ne voit que ses propres mondes (et tout ce qui en dépend).

Pattern type pour les tables racines :
```sql
ALTER TABLE worlds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see their own worlds"
  ON worlds FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
```

Pour les tables enfants (entities, chapters, etc.) on peut :
- Joindre sur `worlds` dans la policy
- Ou dénormaliser un `owner_id` sur chaque table (plus rapide en lecture, recommandé)

**Choix par défaut** : dénormaliser `owner_id` pour éviter les jointures dans les policies. Coût : maintenir `owner_id` cohérent à l'insert (trivial).

## Schéma

→ **DDL complet, RLS policies, triggers et indexes** : voir [data-model.md](./data-model.md).

Vue d'ensemble des familles de tables :

| Famille | Tables |
|---|---|
| Auth & user | `auth.users` (Supabase managed), `user_settings` |
| World | `worlds` |
| Hiérarchie narrative | `books`, `parts`, `chapters`, `chapter_participants` |
| Timeline | `events` (chapters partagent la timeline via `chronological_rank`) |
| Entités (canon) | `entity_types`, `entities`, `entity_versions` (append-only) |
| Brainstorm | `notes`, `chat_threads`, `chat_messages`, `note_entities`, `note_promotions` |
| Audit | `runs` |

**Conventions** (rappel rapide) : UUIDs partout, `owner_id` dénormalisé, `world_id` dénormalisé sur les tables enfants au-delà du premier niveau, timestamps UTC, statuts en text + CHECK, RLS pattern uniforme `owner_id = auth.uid()`.

## Edge Functions

Deno + TypeScript natif. Fonctions prévues en v1 :

### `llm-call`
Proxy LLM générique. Reçoit `{ provider, model, messages, params, stream }`, charge la clé API depuis les secrets Supabase, appelle l'API du provider, streame la réponse.

### `extract-entities`
Pour l'auto-extraction. Reçoit du texte (note, message de chat, chapitre), retourne `Array<{ name, type_hint?, span: [start, end] }>` détectés. Modèle bon marché (gpt-4o-mini ou équivalent), structured output JSON.

### `propose-updates` (Slice 7)
Appelle le LLM pour générer des diffs structurés sur des entités à partir d'un texte de chapitre. Pourrait être un cas particulier de `llm-call` avec un schéma de réponse forcé — à voir au moment d'implémenter.

(Détails dans [llm.md](./llm.md).)

## Migrations

- Versionnées dans `supabase/migrations/` via le CLI `supabase`.
- Appliquées en dev sur Supabase local (Docker), en prod via `supabase db push`.

## Realtime (v1.x)

Pas critique en v1 (un seul user, un seul device à la fois généralement). Mais facile à activer plus tard :
```ts
supabase
  .channel('worlds-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'worlds' }, (payload) => {
    queryClient.invalidateQueries({ queryKey: ['worlds'] });
  })
  .subscribe();
```

## Coûts (free tier Supabase)

- 500 MB Postgres
- 5 GB bandwidth/mois
- 500 K invocations Edge Functions/mois
- Auth illimité
- Largement suffisant pour usage perso ; passage Pro ($25/mois) si on grossit.

## Liens

- [architecture.md](./architecture.md)
- [llm.md](./llm.md)
- [NEXT-STEPS.md](./NEXT-STEPS.md)
