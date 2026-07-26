# Deploying Perx Play (demo hosting)

The app runs as **one Node process** (Next.js + Socket.IO + background jobs) with PostgreSQL.
Any host that supports WebSockets works. **Vercel alone does not** — it can't run the
Socket.IO server, so multiplayer lobbies would never connect. Use one of the paths below
for demos; see the last section for the eventual Vercel-hybrid production setup.

On boot the start command runs migrations and the (idempotent) seed, so a fresh deploy
comes up with the demo accounts, both venues, the book catalog, and lobby `PERX23` ready
to show.

---

## Option A — Render (recommended: this repo includes the blueprint)

~10 minutes. Starter plan ≈ $7/mo + $6/mo Postgres; the **free tier also works** for a
demo but the app sleeps after 15 idle minutes (first visitor waits ~40s while it wakes).

1. Create an account at https://render.com and connect your GitHub.
2. **New → Blueprint** → select `nashaubrown/Perx-Game-Hub`, branch
   `claude/perx-play-portal-wyonvq`. Render reads `render.yaml` and creates the web
   service + database automatically.
3. When it asks for `APP_URL`, paste the URL Render shows for the service
   (e.g. `https://perx-play.onrender.com`) — it's used in QR codes and share links.
4. Deploy. When it's live, open the URL and log in with the demo accounts
   (`nashau` / `perxplay` etc. — see README).

## Option B — Railway (Dockerfile included)

~10 minutes, usage-based (~$5/mo for a demo).

1. https://railway.app → New Project → **Deploy from GitHub repo** → pick this repo +
   branch. Railway detects the `Dockerfile`.
2. In the project: **+ New → Database → PostgreSQL**.
3. On the app service → Variables:
   - `DATABASE_URL` → reference the Postgres service's `DATABASE_URL`
   - `JWT_SECRET`, `MYPERX_SHARED_SECRET`, `MYPERX_TOKEN_SECRET` → any long random strings
   - `APP_URL` → the public domain Railway assigns (Settings → Generate Domain)
4. Deploy. Done.

## Sharing with partners

- Send the URL + demo logins (`nashau` / `perxplay`, merchant `meraki`, admin `admin`).
- Lobby `PERX23` is pre-seeded — two phones + that code is the 60-second demo.
- The embed widget for the merchant-portal story:
  `https://<your-url>/embed/venue/<venueId>?token=<analyticsToken>` (both values are on
  the meraki dashboard's integration card).
- Books download from Project Gutenberg on first open — the first tap on each book takes
  a few seconds, then it's cached.

## Demo-hosting caveats (fine for partners, fix before production)

- **Ephemeral disk**: admin-uploaded books/covers and the Gutenberg cache are lost on
  redeploy (the catalog re-fetches itself). Production wants S3-style storage.
- **Free tiers sleep** — for a partner meeting, load the site 5 minutes beforehand, or
  pay for the always-on tier for the demo week.
- Password-reset emails still just log to the server console (no email provider wired).

## The eventual production shape (where Vercel fits)

For scale, split the two halves (the code already supports it):

- **Vercel**: the Next.js app (pages + API routes) — connect the repo, set
  `DATABASE_URL` (e.g. Neon/Vercel Postgres), and `NEXT_PUBLIC_SOCKET_URL` pointing at…
- **Socket host** (Railway/Fly/VPS): `npm run start:socket` — runs Socket.IO + the
  background jobs on `SOCKET_PORT`, sharing the same `DATABASE_URL`.

Don't do this for the demo — one Render/Railway service is simpler and identical for
your partners.
