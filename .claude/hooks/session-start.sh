#!/usr/bin/env bash
# Provisions a Claude Code on the web container so it matches CI: Node from .nvmrc,
# the npm dependencies, and the Python toolchain the Pets/Rbow compiler needs.
#
# Local checkouts are left alone: set up those by hand, as README.md describes.
# Every step is idempotent, so re-running on resume, clear or compact is cheap.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

repo="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$repo"

log() { printf '[session-start] %s\n' "$*"; }
persist() { [ -n "${CLAUDE_ENV_FILE:-}" ] && printf '%s\n' "$1" >>"$CLAUDE_ENV_FILE"; }

# --- Node -------------------------------------------------------------------
# The container images ship Node 20/21/22; package.json wants >=24, so install
# the .nvmrc version with nvm and put it in front of the preinstalled one.
node_want="$(tr -d '[:space:]' <.nvmrc)"
export NVM_DIR="${NVM_DIR:-/opt/nvm}"

if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install "$node_want" >/dev/null 2>&1 || nvm install "$node_want"
  node_bin="$(dirname "$(nvm which "$node_want")")"
  export PATH="$node_bin:$PATH"
  persist "export NVM_DIR=\"$NVM_DIR\""
  persist "export PATH=\"$node_bin:\$PATH\""
else
  log "warning: nvm not found at $NVM_DIR; staying on $(node --version 2>/dev/null || echo 'no node')"
fi

node_have="$(node --version | sed 's/^v\([0-9]*\).*/\1/')"
if [ "$node_have" -lt "$node_want" ]; then
  log "warning: Node $node_have is older than the required $node_want; builds and tests may fail"
fi
log "node $(node --version), npm $(npm --version)"

# --- npm dependencies -------------------------------------------------------
# install, not ci: it reuses the cached node_modules the container snapshots.
log "installing npm dependencies"
npm install --no-audit --no-fund --loglevel=error

# --- Python toolchain for codegen -------------------------------------------
# `npm run codegen` and tools/art/*.py run through uv against
# tools/codegen/pets, which pins Python 3.12 and hash-sensitive Pillow/numpy.
if command -v uv >/dev/null 2>&1; then
  py_want="$(tr -d '[:space:]' <.python-version)"
  log "installing python $py_want and the codegen dependencies"
  uv python install "$py_want" >/dev/null
  uv sync --frozen --project tools/codegen/pets >/dev/null
  log "uv $(uv --version | awk '{print $2}'), python $(uv run --frozen --project tools/codegen/pets python --version | awk '{print $2}')"
else
  log "warning: uv not found; 'npm run codegen' will not run in this session"
fi

log "ready: npm run check | npm test | npm run build | npm run package | npm run codegen"
