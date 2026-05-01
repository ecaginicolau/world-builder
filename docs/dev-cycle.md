# Dev & Test Cycle

How we develop and validate changes locally.

## Layers

| Layer | Tool | When |
|---|---|---|
| Type-check | `tsc -b` (`npm run typecheck`) | Always before commit |
| Lint | ESLint (`npm run lint`) | Always before commit |
| Unit tests | Vitest (`npm test`) | For pure logic (ranks, prompt builders, validators) |
| E2E smoke | Playwright (`npm run test:e2e`) | For "does the app boot, does the critical flow render" |
| Live integration | Claude pilots Chrome via the **Claude in Chrome** extension | For exploratory / UI tests Claude runs while developing |
| Production build | `npm run build` | Smoke before deploy |

## One-time setup

```bash
npm install
npx playwright install chromium  # downloads the browser used by E2E tests
cp .env.example .env.local       # then fill in Supabase URL + anon key
```

## Dev loop

```bash
npm run dev          # starts Vite at http://localhost:5173
npm run typecheck    # in another terminal as you iterate
npm test:watch       # for unit tests
```

## Pre-commit checklist

```bash
npm run typecheck
npm run lint
npm test
npm run build        # catches issues that only surface in prod build
```

## E2E (Playwright)

```bash
npm run test:e2e       # headless, auto-starts dev server
npm run test:e2e:ui    # UI mode for debugging
```

Tests live in `e2e/`. Keep them tied to **observable user value** (login screen renders, can create a world, etc.), not implementation details.

## Live integration via Claude in Chrome

When developing a new feature, Claude can drive the locally running dev server through the **Claude in Chrome** extension:

1. `npm run dev` (background)
2. Claude opens a tab on `http://localhost:5173`
3. Claude clicks, types, takes screenshots, reads console + network — exactly what a human would do for a manual smoke test

This is **complementary** to Playwright:

- Playwright = repeatable, scripted, runs in CI
- Claude-in-Chrome = exploratory, while-coding, catches "looks weird" bugs the test suite doesn't enumerate

## Test data philosophy

- Unit tests: pure functions, no Supabase, no DOM beyond what `@testing-library/react` provides.
- E2E + live integration: hit a real **dev** Supabase project (separate from prod). Reset between runs by truncating user data (script TBD when we have more tables).

## CI (later)

GitHub Actions workflow to run `typecheck` + `lint` + `test` + `build` on every push, plus `test:e2e` on PRs touching frontend code. Out of scope for Slice 0; add when we have collaborators or before public launch.
