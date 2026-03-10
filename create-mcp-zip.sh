#!/usr/bin/env bash
set -e
REPO="/Users/MinddMacBen/business-canvas-chatkit"
OUT="/Users/MinddMacBen/Downloads/business-canvas-mcp-export.zip"
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

cd "$REPO"

# 1) MCP server core
mkdir -p "$TMP/mcp-server"
cp mcp-server/server.ts "$TMP/mcp-server/"
cp -r mcp-server/src/server "$TMP/mcp-server/src/"
cp -r mcp-server/src/handlers "$TMP/mcp-server/src/"
cp -r mcp-server/src/core "$TMP/mcp-server/src/"
cp -r mcp-server/src/contracts "$TMP/mcp-server/src/"
cp -r mcp-server/src/steps "$TMP/mcp-server/src/"
cp -r mcp-server/src/middleware "$TMP/mcp-server/src/"
cp mcp-server/agents.ts "$TMP/mcp-server/" 2>/dev/null || true

# 2) Host/Client integratie - UI + bridge
mkdir -p "$TMP/mcp-server/ui"
cp mcp-server/ui/step-card.bundled.html "$TMP/mcp-server/ui/"
cp -r mcp-server/ui/lib "$TMP/mcp-server/ui/"
cp -r mcp-server/ui/assets "$TMP/mcp-server/ui/"
# step-card.template.html bestaat alleen in docs/compare - voeg toe als referentie
mkdir -p "$TMP/mcp-server/docs/compare/old_v2_2026-02-14/ui"
cp mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.template.html "$TMP/mcp-server/docs/compare/old_v2_2026-02-14/ui/" 2>/dev/null || true

# 3) Deployment & manifest
cp mcp-server/package.json "$TMP/mcp-server/"
cp mcp-server/Dockerfile "$TMP/mcp-server/"
cp mcp-server/deploy-apprunner.sh "$TMP/mcp-server/" 2>/dev/null || true
mkdir -p "$TMP/mcp-server/scripts"
cp mcp-server/scripts/copy-ui-dist.mjs "$TMP/mcp-server/scripts/"
cp mcp-server/scripts/prepare-presentation-assets.mjs "$TMP/mcp-server/scripts/"
cp mcp-server/scripts/dev-start.mjs "$TMP/mcp-server/scripts/"
cp mcp-server/scripts/verify-ui-runtime-artifacts.mjs "$TMP/mcp-server/scripts/"
cp mcp-server/scripts/contract-smoke.mjs "$TMP/mcp-server/scripts/"
cp deploy-next.sh "$TMP/" 2>/dev/null || true

# 4) App descriptor / docs
cp mcp-server/README.md "$TMP/mcp-server/" 2>/dev/null || true
cp README.md "$TMP/" 2>/dev/null || true
mkdir -p "$TMP/docs"
cp docs/predeploy-checklist-v2-mcp-bootstrap-locale.md "$TMP/docs/" 2>/dev/null || true

# tsconfig voor referentie
cp mcp-server/tsconfig.build.json "$TMP/mcp-server/" 2>/dev/null || true
cp mcp-server/tsconfig.ui.json "$TMP/mcp-server/" 2>/dev/null || true

cd "$TMP"
zip -r "$OUT" . -x "*.test.ts" -x "*.spec.ts" -x "__pycache__/*" -x "node_modules/*"
echo "Created: $OUT"
