#!/bin/sh
# Fake Claude Code CLI: answers initialize, then exits partway through the first
# turn without a result.
[ "$1" = "--version" ] && { echo "2.1.305 (Claude Code)"; exit 0; }

while IFS= read -r line; do
    case "$line" in
        *'"subtype":"initialize"'*)
            id=$(printf '%s' "$line" | sed -n 's/.*"request_id":"\([^"]*\)".*/\1/p')
            printf '{"type":"control_response","response":{"subtype":"success","request_id":"%s","response":{}}}\n' "$id"
            ;;
        *'"type":"user"'*)
            printf '{"type":"assistant","message":{"model":"fake","content":[{"type":"text","text":"working"}]},"parent_tool_use_id":null,"session_id":"s1"}\n'
            exit 1
            ;;
    esac
done
