# Codex CLI Features

> 来源: https://developers.openai.com/codex/cli/features

## `codex exec` — 非交互式执行

`codex exec` 是非交互式运行子命令，用于自动化工作流或将 Codex 集成到现有脚本中。

```bash
codex exec "fix the CI failure"
codex exec --json "fix the CI failure"   # JSON 输出模式
```

## `codex exec resume` — 恢复会话

```bash
codex exec resume --last "Fix the race conditions you found"
codex exec resume <SESSION_ID> "Implement the plan"
```

- `--last`：跳过选择器，直接恢复当前工作目录下最近的会话
- 可以指定具体的 `SESSION_ID` 来恢复特定运行
- **恢复时可以附带新的提示文本作为后续指令**（作为位置参数）

## 会话恢复（Resume Conversations）

Codex 将对话记录存储在本地 `~/.codex/sessions/` 目录下。

| 命令 | 说明 |
|---|---|
| `codex resume` | 启动最近交互会话的选择器 |
| `codex resume --all` | 显示所有本地会话（不限当前工作目录） |
| `codex resume --last` | 直接跳到当前工作目录下最近一次会话 |
| `codex resume <SESSION_ID>` | 指定具体会话 ID 恢复 |

恢复的会话保留 "the original transcript, plan history, and approvals"。

## 交互模式中的后续消息

- **Press Enter** while Codex is running → 向当前轮次注入新指令
- **Tab** → 为下一轮排队一条后续提示
- **Esc × 2**（composer 为空时）→ 编辑之前的用户消息，从该点 fork

## 关键 CLI 参数

- `--json`: JSON 输出模式（JSONL 事件流）
- `--ephemeral`: 不保存会话记录到本地
- `--skip-git-repo-check`: 跳过 git 仓库检查
- `--full-auto`: 全自动模式（auto-approve + workspace-write）
- `--model <model>`: 模型选择（默认 gpt-5.4）
- `--sandbox <mode>`: 沙箱模式（read-only, workspace-write, danger-full-access）
- `--ask-for-approval <policy>`: 审批策略（untrusted, on-request, never, reject）
- `--search live`: 启用实时网络搜索
- `-i / --image`: 图片输入

## Session/Thread 管理

- 会话存储路径: `~/.codex/sessions/`
- `/status`: 查看当前会话信息（含 session ID）
- `/clear`: 清除终端并开始全新对话
- Session ID 来源: 选择器、`/status` 命令、`~/.codex/sessions/` 目录

## MCP 支持

支持 STDIO 或 streaming HTTP 的 MCP 服务器配置，Codex 也可以自身作为 MCP server 运行。
配置路径: `~/.codex/config.toml`
