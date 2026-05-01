# Frontend Stack

Stack React/TS retenue pour la PWA.

## Vue d'ensemble

| Couche | Choix | Rôle |
|---|---|---|
| Bundler | Vite | Dev server + build |
| Framework | React 18 + TypeScript | UI |
| Routing | TanStack Router | Routing type-safe (cohérent avec TanStack Query) |
| UI state | Zustand | État local (monde courant, drawers, etc.) |
| Data state | TanStack Query | Cache + invalidation des appels Supabase |
| Backend client | @supabase/supabase-js | DB + Auth + Edge Functions |
| Forms | React Hook Form + Zod | Édition entités/types avec schémas dynamiques |
| Styling | Tailwind CSS | Utility-first CSS |
| Composants | shadcn/ui | Composants Radix copiés dans le repo, modifiables |
| Drag-and-drop | dnd-kit | Réordonnancement (timeline, listes) |
| Layout | react-resizable-panels | Split chapitre / drawer contexte |
| Icons | lucide-react | Icônes (déjà couplé à shadcn) |
| Rich text | Tiptap | Éditeur unique pour notes (config minimale) ET chapitres (config riche), avec extension entity-highlight |
| PWA | vite-plugin-pwa | Manifest + service worker (installable + cache offline) |

## Justifications rapides

### TanStack Router (vs React Router)
- Type-safety au top : params et search params typés
- Couple naturellement avec TanStack Query
- File-based routing pour la simplicité
- React Router reste un fallback si on rencontre des frictions

### Zustand (vs Redux/Jotai)
- API minuscule, ~1 Ko, zéro boilerplate
- Bien adapté à un état UI simple ; pas besoin de Redux Toolkit ici
- Très AI-friendly (peu d'idiomes obscurs)

### TanStack Query
- Tous les appels à Supabase sont async → cache + invalidation valent leur poids en or
- Évite de réinventer toute la logique de fetch/refetch/optimistic updates
- Permet "background refresh" facile quand on créera des nouvelles versions d'entités
- S'interface naturellement avec Supabase Realtime (un changement Realtime → invalidate)

### React Hook Form + Zod
- Les EntityTypes définissent des champs dynamiques → besoin d'un form lib qui gère les schémas runtime
- Performance excellente sur formulaires longs (un Character peut avoir 20+ champs)
- Zod côté validation, partagée avec les Edge Functions si besoin

### Tailwind + shadcn/ui (vs Mantine/MUI)
- shadcn copie le code des composants dans `src/components/ui/` → Claude peut éditer librement
- Pas de lock-in npm : si une variante manque, on l'ajoute en local
- Combo le plus représenté dans le code récent → idéal pour codegen
- Mantine est une bonne alternative "batteries-included" mais moins flexible

### Tiptap (vs Lexical/Slate)
- Construit sur ProseMirror, archi mature
- Écosystème énorme : extensions pour mentions, collab, markdown, code, etc.
- Permettra plus tard d'**auto-highlighter les entités** dans le draft (custom mark)
- Lexical (Meta) est très bien aussi mais doc React un peu moins fournie

### dnd-kit (vs react-beautiful-dnd)
- react-beautiful-dnd n'est plus maintenu
- dnd-kit est moderne, headless, bonne perf

### vite-plugin-pwa
- Génère manifest + service worker
- Installable sur desktop (Chrome/Edge "Install app") et mobile (Safari/Chrome "Add to Home Screen")
- Cache des assets statiques par défaut → démarrage instantané
- Plus tard : stratégie offline avancée (cache des données via TanStack Query persisteur)

## Dépendances initiales (estimation)

```jsonc
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "@tanstack/react-router": "^1",
    "@tanstack/react-query": "^5",
    "@supabase/supabase-js": "^2",
    "zustand": "^4",
    "react-hook-form": "^7",
    "zod": "^3",
    "@hookform/resolvers": "^3",
    "@tiptap/react": "^2",
    "@tiptap/starter-kit": "^2",
    "@dnd-kit/core": "^6",
    "@dnd-kit/sortable": "^8",
    "react-resizable-panels": "^2",
    "lucide-react": "latest",
    "clsx": "^2",
    "tailwind-merge": "^2"
  },
  "devDependencies": {
    "vite": "^5",
    "@vitejs/plugin-react": "^4",
    "vite-plugin-pwa": "^0.20",
    "typescript": "^5",
    "tailwindcss": "^3",
    "postcss": "^8",
    "autoprefixer": "^10",
    "@tanstack/router-plugin": "^1",
    "supabase": "^1"
  }
}
```

Versions à figer au moment du scaffold.

## Liens

- [NEXT-STEPS.md](./NEXT-STEPS.md)
- [architecture.md](./architecture.md)
- [backend.md](./backend.md)
