# Deploying PolyTrack

Architecture: **Vercel** (frontend) + **Render** (API) + **Neon** (Postgres, already set up).
The frontend and API deploy as two separate services, each with its own env vars.

---

## 0. Push to GitHub (one time)

Deploys pull from a Git repo. From the `polytrack/` folder:

```bash
git init
git add .
git commit -m "PolyTrack"
git branch -M main
git remote add origin https://github.com/<you>/polytrack.git
git push -u origin main
```

Your `.env` files are git-ignored, so no secrets are pushed. Good.

---

## 1. Deploy the API on Render

1. In [Render](https://render.com) → **New → Blueprint** → connect this repo. Render reads
   `render.yaml` and creates the **polytrack-api** web service (root dir `server/`).
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
3. Deploy. The build runs `prisma generate` + `prisma db push` (creates tables on Neon) + `tsc`.
   Health check is `GET /api/health`. Note the service URL.

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

4. Deploy. Note the Vercel URL (e.g. `https://polytrack.vercel.app`).

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
  origins**, add your Vercel URL (e.g. `https://polytrack.vercel.app`). Move the OAuth consent
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
