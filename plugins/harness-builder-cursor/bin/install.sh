#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:?Usage: install.sh <target-project-dir>}"
if [[ ! -d "${TARGET}" ]]; then
  echo "Error: target directory does not exist: ${TARGET}" >&2
  exit 1
fi
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${HERE}/skills/cursor-init/templates"
mkdir -p "${TARGET}/.cursor/rules" "${TARGET}/.cursor/agents"
cp "${SRC}/rules/agent-init.mdc.hbs"     "${TARGET}/.cursor/rules/agent-init.mdc.hbs"
cp "${SRC}/agents/planner.md.hbs"        "${TARGET}/.cursor/agents/planner.md.hbs"
cp "${SRC}/agents/dev.md.hbs"            "${TARGET}/.cursor/agents/dev.md.hbs"
cp "${SRC}/agents/reviewer.md.hbs"       "${TARGET}/.cursor/agents/reviewer.md.hbs"
cat <<MSG
Copied 4 template files (still .hbs — render manually) to:
  ${TARGET}/.cursor/rules/
  ${TARGET}/.cursor/agents/

Substitute {{stack}}, {{purpose}}, {{deploy_targets}}, etc. then rename
the files by dropping the .hbs suffix.

See follow-up tracker for the automated renderer.
MSG
