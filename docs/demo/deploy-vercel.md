# Deploy World Builder sur Vercel (free tier)

Procédure pas-à-pas pour déployer l'app sur un domaine public, avec les
garde-fous nécessaires pour ne PAS cramer ta clé OpenAI.

L'archi : front statique (Vite PWA) sur **Vercel**, back (Postgres + Auth +
Edge Functions) déjà sur **Supabase cloud** (`erlkawphavrznusabzok`).
Aucun secret ne quitte Supabase.

---

## 0. Avant tout : plafonner OpenAI (5 min)

C'est la **seule** sécurité absolue. Tout le reste, c'est de la défense en profondeur.

1. https://platform.openai.com/account/billing/limits
2. Set un **Hard Limit** mensuel raisonnable (ex: $20). Au-delà, OpenAI coupe l'API.
3. https://platform.openai.com/api-keys → crée une clé **dédiée prod**
   (nomme-la `world-builder-prod`). Tu pourras la révoquer sans casser ton dev local.
4. Garde la clé sous la main pour l'étape 3.

---

## 1. Vercel — créer le projet (5 min)

1. https://vercel.com/new → **Import Git Repository** → sélectionne le repo.
2. Framework preset auto-détecté : **Vite**.
   - Build command : `npm run build` (par défaut)
   - Output directory : `dist` (par défaut)
3. **Environment Variables** (Production + Preview + Development) :
   - `VITE_SUPABASE_URL` = `https://erlkawphavrznusabzok.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = la clé `anon public` (Supabase Dashboard →
     Project Settings → API → `Project API keys` → `anon` `public`)
4. **NE PAS** ajouter `SUPABASE_SERVICE_ROLE_KEY` ni `OPENAI_API_KEY` ici.
   Ces clés ne doivent jamais être accessibles côté front.
5. Deploy. Note l'URL prod, ex : `https://world-builder.vercel.app`.

---

## 2. Supabase — verrouiller Auth (5 min)

Dashboard Supabase → **Authentication** → **URL Configuration** :

- **Site URL** : `https://world-builder.vercel.app` (ton URL prod)
- **Redirect URLs** : ajouter (un par ligne)
  - `https://world-builder.vercel.app/**`
  - `https://*-<ton-org>.vercel.app/**` (pour les preview deploys)
  - `http://localhost:5173/**` (pour le dev)

Toute autre URL sera rejetée par les magic links → un attaquant ne peut pas
rediriger vers son propre site.

Dashboard Supabase → **Authentication** → **Providers** → **Email** :

- **Confirm email** = ON (par défaut). Empêche un script de créer 1000 comptes
  avec des emails jetables.

---

## 3. Supabase — redéployer `llm-call` (5 min)

C'était le **trou critique**. La fonction était déployée `--no-verify-jwt`,
ce qui la rendait publique. La clé anon dans le bundle ne protégeait rien
(elle est faite pour être publique). N'importe quel visiteur pouvait POST sur
l'URL et brûler ta facture OpenAI.

Le code dans `supabase/functions/llm-call/index.ts` a été patché pour :
- Exiger un JWT valide (verify_jwt ON par défaut).
- Whitelister les origines via `LLM_ALLOWED_ORIGINS`.
- Rate-limiter à 30 appels / 5 min par utilisateur.

### Configurer les secrets

Dashboard Supabase → **Project Settings** → **Edge Functions** → **Secrets** :

| Secret | Valeur |
|---|---|
| `OPENAI_API_KEY` | la clé prod créée à l'étape 0 |
| `LLM_ALLOWED_ORIGINS` | `https://world-builder.vercel.app` (sépare par virgule pour en mettre plusieurs ; localhost est déjà autorisé en dur) |

### Redéployer la fonction

Option A — CLI (recommandé) :

```bash
supabase functions deploy llm-call
# ⚠️ NE PAS passer --no-verify-jwt
```

Option B — Dashboard :
1. Edge Functions → `llm-call` → upload le contenu de `supabase/functions/llm-call/index.ts`
2. **Settings** de la fonction → **Verify JWT** = **ON**

### Vérifier

```bash
# Doit renvoyer 401 unauthorized (sans JWT) :
curl -X POST https://erlkawphavrznusabzok.functions.supabase.co/llm-call \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}]}'

# Doit renvoyer 403 origin_not_allowed (origine non whitelistée) :
curl -X POST https://erlkawphavrznusabzok.functions.supabase.co/llm-call \
  -H "Origin: https://evil.example.com" \
  -H "Authorization: Bearer <un JWT user valide>" \
  -d '{"messages":[{"role":"user","content":"hi"}]}'
```

---

## 4. Smoke test prod (5 min)

1. Ouvre `https://world-builder.vercel.app` dans une fenêtre privée.
2. Login par magic link → vérifie que le mail arrive et que la redirection marche.
3. Crée un world, une note, lance un chat IA → confirme que la complétion arrive.
4. Network tab : la requête vers `llm-call` doit avoir un header `Authorization: Bearer eyJ…` (JWT user, pas la clé anon).
5. Network tab : aucune requête directe vers `api.openai.com`.

Si tout passe, c'est bon — l'app est en ligne et étanche aux principaux risques.

---

## Checklist sécurité (à relire dans 1 mois)

- [ ] Hard limit OpenAI configuré (et pas trop haut)
- [ ] Clé OpenAI prod ≠ clé dev
- [ ] `OPENAI_API_KEY` est UNIQUEMENT dans les secrets Supabase Edge Functions
- [ ] `SUPABASE_SERVICE_ROLE_KEY` n'est ni dans Vercel ni dans le repo
- [ ] `llm-call` déployée avec verify_jwt ON
- [ ] `LLM_ALLOWED_ORIGINS` contient uniquement les domaines légitimes
- [ ] RLS activée sur toutes les tables (vérifié : 22/22 au commit actuel)
- [ ] Site URL + Redirect URLs dans Supabase = uniquement domaines légitimes
- [ ] Email confirmation = ON

---

## Coût attendu (free tier)

Pour quelques users actifs :
- **Vercel Hobby** : 100 GB bande passante / mois → largement suffisant.
- **Supabase Free** : 500 MB Postgres, 2 GB bande passante, 500 K Edge Function invocations / mois.
- **OpenAI** : dépend de l'usage. Avec un hard limit à $20, tu es plafonné quoi qu'il arrive.

Les seuls paliers payants à surveiller plus tard : Supabase Pro ($25/mois) si
la DB dépasse 500 MB ou si tu veux des backups quotidiens.
