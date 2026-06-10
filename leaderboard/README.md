# TALON leaderboard — global board (optional)

The game works out of the box with a **local** leaderboard (each browser sees its own
scores). To make the board **global** — everyone who plays competes on one shared list —
deploy this tiny Cloudflare Worker. It's on Cloudflare's **free tier** (100k requests/day,
1k KV writes/day — far more than a class will ever use) and there is nothing to maintain.

## One-time setup

From this `leaderboard/` folder:

```powershell
# 1. Log in to Cloudflare (opens a browser once)
wrangler login

# 2. Create the KV store and paste the returned id into wrangler.toml
wrangler kv namespace create TALON_LB
#    -> copy the id, replace PUT_KV_ID_HERE in wrangler.toml

# 3. Deploy
wrangler deploy
#    -> prints a URL like https://talon-leaderboard.<you>.workers.dev
```

## Turn it on in the game

Open `../assets/js/game.js`, set:

```js
const LB_API = "https://talon-leaderboard.<you>.workers.dev";
```

then commit + push. GitHub Pages redeploys in ~1 min and the board goes global. The game
shows a green **● GLOBAL** badge when it's connected, and falls back to local automatically
if the Worker is ever unreachable.

## API

| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/board?mode=sar` | — | top 25 entries (array) |
| GET | `/board?mode=asw` | — | top 25 entries (array) |
| POST | `/score` | `{name,mode,score,found,time,pod}` | updated top 25 |

All input is validated and clamped server-side (name stripped of `<>` and capped at 14 chars,
score clamped 0–99,999). CORS is open so the static site can call it.

## Note on tamper-resistance

The Worker URL is visible in the page source, so a determined person could POST a fake score —
this is unavoidable for any client-scored browser game without accounts. For a class demo that's
fine. If you ever want it locked down, the score could be recomputed server-side from the
submitted loadout, or gated behind a shared class password.
