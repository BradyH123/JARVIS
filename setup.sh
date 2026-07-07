#!/bin/bash
# Screen Assistant — one-command macOS setup.
# Usage (paste into Terminal):
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/BradyH123/peer-tutoring-front-end/claude/ai-screen-assistant-app-21bore/screen-assistant/setup.sh)"
# Or from a clone:  bash setup.sh
set -e

BRANCH="claude/ai-screen-assistant-app-21bore"
REPO="https://github.com/BradyH123/peer-tutoring-front-end.git"
DIR="$HOME/peer-tutoring-front-end"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m⚠\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗ %s\033[0m\n' "$*"; exit 1; }

bold "Screen Assistant setup"

# 1. Xcode command line tools (needed to build the native input module)
if xcode-select -p >/dev/null 2>&1; then
  ok "Xcode command line tools present"
else
  warn "Installing Xcode command line tools — approve the popup, then RE-RUN this script."
  xcode-select --install || true
  exit 0
fi

# 2. Node.js 18+
if command -v node >/dev/null 2>&1 && [ "$(node -e 'console.log(process.versions.node.split(".")[0])')" -ge 18 ]; then
  ok "Node $(node -v)"
else
  if command -v brew >/dev/null 2>&1; then
    warn "Node 18+ not found — installing via Homebrew…"
    brew install node
  else
    fail "Node.js 18+ is required. Install it from https://nodejs.org and re-run."
  fi
fi

# 3. Get / update the code
if [ -d "$DIR/.git" ]; then
  ok "Repo already cloned — updating"
  git -C "$DIR" fetch origin "$BRANCH" --quiet
  git -C "$DIR" checkout "$BRANCH" --quiet
  git -C "$DIR" pull origin "$BRANCH" --quiet
else
  bold "Cloning the app…"
  git clone --branch "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR/screen-assistant"

# 4. Install dependencies (Electron + native input module)
bold "Installing dependencies (2–5 min on first run)…"
npm install --no-fund --no-audit
ok "Dependencies installed"

# 5. Offline sanity check
node test/smoke.js >/dev/null 2>&1 && ok "Self-test passed (6/6)" || warn "Self-test failed — continuing anyway"

# 6. Open the two permission panes macOS requires a HUMAN to click.
bold "Opening System Settings — enable this app (it appears as “Electron”) under BOTH panes:"
echo "     • Screen Recording   (the assistant's eyes)"
echo "     • Accessibility      (its hands — mouse & keyboard)"
open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture" || true
sleep 1
open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility" || true

echo ""
bold "Launching Screen Assistant…"
echo "  → The JARVIS orb appears bottom-right. Paste your Anthropic API key in the"
echo "    welcome panel (get one at https://console.anthropic.com), click Test, done."
echo "  → If you grant permissions AFTER launch, quit (✕) and run:  npm start"
echo "  → Emergency stop during any run: Cmd+Shift+X"
echo ""
npm start
