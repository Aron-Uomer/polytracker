# Deploying Whole Record

Architecture: **Vercel** (frontend) + **Render** (API) + **Neon** (Postgres, already set up).
The frontend and API deploy as two separate services, each with its own env vars.

---

## 0. Push to GitHub (one time)

Deploys pull from a Git repo. From the `wholerecord/` folder:

```bash
git init
git add .
git commit -m "Whole Record"
git branch -M main
git remote add origin https://github.com/<you>/wholerecord.git
git push -u origin main
```

Your `.env` files are git-ignored, so no secrets are pushed. Good.

---

## 1. Deploy the API on Render

1. In [Render](https://render.com) → **New → Blueprint** → connect this repo. Render reads
   `render.yaml` and creates the **polytrack-api** web service (root dir `server/`).

   > The service is still named `polytrack-api` after the rename to Whole Record. Render
   > identifies services by name, so changing it provisions a *new* service on a *new*
   > hostname rather than renaming this one — which means updating `API_PUBLIC_URL`,
   > `CORS_ORIGIN`, `APP_URL` and Vercel's `VITE_API_BASE` together, re-adding the origin in
   > Google Cloud Console, and re-pointing the NOWPayments IPN callback. Payments would
   > silently fail to grant Pro in any window where those disagree. The name is internal —
   > no visitor ever sees it.
2. Open the service → **Environment** and set the secret vars (the `sync:false` ones):

   | Var | Value |
   | --- | --- |
   | `DATABASE_URL` | your Neon connection string |
   | `AUTH_SECRET` | a long random string (e.g. `openssl rand -hex 32`) |
   | `CORS_ORIGIN` | *(fill in after step 2)* your Vercel URL |
   | `APP_URL` | *(after step 2)* same as `CORS_ORIGIN` |
   | `API_PUBLIC_URL` | this service's URL, e.g. `https://polytrack-api.onrender.com` |
   | `GOOGLE_CLIENT_ID` | *(optional)* your Google OAuth client id |
   | `NOWPAYMENTS_API_KEY` | *(optional)* live NOWPayments key |
   | `NOWPAYMENTS_IPN_SECRET` | *(optional)* live NOWPayments IPN secret |

   `PORT`, `NODE_ENV`, and `NOWPAYMENTS_API_URL` are set automatically by the blueprint.
3. Deploy. The build runs `prisma generate` + `prisma migrate deploy` + `tsc`.
   Health check is `GET /api/health`. Note the service URL.

### One-time: baseline the database (REQUIRED before the next deploy)

The schema was originally created with `prisma db push`, which leaves no
migration history. The build now uses `prisma migrate deploy`, which will try to
apply `0_init` to a database whose tables already exist and fail with
"relation already exists". Tell Prisma the initial migration is already applied —
**once**, from your machine, before pushing the next deploy:

```bash
cd server
# DATABASE_URL must point at the SAME database Render uses.
npx prisma migrate resolve --applied 0_init
```

This writes a single row to `_prisma_migrations`. It creates, alters and drops
nothing. Verify with `npx prisma migrate status` — it should report the database
is up to date.

**From then on**, schema changes go: edit `schema.prisma` → `npx prisma migrate
dev --name <what-changed>` locally → commit the generated folder in
`server/prisma/migrations/`. Render applies it on deploy. Never run `db push`
against production again.

> Render's free tier **sleeps after ~15 min idle**, so the first request after that takes
> ~30–60s to wake. Fine for launch; upgrade to a paid instance to keep it always-on.

---

## 2. Deploy the frontend on Vercel

1. In [Vercel](https://vercel.com) → **Add New → Project** → import this repo.
2. Set **Root Directory** to `client`. Vercel picks up `client/vercel.json` (build `npm run build`,
   output `dist`).
3. Add **Environment Variables**:

   | Var | Value |
   | --- | --- |
   | `VITE_API_BASE` | your Render API URL, e.g. `https://polytrack-api.onrender.com` |
   | `VITE_GOOGLE_CLIENT_ID` | *(optional)* same Google client id as the server |
   | `VITE_GA_ID` | *(optional)* GA4 measurement id, `G-XXXXXXXXXX` — see below |

4. Deploy. Note the Vercel URL (e.g. `https://wholerecord.vercel.app`).

### Google Analytics

1. [analytics.google.com](https://analytics.google.com) → **Admin → Create → Property**. Name it
   Whole Record, pick your timezone and currency.
2. Choose **Web** as the platform and enter your site URL. Google issues a **measurement id**
   shaped `G-XXXXXXXXXX` — that is the only value you need.
3. Set `VITE_GA_ID` to it in Vercel → **Settings → Environment Variables**, then redeploy.
   Vite bakes env vars in at build time, so **adding the variable does nothing until you
   redeploy**.
4. Verify in GA4 under **Reports → Realtime** while loading the live site in another tab.

Leaving `VITE_GA_ID` unset loads no script and sets no cookie. Analytics is also off on the
dev server even when the id is present, so local clicking never pollutes the property.

**Why this isn't just the copy-paste snippet.** The app uses hash routing, so
`location.pathname` is always `/` — the standard gtag snippet would file the landing page,
the leaderboard and every trader page under one URL. `client/src/analytics.ts` sends a
synthetic path per route instead (`/`, `/trader`, `/leaderboard`, `/smart-money`,
`/compare`, `/watchlist`), with `send_page_view: false` on the config call so views aren't
double-counted.

Events sent beyond page views:

| Event | When | Parameters |
| --- | --- | --- |
| `wallet_lookup` | a wallet is searched — the core action | `wallet`, `refresh` |
| `login` | sign-in or registration succeeds | `had_pending_track` |
| `add_to_watchlist` | a wallet is tracked | `wallet` |
| `watchlist_limit_hit` | the free cap blocks a track — upgrade intent | `plan` |
| `begin_checkout` | before redirecting to NOWPayments | `value`, `currency` |

`wallet` is an event parameter rather than part of the URL on purpose: as a path it would
give every address its own page and shred the reports into thousands of single-visit rows.
To break events down by wallet, register it as a custom dimension in **Admin → Custom
definitions**.

> **Consent.** GA4 sets cookies, and there is no cookie banner on the site. If you expect
> visitors in the EU/UK, that is a GDPR question worth answering before you drive traffic.
> Vercel Analytics is cookieless and needs no banner, if you would rather avoid it.

### Security headers

`client/vercel.json` sets `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS, COOP and a
minimal CSP on every response. Two deliberate choices worth knowing before you change them:

- **COOP is `same-origin-allow-popups`, not `same-origin`.** The stricter value severs
  `window.opener`, which can break the Google sign-in popup.
- **The CSP only carries directives that can't break the app** (`frame-ancestors`, `base-uri`,
  `object-src`, `form-action`). A full policy has to allow-list every origin the page talks to, and
  getting it wrong takes the site down. If you want one, start from this and **test it on a preview
  deployment** — substituting your own API URL:

  ```
  default-src 'self';
  script-src 'self' https://accounts.google.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src https://fonts.gstatic.com;
  img-src 'self' data: https:;
  connect-src 'self' https://YOUR-API.onrender.com https://accounts.google.com;
  frame-src https://accounts.google.com;
  frame-ancestors 'none'; base-uri 'self'; object-src 'none'
  ```

  `style-src` needs `'unsafe-inline'` because the charts set inline `style` attributes, and
  `connect-src` **must** list your Render API or every request fails.

> `vercel.json` is schema-validated on deploy — it rejects unknown keys, so don't add comments to it.

---

## 3. Wire the two URLs together (the chicken-and-egg step)

Now that you have both URLs, close the loop:

- On **Render** → set `CORS_ORIGIN` and `APP_URL` to your **Vercel URL** → redeploy.
- On **Vercel** → confirm `VITE_API_BASE` is your **Render URL** → redeploy.

(`VITE_API_BASE` makes the frontend call the deployed API instead of the dev proxy;
`CORS_ORIGIN` lets the API accept requests from your frontend.)

---

## 4. Provider settings for production

- **Google sign-in:** in Google Cloud Console → your OAuth client → **Authorized JavaScript
  origins**, add your Vercel URL (e.g. `https://wholerecord.vercel.app`). Move the OAuth consent
  screen to **In production** (or keep test users).
- **NOWPayments (live):** switch to your live API key + IPN secret, keep
  `NOWPAYMENTS_API_URL=https://api.nowpayments.io/v1`, and make sure `API_PUBLIC_URL` is your
  Render URL so IPN callbacks reach `…/api/billing/webhook`.

---

## Quick env checklist

**Render (API):** `DATABASE_URL`, `AUTH_SECRET`, `CORS_ORIGIN`, `APP_URL`, `API_PUBLIC_URL`,
`GOOGLE_CLIENT_ID?`, `NOWPAYMENTS_API_KEY?`, `NOWPAYMENTS_IPN_SECRET?`
(`PORT`, `NODE_ENV`, `NOWPAYMENTS_API_URL` come from `render.yaml`).

**Vercel (frontend):** `VITE_API_BASE`, `VITE_GOOGLE_CLIENT_ID?`

Anything with `?` is optional (feature stays hidden/disabled if unset).
