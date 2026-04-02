#!/usr/bin/env bash
# PMSecAI — Developer Onboarding Script
# Run once on each developer's machine after cloning the repo.
# Usage: bash scripts/setup-dev.sh

set -e

echo ""
echo "═══════════════════════════════════════════"
echo "  PMSecAI — Developer Setup"
echo "═══════════════════════════════════════════"
echo ""

# ── Prerequisites ──────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "✗ Node.js is required. Install from https://nodejs.org (v20+)"
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "✗ Node.js v20+ required. Current: $(node -v)"
  exit 1
fi

if ! command -v pnpm &>/dev/null; then
  echo "Installing pnpm..."
  npm install -g pnpm
fi

# ── Build MCP server ───────────────────────────────────────────────────────────
echo "Installing dependencies..."
pnpm install

echo "Building MCP server..."
pnpm --filter @pmsecai/mcp-server build

MCP_PATH="$(pwd)/packages/mcp-server/dist/index.js"

# ── Collect dev info ───────────────────────────────────────────────────────────
echo ""
read -rp "Your full name: " DEV_NAME
read -rp "Your email: " DEV_EMAIL
read -rp "Zoho Client ID: " ZOHO_CLIENT_ID
read -rp "Zoho Client Secret: " ZOHO_CLIENT_SECRET
read -rp "PMSecAI Web URL (e.g. https://pmsecai.vercel.app): " WEB_URL
read -rp "PMSecAI Sync Secret (get from your admin): " SYNC_SECRET

# ── Create ~/.pmsecai directory ────────────────────────────────────────────────
mkdir -p "$HOME/.pmsecai"
echo "✓ Created ~/.pmsecai/"

# ── Write hook script ─────────────────────────────────────────────────────────
HOOK_SCRIPT="$HOME/.claude/pmsecai-hook.sh"
mkdir -p "$HOME/.claude"

cat > "$HOOK_SCRIPT" <<'HOOKEOF'
#!/usr/bin/env bash
# PMSecAI Stop Hook — captures Claude Code token usage and forwards to MCP server
PAYLOAD=$(cat)
INPUT=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('usage',{}).get('input_tokens',0))" 2>/dev/null || echo "0")
OUTPUT=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('usage',{}).get('output_tokens',0))" 2>/dev/null || echo "0")
MODEL=$(echo "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('model',''))" 2>/dev/null || echo "")
curl -s -X POST http://127.0.0.1:37849/hook/token-usage \
  -H "Content-Type: application/json" \
  -d "{\"input_tokens\":$INPUT,\"output_tokens\":$OUTPUT,\"model\":\"$MODEL\"}" >/dev/null 2>&1
echo "$PAYLOAD" >> "$HOME/.pmsecai/hook-debug.log"
HOOKEOF

chmod +x "$HOOK_SCRIPT"
echo "✓ Created ~/.claude/pmsecai-hook.sh"

# ── Patch ~/.claude/settings.json ─────────────────────────────────────────────
SETTINGS_FILE="$HOME/.claude/settings.json"

if [ ! -f "$SETTINGS_FILE" ]; then
  echo "{}" > "$SETTINGS_FILE"
fi

# We use node to safely merge settings
node - <<JSEOF
const fs = require('fs');
const path = require('path');
const file = path.join(process.env.HOME, '.claude', 'settings.json');
let settings = {};
try { settings = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}

settings.mcpServers = settings.mcpServers || {};
settings.mcpServers.pmsecai = {
  command: "node",
  args: ["$MCP_PATH"]
};

settings.hooks = settings.hooks || {};
settings.hooks.Stop = settings.hooks.Stop || [];
const hookCmd = "bash $HOME/.claude/pmsecai-hook.sh";
if (!settings.hooks.Stop.some(h => JSON.stringify(h).includes('pmsecai-hook'))) {
  settings.hooks.Stop.push({ matcher: "", hooks: [{ type: "command", command: hookCmd }] });
}

settings.env = settings.env || {};
Object.assign(settings.env, {
  PMSECAI_DEV_NAME: "$DEV_NAME",
  PMSECAI_DEV_EMAIL: "$DEV_EMAIL",
  ZOHO_CLIENT_ID: "$ZOHO_CLIENT_ID",
  ZOHO_CLIENT_SECRET: "$ZOHO_CLIENT_SECRET",
  PMSECAI_WEB_URL: "$WEB_URL",
  PMSECAI_SYNC_SECRET: "$SYNC_SECRET"
});

fs.writeFileSync(file, JSON.stringify(settings, null, 2));
console.log('✓ Patched ~/.claude/settings.json');
JSEOF

# ── Zoho OAuth ────────────────────────────────────────────────────────────────
echo ""
echo "Starting Zoho OAuth flow (a browser window will open)..."
ZOHO_CLIENT_ID="$ZOHO_CLIENT_ID" ZOHO_CLIENT_SECRET="$ZOHO_CLIENT_SECRET" \
  node "$MCP_PATH" --auth

echo ""
echo "═══════════════════════════════════════════"
echo "  ✓ Setup complete!"
echo ""
echo "  Restart VS Code / Claude Code to load the MCP server."
echo "  Then try: 'I'm working on [project name]' in Claude."
echo "═══════════════════════════════════════════"
echo ""
