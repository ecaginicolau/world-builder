# Post-v1 — Local LLM provider

**Document vivant.** Brainstorm session 2026-05-02 PM (post-(d)). Spec figée, pas encore commencée.

## Contexte

L'app utilise OpenAI cloud via l'edge function `llm-call` pour 4 tâches : `extract` (auto-extract entities depuis une note), `proposals` (propose canon depuis un chapter), `upscale` (raffinement de prose), `summaries` (S/M/L par chapter). Coût et latence freinent l'usage intensif et bloquent des features token-heavy déjà imaginées (mention resolution sémantique en chapter view, p. ex.).

Hardware user = RTX 5090 / 32GB VRAM → modèles locaux 14B-32B fluides, 70B quantizé jouable. JSON mode robuste à ce niveau, pas un vrai risque.

## Macro-décisions tranchées

1. **Standard cible = endpoint OpenAI-compat.** Marche avec Ollama, LM Studio, llama.cpp `--api`, et tout futur runtime. Pas de couplage à un runtime spécifique.
2. **Transport = browser-direct.** L'edge function `llm-call` ne peut pas atteindre `localhost`. On garde `llm-call` pour le cloud, on ajoute un chemin direct browser → endpoint local. CORS opt-in côté runtime (Ollama : `OLLAMA_ORIGINS=*`).
3. **Hybride toggle global + per-task.** Toggle `local_llm_enabled` (off par défaut). Quand off : ignore tout le reste, retombe sur le cloud + tier system existant. Quand on : per-task model picker pour les 4 tâches. Désactiver/réactiver le toggle ne reset pas la config par-tâche.
4. **Pas de fallback automatique.** Si le local échoue (endpoint down, JSON invalide après N retries), on **affiche l'erreur dans la modal** + bouton "Try with cloud" en un clic. Pas de retry silencieux côté cloud (sinon coûts cachés). N = 2 retries pour erreur réseau, 2 retries pour JSON invalide avant de surfacer.
5. **Pas de migration DB neuve si possible.** Étendre `user_settings` avec quelques colonnes (cf. § Modèle de données). Si trop de churn, table `local_llm_settings` séparée — décision dans la slice.
6. **Pas de log différencié.** `runs` continue de logger comme avant, avec un nouveau champ `provider text` ('cloud' | 'local') + `model text` pour pouvoir distinguer/agréger après coup.
7. **Mention resolution sémantique = NEXT-STEP, pas dans cette slice.** Cette slice swap les providers. Les nouvelles features token-heavy déboulent après, gratuites grâce au local.

## Modèle de données

Extension de `user_settings` (V014 — V013 déjà consommée par (d.x)) :

```sql
alter table user_settings
  add column local_llm_enabled boolean not null default false,
  add column local_llm_endpoint text,           -- ex. 'http://localhost:11434/v1'
  add column extract_local_model text,          -- ex. 'qwen2.5:14b'
  add column proposals_local_model text,
  add column upscale_local_model text,
  add column summaries_local_model text;

alter table runs
  add column provider text not null default 'cloud' check (provider in ('cloud','local')),
  add column model text;                        -- ex. 'gpt-4o-mini' ou 'qwen2.5:14b'
```

Pas de `local_llm_api_key` : Ollama/LM Studio en local ne demandent pas d'auth. Si un jour endpoint distant authentifié, on ajoutera.

## Provider implementation

`src/lib/llm.ts` expose déjà un provider abstrait (mock + openai). On ajoute un 3ème :

```ts
// pseudo
export interface LLMProvider {
  call(opts: { messages, model, jsonMode?, ... }): Promise<{ text, tokens }>
}

// nouveau : openai-compat-direct
export function makeOpenAICompatProvider(endpoint: string, model: string): LLMProvider
```

Au call site (par tâche) :

```ts
const settings = useUserSettings()
const useLocal = settings.local_llm_enabled && settings[`${task}_local_model`]
const provider = useLocal
  ? makeOpenAICompatProvider(settings.local_llm_endpoint, settings[`${task}_local_model`])
  : cloudProvider // edge function llm-call existante
```

Le cloud passe toujours par l'edge function (sécurité de la clé OpenAI). Le local n'a pas de secret → call browser-direct OK.

## Settings UX

Sur `SettingsScreen`, nouvelle section **"Local LLM"** sous les sections existantes :

```
┌─ Local LLM ─────────────────────────────────────┐
│ [☐] Enable local LLM                            │
│                                                  │
│ Endpoint URL                                     │
│ [http://localhost:11434/v1            ]          │
│                                                  │
│ Models per task (used when enabled)              │
│   Auto-extract  [qwen2.5:14b              ]     │
│   Proposals     [qwen2.5:14b              ]     │
│   Upscale       [qwen2.5:32b              ]     │
│   Summaries     [qwen2.5:7b               ]     │
│                                                  │
│ ⓘ Setup Ollama: `OLLAMA_ORIGINS=* ollama serve` │
│   then `ollama pull qwen2.5:14b`                 │
└──────────────────────────────────────────────────┘
```

