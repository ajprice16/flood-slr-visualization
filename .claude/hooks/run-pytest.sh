#!/bin/bash
# PostToolUse hook: run pytest when a Backend Python source file is edited.
path=$(python3 -c "import json,os; d=json.loads(os.environ.get('CLAUDE_TOOL_INPUT','{}')); print(d.get('file_path',''))" 2>/dev/null)
[[ "$path" == *Backend/*.py ]] && [[ "$path" != *tests* ]] || exit 0
cd /home/exouser/Documents/ProjWeb/flood-slr-visualization
python -m pytest Backend/tests/ -q --tb=short 2>&1 | tail -30
exit "${PIPESTATUS[0]}"
