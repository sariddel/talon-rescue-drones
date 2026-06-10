#!/usr/bin/env bash
# One-shot deploy of the TALON leaderboard Worker.
# Prereq: run `wrangler login` once first.
set -e
cd "$(dirname "$0")"

echo "==> Creating KV namespace (idempotent-ish)…"
OUT=$(npx --yes wrangler kv namespace create TALON_LB 2>&1 || true)
echo "$OUT"
KVID=$(echo "$OUT" | grep -oE '"?id"?[ =:]+"?[a-f0-9]{32}"?' | grep -oE '[a-f0-9]{32}' | head -1)

if [ -z "$KVID" ]; then
  # already exists — look it up
  KVID=$(npx --yes wrangler kv namespace list 2>/dev/null | grep -B1 -i 'TALON_LB' | grep -oE '[a-f0-9]{32}' | head -1)
fi
if [ -z "$KVID" ]; then echo "!! Could not determine KV id. Run 'wrangler kv namespace create TALON_LB' manually."; exit 1; fi
echo "==> KV id: $KVID"

# patch wrangler.toml
sed -i.bak -E "s/id = \"[^\"]*\"/id = \"$KVID\"/" wrangler.toml
echo "==> wrangler.toml updated."

echo "==> Deploying Worker…"
npx --yes wrangler deploy
echo "==> Done. Copy the workers.dev URL above into assets/js/game.js (LB_API)."
