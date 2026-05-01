# Slice 3.x — Polish : Nav + Settings + Monitoring + Cache fix

> Première phase du polish post-Slice 3/4. Pose les fondations (nav, settings, monitoring) sur lesquelles s'appuieront 3.y (couleurs+highlight) et 4.x/4.y (parity, archive).

## Goal

Au bout de Slice 3.x, l'user a :

1. **Une vraie barre de navigation** (Option A : sticky top header) avec tabs Notes/Entities/Books + accès Settings + dropdown world switch. Plus besoin de revenir au world dashboard pour switcher de section.
2. **Un écran Settings** (`/worlds/$worldId/settings`) avec deux sections :
   - **Global** : debounce auto-extraction (default 5000ms)
   - **Per-world** : custom prompt addition (textarea, appended au system prompt de tous les chats du world)
3. **Un panneau de monitoring** togglable en footer qui list les 20 derniers `runs` (kind / model / status / duration / usage tokens, cliquer = expand input_summary + error).
4. **Bug fix** : auto-extract ne re-fire plus quand on revisit une note non modifiée (cache survit aux remounts).

## Phases

### Phase A — autonome

- A.1 — V006 (déjà écrite) : `worlds.custom_prompt` + `entity_types.color` (color sera utilisé en 3.y, mais migration combinée pour limiter les round-trips).
- A.2 — Types : ajouter `custom_prompt: string | null` à `World` ; ajouter `color: string | null` à `EntityType` (utilisé en 3.y, défini dès maintenant pour éviter les re-deploys de hooks).
- A.3 — `<AppHeader>` composant (`src/components/AppHeader.tsx`) :
  - Layout : `[World ▾] | [Notes][Entities][Books] | [Monitoring 📊][⚙]`
  - World dropdown : list des worlds + lien "All worlds"
  - Tabs : highlight actif via `useRouterState().location.pathname`
  - Mobile (<640px) : tabs en icônes (📝 🧬 📚)
  - Hauteur fixe 40px, sticky top, `z-40`
- A.4 — Sub-header optionnel (`<ContextHeader>`) : prop slot dans les routes de détail pour back + actions (`← Back to X` + boutons "Promote", "Delete", etc.). Hauteur ~32px.
- A.5 — Refactor `RootLayout` : monte `<AppHeader>` quand authentifié + non-login route. Les écrans existants se débarrassent de leur header redondant et déclarent leur sub-header via le slot.
- A.6 — Hook `useUserSettings()` (read + update) :
  - Query : `select * from user_settings where user_id = auth.uid()`. Si null → renvoie defaults `{}`.
  - Schema préférences : `{ autoExtractDebounceMs?: number, monitoringOpen?: boolean }`
  - Mutation `useUpdateUserSettings({ patch })` : upsert sur user_settings.preferences (merge JSON côté client + write).
- A.7 — `SettingsScreen` route à `/worlds/$worldId/settings` :
  - Section "Global" : input number "Auto-extract debounce (ms)" (default 5000, min 500, max 30000) + Save
  - Section "Per-world" : textarea "Custom prompt addition" + Save (uses `useUpdateWorld({ custom_prompt })`)
  - Pas de loader bloquant : optimistic update, error inline
- A.8 — Mettre à jour `prompt.ts` : si `world.custom_prompt` non vide, l'append à la fin du system prompt (après les sections existantes). Nouveau test Vitest.
- A.9 — Mettre à jour `ChatPanel` : passer `worldCustomPrompt` (depuis `useWorld`) à `getLlm().chat({...})`. Ajouter le champ optionnel au type `ChatRequest`.
- A.10 — Fix cache auto-extract : sortir `fromHash` du `useState` du hook, le mettre dans une `Map<noteId, hash>` au niveau module (singleton) ou dans Zustand. Reset de la map = jamais (sauf user logout, mais on s'en fout pour le polish). Effet = revisit sans modif → no fire.
- A.11 — Wire debounce setting : `useAutoExtract` lit `useUserSettings().autoExtractDebounceMs ?? 5000` au lieu du `DEBOUNCE_MS` constant.
- A.12 — `<MonitoringPanel>` composant (`src/components/MonitoringPanel.tsx`) :
  - Footer collant en bas, hauteur 240px quand ouvert, 32px quand fermé (juste une barre avec toggle + dernier run + status)
  - Hook `useRecentRuns(worldId, limit=20)` : poll 5s ou refetch on focus
  - Tableau : timestamp · kind · model · status (color) · duration_ms · prompt+completion tokens
  - Click row → expand inline : `input_summary` json viewer + `error_message`
  - Toggle button dans `<AppHeader>` (📊 icône, badge count si runs récents avec error)
  - State `monitoringOpen` persisté via `useUserSettings`
- A.13 — Tests + pilote local
- A.14 — Docs (NEXT-STEPS + memory) + commit

### Phase B — user (~30 sec)

- B.1 — Apply `V006__slice_3x_nav_settings_colors.sql` (note : color column ne sera utilisée qu'en 3.y mais déjà créée)
- B.2 — Pilote : tester nav, settings (changer debounce → vérifier nouvelle valeur appliquée ; custom prompt → vérifier que le LLM le respecte), monitoring (envoyer un chat → voir le run apparaître)

## Décisions unilatérales

- **Route Settings** : `/worlds/$worldId/settings` (pas `/settings` global). Justification : la moitié des settings est per-world (custom prompt), et l'user est toujours dans un world context quand il veut config — pas de friction.
- **AppHeader pas affiché** sur `/login` ni `/` (index loading).
- **Mobile breakpoint** des tabs : <640px (Tailwind `sm`). Au-dessus = label texte ; en dessous = icônes.
- **Monitoring poll** : 5s d'intervalle quand panneau ouvert, jamais quand fermé. Pas de WebSocket / Realtime pour cette slice.
- **`monitoringOpen` persisté** par-user (user_settings.preferences) — survit aux refresh.
- **Cache auto-extract** : Map au niveau module en mémoire (singleton). Pas persisté DB ni localStorage — ré-extraire après refresh est acceptable (et utile : le user pourrait avoir ajouté des entités entre temps).
- **Defaults user_settings** : si row n'existe pas, on l'upsert au premier write. Pas de pré-seed.

## Anti-patterns à NE PAS faire dans 3.x

- ❌ Implémenter colors+highlight (Slice 3.y)
- ❌ Refactor parity chapter (Slice 4.y)
- ❌ Notes archive UX (Slice 4.x)
- ❌ Settings prompt complets éditables (juste l'addition pour cette slice)
- ❌ Monitoring avancé (graphs, filtres, export) — juste la table de base
- ❌ Realtime sur runs (poll 5s suffit)

## Definition of Done

- [ ] V006 appliquée
- [ ] AppHeader visible sur tous les écrans authentifiés, navigation entre sections fluide
- [ ] SettingsScreen accessible via ⚙, debounce + custom prompt sauvegardent en DB
- [ ] Custom prompt apparaît bien dans le system prompt LLM (vérifier en pilote live)
- [ ] Auto-extract debounce respecte la valeur des settings
- [ ] Monitoring panel toggle marche, list les runs récents avec timing
- [ ] Auto-extract cache : revisit sans modif → pas de re-fire (vérifier en console / network tab)
- [ ] typecheck/lint/vitest/playwright verts
