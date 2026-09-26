#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null 2>&1; then
  runtime="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"
  if [ ! -x "$runtime/node/bin/node" ]; then
    echo 'Install Node 22.12+ and pnpm 11.19.0, then rerun this command.' >&2
    exit 1
  fi
  PATH="$runtime/node/bin:$runtime/bin/fallback:$PATH"
  export PATH
fi
exec pnpm "${@:-dev}"