Pas de "test connection" button v1 — l'utilisateur saura vite si ça marche au premier appel. À ajouter si frottement.

## Wiring par tâche

Les 4 call sites à toucher :

| Tâche | Fichier actuel | Format output | Notes |
|---|---|---|---|
| `extract` | `src/lib/llm/extract.ts` | JSON strict, zod schema | Le plus fréquent → priorité user |
| `proposals` | `src/lib/llm/proposeCanon.ts` | JSON strict, zod schema | Critique pour le canon |
| `upscale` | `src/lib/llm/upscale.ts` | Prose libre | Tolérant au bruit, le plus token-heavy |
| `summaries` | `src/lib/llm/summaries.ts` | Prose libre, 3 niveaux | Batch-friendly, latence OK |

Chaque call site ajoute le branchement local/cloud. Logique identique partout, factorisable dans un helper `pickProvider(task: TaskKind, settings: UserSettings)`.

## Retry / fallback

Helper unique côté call site :

```ts
async function callWithRetryAndFallback(provider, opts, task) {
  for (let i = 0; i < 2; i++) {
    try { return await provider.call(opts) }
    catch (e) { if (e.kind === 'network') continue; throw e }
  }
  // 2 échecs réseau → throw, modal affiche bouton "Try with cloud"
  
  // pour les JSON: 2 retries automatiques avec prompt renforcé "OUTPUT VALID JSON ONLY"
  // si toujours KO → idem, modal affiche fallback
}
```

UI : la modal montre l'erreur, un bouton **"Try with cloud"** explicite (pas un fallback automatique caché).

## Tasks

1. **Migration V014** : `user_settings` extensions + `runs.provider` / `runs.model`. Document SQL prêt à appliquer par le user avant code.
2. **Provider OpenAI-compat** dans `src/lib/llm.ts`. Tests unit (mock fetch).
3. **Settings UX** : section "Local LLM" sur `SettingsScreen`, hook `useUserSettings` étendu.
4. **Wiring extract** (priorité 1, le user va le sentir tout de suite). Logger `provider` + `model` dans `runs`.
5. **Wiring proposals** (priorité 2, JSON aussi).
6. **Wiring upscale** (token-heavy, prose libre).
7. **Wiring summaries** (batch).
8. **Retry / fallback UI** dans les 4 modals (extract, proposals, upscale, summaries).
9. **Doc setup local** : `docs/demo/local-llm-setup.md` — comment installer Ollama + setup `OLLAMA_ORIGINS=*` + pull modèles recommandés + tester depuis l'app.

## Critères de validation

- typecheck ✓ · lint ✓ · Vitest ✓ · Playwright ✓ · build ✓
- Smoke Chrome live :
  - Toggle off → tout passe par le cloud comme avant, `runs.provider = 'cloud'`.
  - Toggle on, endpoint `http://localhost:11434/v1`, modèle `qwen2.5:14b` :
    - Auto-extract sur une note → JSON valide, candidates retournées, `runs.provider = 'local'` et `runs.model = 'qwen2.5:14b'`.
    - Idem proposals, upscale, summaries.
  - Endpoint éteint → modal affiche erreur + "Try with cloud" en un clic → re-run → succès cloud.
  - JSON invalide simulé (modèle nul, p. ex. `tinyllama`) → 2 retries → modal affiche erreur + "Try with cloud".
  - Toggle off → reset pas les models per-task (rallume → settings préservés).
- Vérification facture OpenAI : pas d'appel cloud quand local activé.

## À noter post-slice

- **Mention resolution sémantique en chapter view** : un pass LLM identifie les références implicites aux entities (pronoms, sobriquets, descriptions) et les link en hover. Devient économiquement viable avec local.
- **Per-task quantization preset** : facilité UX si on veut un selector "Cheap / Balanced / Best" mappant à des couples modèle/quantization plutôt que de demander à l'utilisateur de taper le tag exact.
- **Streaming** : Ollama supporte SSE en OpenAI-compat. Upscale et summaries en streaming = UX premium. Pas dans cette slice.
- **Runs page filtre par provider** : ajouter `provider` au filter set sur `/runs` une fois la colonne en prod.

## Évolution du brainstorm

- Première intuition Claude : commencer par upscale (token-heavy, prose tolérante). User a tranché inverse : extract en premier car (a) fréquence d'usage beaucoup plus élevée, (b) débloque des features token-heavy futures à coût zéro. Reco user > reco Claude, on suit.
- Robustesse JSON : Claude a sur-calibré la crainte. 5090 + 14B+ = JSON propre. Garder retry + fallback comme defense-in-depth, pas comme axe principal.
