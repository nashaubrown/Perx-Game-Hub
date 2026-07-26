<p align="center">
  <img src="public/brand/lockup-green.svg" alt="Perx" width="96" />
</p>

# Perx Play

A mobile-first web portal for restaurants and cafes in the Maldives. Diners log in with a Perx handle, play games together at the table (host creates a lobby, friends join with a 6-character code), read books while they wait, and earn Perx points. Merchants get a dashboard showing how customers engage at their venue, plus rewards redemption.

Built as a PWA — installable, designed and tested at 375px first.

## Quick start

```bash
# 1. Postgres (any Postgres 14+ works)
createuser perx -P            # password: perx (or edit .env)
createdb perx_play -O perx

# 2. Configure
cp .env.example .env          # set DATABASE_URL + JWT_SECRET

# 3. Install, migrate, seed
npm install
npx prisma migrate dev
npm run db:seed

# 4. (optional) pre-download the book catalog from Project Gutenberg
npm run books:fetch           # otherwise books are fetched+cached on first open

# 5. Run — Next.js + Socket.IO in one process
npm run dev                   # http://localhost:3000
```

**Demo logins** (password `perxplay` for all):

| Handle | Role |
|---|---|
| `@nashau`, `@aisha`, `@hassan`, `@mariyam` | Players |
| `@meraki` | Merchant (Meraki Coffee Roasters + Sea House Café) |
| `@admin` | Admin (book uploads) |

A demo Trivia Battle lobby is seeded at code **`PERX23`**, tagged to Meraki Coffee. Open `/join`, enter the code from two phones/tabs, and play.

## Architecture

```
server/index.ts        one entry, two modes:
│                        default: Next.js + Socket.IO on one port (single VPS)
│                        SOCKET_STANDALONE=1: Socket.IO only (Vercel frontend + small socket host)
├─ server/realtime/    lobby registry, join/rejoin, socket auth from the same httpOnly JWT cookie
└─ server/games/       server-authoritative engines: trivia, wordrush, emoji
                       (clients send intents; ALL scoring happens here)

src/app/               Next.js App Router pages + API routes
├─ api/auth,guest      own auth: bcrypt + JWT in httpOnly cookies; guest sessions by nickname
├─ api/lobbies         create lobby → 6-char join code (no 0/O/1/I) + QR
├─ api/books           catalog, epub streaming w/ on-demand Gutenberg fetch+cache, progress, bookmarks
├─ api/solo            memory/2048 completion (capped awards) + fully server-validated daily word
├─ api/merchant        venue analytics, rewards CRUD, redemption validation, webhook config
└─ api/v1/venues/:id/analytics   token-authed endpoint for the main Perx platform

prisma/schema.prisma   User, GuestSession, Venue, MerchantVenue, Game, Lobby, LobbyPlayer,
                       GameSession, GameResult, Book, ReadingProgress, ReadingDay, Bookmark,
                       PointsLedger (append-only), DailyPuzzleResult, Reward, Redemption, WebhookConfig
```

### Design decisions

- **Points are an append-only ledger.** `PointsLedger` rows are never mutated; balance = `SUM(amount)`. Redemptions are negative rows. This keeps merchant analytics and future redemption audits honest.
- **Never trust the client for scores.** Multiplayer scoring lives entirely in the socket engines. Solo games get fixed-size awards with hard per-day caps and sanity bounds; the daily word is evaluated server-side (the answer never reaches the client until the puzzle ends).
- **Reconnects don't kill the game.** Phones lock in cafes: a disconnected player keeps their seat, Socket.IO auto-reconnects, `lobby:join` reclaims the seat, and the engine replays current state (`onRejoin`). Lobby rosters are rehydrated from the DB even after a server restart.
- **Guest mode is first-class.** A table of six doesn't wait for five signups. Guests join with a nickname; after the game they're prompted to sign up, and their ledger + results transfer to the new account.
- **The socket server stays separable.** All realtime code lives in `server/` behind one `attachRealtime(io)` call. Deploy options: (a) one process on a VPS (`npm start`), or (b) Next on Vercel + `npm run start:socket` on a small Node host with `NEXT_PUBLIC_SOCKET_URL` pointed at it.

### Games

| Game | Players | How scoring works |
|---|---|---|
| Trivia Battle | 2–8 | 10 questions, 15s. Correct = 100 + speed bonus up to 100. Early reveal when everyone answers. |
| Word Rush | 2–8 | Shared 5×5 grid, 90s, Boggle adjacency + dictionary. Words nobody else found score ×2. |
| Emoji Guess | 3–8 | Presenter picks a phrase + emojis; first correct guess 150, later 75, presenter 25 per guesser. |
| Memory Match | 1 | Fewer flips + faster = better score. |
| 2048 | 1 | Classic, swipe-first. |
| Daily Word | 1 | One 5-letter word/day (Maldives time), 6 guesses, streak-tracked with streak bonuses. |

Points: +10 per multiplayer game, +50 for the win, +30 (+streak bonus) for the daily word, reading = 5 pts per 5 minutes capped at 60/day, solo games capped at 50/day.

### Books

~50 public-domain classics seeded from Project Gutenberg (EPUB, with covers). Files are fetched and cached in `storage/books` — either up front via `npm run books:fetch` or transparently on first open. Admins upload EPUB/PDF at `/admin` with a **curated/local** flag for Maldivian authors and cafe picks. The reader (epub.js) has font-size controls, light/dark/sepia themes, per-user exact position (CFI), bookmarks, and a once-a-minute server-side reading heartbeat that feeds points.

### Perx platform integration (Phase 2)

- `GET /api/v1/venues/:id/analytics?days=30` with `Authorization: Bearer <analyticsToken>` (token shown in the merchant dashboard). Returns lobbies, games by type, unique/repeat players, sessions per day, peak-hour heatmap, points earned.
- Per-venue webhook: we POST `player_joined`, `game_started`, `game_finished` events, HMAC-SHA256 signed (`X-Perx-Signature`) with the secret returned on save. Fire-and-forget — a dead webhook never affects gameplay.
- Rewards: merchants define rewards; users redeem in-app → short-lived 6-digit code → staff validates at `/merchant/validate` → points deducted from the ledger. Full history on both sides.

## Notes & known MVP simplifications

- **Password reset emails** are logged to the server console (`[password-reset] …`) — no email/SMS provider is wired up since that's a paid decision. Swap in a provider in `src/app/api/auth/forgot/route.ts`.
- **PDF reading** uses the browser's native viewer in an iframe; EPUB (the whole seeded catalog) gets the full custom reader.
- Uploaded files live on local disk (`storage/`); move to object storage before multi-instance deployments.
- Scripts run TypeScript directly via `tsx` — no build step needed for the server.

## Scripts

| Command | What |
|---|---|
| `npm run dev` / `npm start` | App + socket server (dev / production) |
| `npm run dev:socket` / `start:socket` | Socket server only, on `SOCKET_PORT` |
| `npm run db:migrate` / `db:seed` | Prisma migrate / seed demo data |
| `npm run books:fetch` | Pre-download the Gutenberg catalog |
| `npm run typecheck` / `build` | TS check / Next production build |
