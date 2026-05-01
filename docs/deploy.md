# Deploy

How to ship the app to Vercel and connect it to Supabase.

## One-time Vercel setup

1. Create a Vercel account (or sign in) at https://vercel.com — link your GitHub.
2. Import the `ecaginicolau/world-builder` repo (Add New → Project → Import).
3. Framework preset: **Vite** (auto-detected). Build command and output directory are auto-set.
4. **Environment Variables** — add both:
   - `VITE_SUPABASE_URL` = `https://erlkawphavrznusabzok.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = (your anon key from `.env.local`)
5. Deploy.

Subsequent pushes to `main` trigger automatic deployments.

## Configure Supabase Auth for the deployed URL

After the first deploy, take your Vercel URL (e.g. `world-builder-xyz.vercel.app`) and:

1. Supabase dashboard → Authentication → URL Configuration
2. **Site URL**: `https://world-builder-xyz.vercel.app`
3. **Redirect URLs**: add both
   - `https://world-builder-xyz.vercel.app/**`
   - `http://localhost:5173/**`

Without this, magic links bounce back to the wrong host.

## PWA install

Once deployed over HTTPS, the app is installable:

- Desktop Chrome/Edge: install icon in the address bar (or Settings → Install)
- Mobile Chrome (Android): "Add to Home screen" from the menu
- iOS Safari: Share → "Add to Home Screen" (iOS support for installable PWAs is partial — works for our purposes)

## Custom domain (later)

When ready, add a custom domain in Vercel (free, automatic certificate). Update the Supabase Site URL + redirect URLs accordingly.

## CI (later)

Vercel runs the build for us. We don't need GitHub Actions for the frontend until we add things Vercel can't catch (e.g. Edge Function tests, Playwright on PRs).
