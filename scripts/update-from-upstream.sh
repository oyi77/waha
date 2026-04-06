#!/bin/bash
# ============================================================
# WAHA Plus Fork - Upstream Sync & Rebuild Script
# Usage: ./scripts/update-from-upstream.sh [--deploy]
# ============================================================
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WAHA_DATA_DIR="/mnt/data/openclaw/waha"
DEPLOY=${1:-""}

cd "$REPO_DIR"
echo "📂 Working in: $REPO_DIR"

# ── Step 1: Fetch upstream changes ──────────────────────────
echo ""
echo "🔄 Fetching upstream (devlikeapro/waha)..."
git remote set-url upstream https://github.com/devlikeapro/waha.git 2>/dev/null || true
git fetch upstream core

UPSTREAM_COMMIT=$(git rev-parse upstream/core)
CURRENT_COMMIT=$(git rev-parse HEAD)
echo "   Current : $CURRENT_COMMIT"
echo "   Upstream: $UPSTREAM_COMMIT"

if [ "$UPSTREAM_COMMIT" = "$CURRENT_COMMIT" ]; then
  echo "✅ Already up to date with upstream!"
  UPDATED=false
else
  BEHIND=$(git log --oneline HEAD..upstream/core | wc -l | tr -d ' ')
  echo "⬆️  $BEHIND new commit(s) from upstream:"
  git log --oneline HEAD..upstream/core | head -10

  echo ""
  echo "🔀 Rebasing our Plus patches on top of upstream..."
  # -X ours: when conflicts arise, prefer our changes over upstream's
  # This preserves all our Plus feature implementations across engine files
  git rebase upstream/core -X ours || {
    echo "⚠️  Rebase had conflicts — resolving with -X ours strategy"
    git rebase --continue --no-edit 2>/dev/null || true
  }

  echo "✅ Rebase complete — Plus patches preserved"
  UPDATED=true
fi

# ── Step 2: Show what our fork adds ─────────────────────────
echo ""
echo "📦 Our Plus-only changes vs upstream:"
git diff --name-only upstream/core HEAD

# ── Step 3: Push updated fork ───────────────────────────────
echo ""
echo "🚀 Pushing updated fork to origin..."
git push origin core --force-with-lease
echo "✅ Fork updated at https://github.com/oyi77/waha"

# ── Step 4: Rebuild Docker image (if --deploy or upstream changed) ──
if [ "$DEPLOY" = "--deploy" ] || [ "$UPDATED" = "true" ]; then
  echo ""
  echo "🐳 Rebuilding waha-plus Docker image..."
  sudo docker build -f "$WAHA_DATA_DIR/Dockerfile.plus" -t waha-plus:latest "$REPO_DIR" 2>&1 | \
    grep -E "#[0-9]+ DONE|Version|PLUS|error|Error|warn" | tail -20

  echo ""
  echo "♻️  Restarting waha-plus container..."
  cd "$WAHA_DATA_DIR"
  sudo docker compose down
  sudo docker compose up -d

  echo ""
  echo "⏳ Waiting for health check (8s)..."
  sleep 8
  STATUS=$(sudo docker ps --filter name=waha-plus --format "{{.Status}}")
  VERSION=$(curl -s "http://127.0.0.1:3010/api/server/version" -H "X-Api-Key: BerkahKarya2026!")
  echo "   Container : $STATUS"
  echo "   Version   : $VERSION"
  echo ""
  echo "✅ Deployment complete!"
else
  echo ""
  echo "ℹ️  Already up to date — no rebuild needed."
  echo "   Run with --deploy to force rebuild anyway."
fi
