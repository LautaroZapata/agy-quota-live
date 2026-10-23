#!/usr/bin/env sh
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
CLI_JS="$SCRIPT_DIR/../src/cli.js"

if command -v node >/dev/null 2>&1; then
  exec node "$CLI_JS" statusline "$@"
fi

for candidate in \
  "$HOME/.volta/bin/node" \
  "$HOME/.local/share/fnm/aliases/default/bin/node" \
  "$HOME/.nvm/current/bin/node" \
  "/opt/homebrew/bin/node" \
  "/usr/local/bin/node" \
  "/usr/bin/node"
do
  if [ -x "$candidate" ]; then
    exec "$candidate" "$CLI_JS" statusline "$@"
  fi
done

exit 0
