#!/bin/sh
# Fake Claude Code CLI: replays `/clear` as the real CLI reports it. The reset
# names the old session; the result after it carries the new session id.
[ "$1" = "--version" ] && { echo "2.1.305 (Claude Code)"; exit 0; }

while IFS= read -r line; do
    case "$line" in
        *'"subtype":"initialize"'*)
            id=$(printf '%s' "$line" | sed -n 's/.*"request_id":"\([^"]*\)".*/\1/p')
            printf '{"type":"control_response","response":{"subtype":"success","request_id":"%s","response":{}}}\n' "$id"
            ;;
        *'"type":"user"'*)
            printf '{"type":"conversation_reset","new_conversation_id":"c1","uuid":"c1","session_id":"old"}\n'
            printf '{"type":"result","subtype":"success","duration_ms":0,"duration_api_ms":0,"is_error":false,"num_turns":0,"session_id":"new"}\n'
            ;;
    esac
done
