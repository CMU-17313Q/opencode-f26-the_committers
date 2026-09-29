#!/usr/bin/env bash
# Usage: packages/opencode/script/mistakes-demo.sh empty|one-offs|recurring
# Seeds a throwaway DB the same way test/cli/mistakes.test.ts does, then runs `opencode mistakes`.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
WORK=$(mktemp -d)                 # not a git repo -> CLI resolves to the "global" project
export OPENCODE_DB="$WORK/mistakes.db"
oc() { (cd "$WORK" && bun --config="$REPO/packages/opencode/bunfig.toml" run --conditions=browser "$REPO/packages/opencode/src/index.ts" "$@"); }

seed() {
  oc db "insert or ignore into project (id, worktree, sandboxes, time_created, time_updated) values ('global', '/', '[]', 0, 0)" >/dev/null
  oc db "insert into session (id, project_id, slug, directory, title, version, time_created, time_updated) values ('ses_cli_mistakes', 'global', 'cli', '/', 'cli', 'test', 0, 0)" >/dev/null
  oc db "insert into student_error (session_id, category, code, message, source, time_created) values $1" >/dev/null
}

case "${1:-}" in
  empty) ;;
  one-offs) seed "('ses_cli_mistakes','syntax_error','TS1005','''; expected.','bash',0), ('ses_cli_mistakes','import_error','TS2307','Cannot find module ''./util''.','bash',0), ('ses_cli_mistakes','undefined_name','TS2304','Cannot find name ''coutn''.','bash',0)" ;;
  recurring) seed "('ses_cli_mistakes','undefined_name','TS2304','Cannot find name ''coutn''.','bash',0), ('ses_cli_mistakes','undefined_name','TS2304','Cannot find name ''widht''.','bash',0), ('ses_cli_mistakes','syntax_error','TS1005','''; expected.','bash',0)" ;;
  *) echo "usage: $0 empty|one-offs|recurring"; exit 1 ;;
esac

clear 2>/dev/null || true
echo "\$ opencode mistakes"; oc mistakes
if [ "$1" = recurring ]; then
  echo; echo "\$ opencode mistakes --session ses_cli_mistakes"; oc mistakes --session ses_cli_mistakes
fi
rm -rf "$WORK"
