#!/bin/sh
# Turns the "AI link" light in Cyclic Labs green/red by writing app/local/llm_link.js.
#
#   sh tools/llm_link.sh on    [agent]   AI opened this folder        (green)
#   sh tools/llm_link.sh busy  [agent]   AI is working on a request   (green, pulsing)
#   sh tools/llm_link.sh edited [agent]  AI changed a file            (page offers "Reload")
#   sh tools/llm_link.sh idle  [agent]   AI finished, waiting for you (green)
#   sh tools/llm_link.sh off   [agent]   AI closed the folder         (red)
#   sh tools/llm_link.sh post  [agent]   Claude hook after each tool; reads the hook's JSON
#                                        on stdin to spot file edits
#
# Claude runs this by itself (see .claude/settings.json). Other assistants: see AGENTS.md.
# It never fails loudly: a broken status light must not get in the way of real work.

state=${1:-on}
agent=$(printf '%s' "${2:-Claude}" | tr -cd 'A-Za-z0-9 ._-' | cut -c1-30)
root=$(cd "$(dirname "$0")/.." 2>/dev/null && pwd) || exit 0
dir="$root/app/local"
f="$dir/llm_link.js"
mkdir -p "$dir" 2>/dev/null || exit 0

now="$(date +%s 2>/dev/null)000"
edited=$(sed -n 's/.*"edited":\([0-9]*\).*/\1/p' "$f" 2>/dev/null)
edited=${edited:-0}

case "$state" in
  post)
    in=$(cat 2>/dev/null)
    if printf '%s' "$in" | grep -Eq '"tool_name" *: *"(Edit|Write|MultiEdit|NotebookEdit)"'; then edited=$now; fi
    state=busy ;;
  edited) edited=$now; state=busy ;;
  on|busy|idle|off) ;;
  *) state=on ;;
esac

printf 'window.LLM_LINK={"agent":"%s","state":"%s","at":%s,"edited":%s};\n' \
  "$agent" "$state" "$now" "$edited" > "$f.tmp" 2>/dev/null && mv -f "$f.tmp" "$f" 2>/dev/null
exit 0
