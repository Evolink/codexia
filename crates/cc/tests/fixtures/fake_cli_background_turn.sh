#!/bin/sh
# Fake Claude Code CLI: the first prompt launches a background agent. Its turn
# ends with a result, then the session starts a turn of its own when the agent
# finishes. Later prompts are answered normally.
[ "$1" = "--version" ] && { echo "2.1.305 (Claude Code)"; exit 0; }

assistant() {
    printf '{"type":"assistant","message":{"model":"fake","content":[{"type":"text","text":"%s"}]},"parent_tool_use_id":null,"session_id":"s1"}\n' "$1"
}

tasks() {
    printf '{"type":"system","subtype":"background_tasks_changed","tasks":[%s],"uuid":"u","session_id":"s1"}\n' "$1"
}

result() {
    printf '{"type":"result","subtype":"success","duration_ms":1,"duration_api_ms":1,"is_error":false,"num_turns":1,"session_id":"s1","result":"%s"}\n' "$1"
}

prompts=0
while IFS= read -r line; do
    case "$line" in
        *'"subtype":"initialize"'*)
            id=$(printf '%s' "$line" | sed -n 's/.*"request_id":"\([^"]*\)".*/\1/p')
            printf '{"type":"control_response","response":{"subtype":"success","request_id":"%s","response":{}}}\n' "$id"
            ;;
        *'"type":"user"'*)
            prompts=$((prompts + 1))
            if [ "$prompts" = 1 ]; then
                tasks '{"task_id":"t1","task_type":"local_agent"}'
                assistant "launched"
                result "first"
                sleep 0.2
                tasks ''
                assistant "agent finished"
                result "second"
            else
                assistant "next"
                result "third"
            fi
            ;;
    esac
done
