# Perx Play — step-by-step setup guide

This gets you from a blank computer to playing Perx Play on your phone in about 15 minutes. No prior setup needed — every tool is free.

---

## Step 1 — Install the two tools you need

### 1a. Node.js (runs the app)

1. Go to <https://nodejs.org>
2. Download the **LTS** version (the button on the left).
3. Run the installer, click Next through everything.
4. **Check it worked:** open a terminal — on Windows search for "PowerShell", on Mac open the "Terminal" app — and type:
   ```
   node -v
   ```
   You should see a version like `v20.x.x` or `v22.x.x`.

### 1b. Docker Desktop (runs the database)

1. Go to <https://www.docker.com/products/docker-desktop/>
2. Download for your OS (Windows/Mac), install, and **open the app once** so the whale icon appears in your menu bar / system tray.
3. **Check it worked:** in the terminal type:
   ```
   docker --version
   ```

> Already have PostgreSQL installed? You can skip Docker — create a user `perx` (password `perx`) and a database `perx_play`, then continue from Step 3.

---

## Step 2 — Start the database

Copy-paste this whole line into the terminal and press Enter:

```
docker run -d --name perx-db -e POSTGRES_USER=perx -e POSTGRES_PASSWORD=perx -e POSTGRES_DB=perx_play -p 5432:5432 postgres:16
```

The first time this downloads Postgres (~150 MB), then starts it in the background.

**Check it worked:** `docker ps` should show a `perx-db` row.

> Later, after a reboot, restart it with: `docker start perx-db`

---

## Step 3 — Get the code

```
git clone https://github.com/nashaubrown/Perx-Game-Hub.git
cd Perx-Game-Hub
git checkout claude/perx-play-portal-wyonvq
```

> If `git` isn't installed: on Mac the terminal will offer to install it — say yes, then rerun. On Windows install it from <https://git-scm.com/download/win> (default options are fine), then reopen PowerShell.

---

## Step 4 — Set up the app

Run these four commands in order, inside the `Perx-Game-Hub` folder:

```
cp .env.example .env
npm install
npx prisma migrate dev
npm run db:seed
```

*(On Windows PowerShell, use `copy .env.example .env` instead of `cp`.)*

What each does:
- `.env` — settings file; the defaults already match the Docker database from Step 2.
- `npm install` — downloads the app's dependencies (a few minutes the first time).
- `prisma migrate dev` — creates all the database tables. If it asks for a migration name, just press Enter.
- `db:seed` — loads demo users, 2 venues, rewards, the 52-book catalog, and a ready-made game lobby.

The seed prints the demo logins when it finishes.

---

## Step 5 — Run it

```
npm run dev
```

Wait for: `[perx-play] app + socket listening on http://localhost:3000`

Open **http://localhost:3000** in your browser. Leave this terminal window open — closing it stops the app.

---

## Step 6 — Try it on your phone (recommended — it's designed for phones)

1. Make sure your phone and computer are on the **same Wi-Fi**.
2. Find your computer's local IP address:
   - **Mac:** System Settings → Wi-Fi → Details → IP Address (e.g. `192.168.1.23`)
   - **Windows:** in PowerShell type `ipconfig` and look for "IPv4 Address"
3. On your phone's browser open: `http://YOUR-IP:3000` (e.g. `http://192.168.1.23:3000`)

---

## Step 7 — A guided tour

All demo accounts use password **`perxplay`**.

1. **Log in as `nashau`** → the home screen shows Host / Join / solo games / books.
2. **Multiplayer with two screens:** there's a pre-seeded Trivia lobby with code **`PERX23`**. On your second device (or an incognito browser window) go to **Join with a code**, enter `PERX23` and a nickname — **no account needed**, guests just pick a name. The host presses *Start the game*.
3. Try hosting each game yourself: Trivia, Word Rush, Emoji Guess (needs 3 players), **Chess**, **Gin Rummy**, **Ludo**, **21 Questions**, **Truth or Dare**. In the lobby, tap the big code to show a **QR** friends can scan.
4. **Guest → account:** after a game, the guest device gets a "keep your points" prompt — sign up and watch the points carry over.
5. **Solo games:** Pac-Man, 2048, Memory Match, Daily Word (streak-tracked).
6. **Books:** open one from the Books tab — first open downloads it from Project Gutenberg (needs internet). Try the font-size / sepia controls; a bookmark and your exact position are saved.
7. **Rewards flow:** as a player, Rewards tab → redeem (needs enough points — play some games first) → you get a 6-digit code. Then log in as **`meraki`** (the merchant) in another window → *Validate a code* → type it in. Check the merchant dashboard's analytics afterwards.
8. **Admin:** log in as **`admin`** → Profile → *Admin — upload books* to add an EPUB/PDF with the local-author badge.

---

## Updating to the latest code

After a `git pull`, always run the full sequence — skipping steps causes stale-cache errors
("Unknown argument" from the database, or a webpack "reading 'call'" error in the browser):

```powershell
git pull
npm install
npx prisma migrate deploy
npx prisma generate
npm run db:seed
Remove-Item -Recurse -Force .next   # (mac/linux: rm -rf .next)
npm run dev
```

Then hard-refresh the browser (Ctrl+Shift+R).

## Fixing common problems

| Symptom | Fix |
|---|---|
| `Can't reach database server at localhost:5432` | Docker isn't running or the container stopped → open Docker Desktop, then `docker start perx-db` |
| `port 3000 already in use` | Something else uses it → run `PORT=3001 npm run dev` and open :3001 |
| Phone can't open the IP address | Same Wi-Fi? Firewall may block Node — allow it when the OS asks (or on Windows: allow "Node.js" in Defender Firewall) |
| Book won't open | That download comes from gutenberg.org — needs internet; try again or another book |
| Forgot-password email never arrives | By design in the MVP — the reset link prints in the terminal running the app |

---

## What this is NOT yet

Running locally is for **checking the product**. To let real diners use it, it needs to be hosted on a server with a public URL (a small VPS, or Railway/Render running `npm start` — Vercel alone can't host the websocket part). That step involves creating a hosting account, so do it when you're ready to pay a few dollars a month.
