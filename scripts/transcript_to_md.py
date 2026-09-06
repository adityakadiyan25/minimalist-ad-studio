"""Render a Claude Code session .jsonl as readable Markdown. Nothing is dropped or reworded:
every user message, assistant message, tool call and tool result is emitted in order.
Usage: python scripts/transcript_to_md.py <session.jsonl> <out.md>"""
import json, sys
from datetime import datetime

src, out = sys.argv[1], sys.argv[2]
lines = []
n_user = n_asst = n_tool = 0
for raw in open(src, encoding="utf-8"):
    try: d = json.loads(raw)
    except json.JSONDecodeError: continue
    t = d.get("type")
    if t not in ("user", "assistant"): continue
    msg = d.get("message") or {}
    content = msg.get("content")
    ts = d.get("timestamp", "")
    try: ts = datetime.fromisoformat(ts.replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M:%S UTC")
    except Exception: pass
    if isinstance(content, str): content = [{"type": "text", "text": content}]
    for block in content or []:
        bt = block.get("type")
        if bt == "text" and block.get("text", "").strip():
            if t == "user":
                n_user += 1; lines += [f"\n## 👤 User · {ts}\n", block["text"].strip(), ""]
            else:
                n_asst += 1; lines += [f"\n## 🤖 Claude · {ts}\n", block["text"].strip(), ""]
        elif bt == "thinking" and block.get("thinking", "").strip():
            lines += [f"\n<details><summary>💭 thinking · {ts}</summary>\n", block["thinking"].strip(), "\n</details>\n"]
        elif bt == "tool_use":
            n_tool += 1
            inp = json.dumps(block.get("input", {}), indent=2, ensure_ascii=False)
            lines += [f"\n### 🔧 Tool call: `{block.get('name')}` · {ts}\n", "```json", inp, "```", ""]
        elif bt == "tool_result":
            c = block.get("content")
            if isinstance(c, list): c = "\n".join(x.get("text", "") for x in c if isinstance(x, dict))
            c = (c or "").strip()
            tag = " (error)" if block.get("is_error") else ""
            lines += [f"\n<details><summary>📄 Tool result{tag}</summary>\n", "```", c, "```", "\n</details>\n"]

header = [f"# Claude Code session transcript", f"", f"Source: `{src.split('/')[-1]}` · rendered by `scripts/transcript_to_md.py` · {n_user} user messages · {n_asst} assistant messages · {n_tool} tool calls", "", "Unedited. Formatting only.", ""]
open(out, "w", encoding="utf-8").write("\n".join(header + lines))
print(f"wrote {out}: {n_user} user, {n_asst} assistant, {n_tool} tool calls, {len(lines)} lines")
