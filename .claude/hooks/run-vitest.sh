#!/bin/bash
# PostToolUse hook: run vitest when a Frontend source file is edited.
path=$(python3 -c "import json,os; d=json.loads(os.environ.get('CLAUDE_TOOL_INPUT','{}')); print(d.get('file_path',''))" 2>/dev/null)
[[ "$path" == *Frontend/src/*.js* ]] && [[ "$path" != *__tests__* ]] || exit 0
cd /home/exouser/Documents/ProjWeb/flood-slr-visualization/Frontend
npm test -- --reporter=verbose 2>&1 | tail -40
exit "${PIPESTATUS[0]}"
