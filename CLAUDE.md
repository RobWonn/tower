# Agent Tower

AI Agent 任务管理看板应用，支持多种 AI Agent（Claude Code、Gemini CLI、Cursor Agent）的任务编排、终端管理和实时协作。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + Vite 7 + TypeScript 5 |
| 样式 | TailwindCSS v4 + shadcn/ui (Radix UI) |
| 状态管理 | TanStack Query v5 (服务端状态) + Zustand v5 (客户端状态) |
| 路由 | react-router-dom v7 (lazy loading) |
| 终端 | xterm.js + Monaco Editor |
| 后端 | Fastify 4 + Socket.IO 4 |
| 数据库 | Prisma 5 + SQLite |
| 进程管理 | node-pty |
| 包管理 | pnpm monorepo |

## 项目结构

```
packages/
├── shared/          # 共享类型包 (@agent-tower/shared)
├── server/          # 后端服务 (@agent-tower/server)
└── web/             # 前端应用
docs/                # 项目文档 (ARCHITECTURE.md, PROJECT_SPEC.md, MCP.md)
scripts/             # 构建发布脚本
```

## CLI 入口

- `agent-tower` — 主服务 (默认端口 12580)
- `agent-tower-mcp` — MCP 服务器 (stdio 模式，暴露 projects/tasks/workspaces/sessions tools)

## 架构设计

### Socket.IO

单一命名空间 `/events`，通过 room-based 订阅区分 topic：

| Room 模式 | 用途 |
|-----------|------|
| `session:{id}` | Agent 会话 PTY 流 |
| `terminal:{id}` | 独立终端 PTY 流 |
| `task:{id}` | 任务状态变更 |
| `project:{id}` | 项目级任务更新广播 |
| `agent:{id}` / `agent:all` | Agent 状态通知 |

### 核心机制

- **AgentPipeline**: PTY + Parser + MsgStore 生命周期管理
- **EventBus**: 类型安全的进程内事件总线
- **服务容器**: 单例管理 (SessionManager, TerminalManager, CommitMessageService, NotificationService)
- **输出解析**: Claude Code / Cursor Agent 输出解析器，JSON Patch 驱动的 MsgStore
- **Git Worktree**: 创建/删除/合并/rebase/冲突检测
- **任务状态自动推进**: Session 全部完成 → Task 进入 IN_REVIEW；Session 重启 → 回退 IN_PROGRESS

### 前端状态管理

- **TanStack Query**: 服务端数据缓存、请求去重、后台刷新
- **Zustand**: 客户端 UI 状态、Agent 状态

### 关键目录

```
packages/server/src/
├── core/             # 服务容器 (DI) + EventBus
├── pipeline/         # AgentPipeline (PTY + Parser + MsgStore)
├── output/           # 输出解析 (claude-code-parser, cursor-agent-parser, msg-store)
├── executors/        # Agent 执行器 (Claude Code, Gemini CLI, Cursor Agent)
├── mcp/              # MCP 服务器 (tools: projects, tasks, workspaces, sessions)
├── git/              # Git CLI 封装 + WorktreeManager
├── services/         # 业务服务 (session, workspace, project, task, terminal, tunnel, notifications)
├── routes/           # REST API (14 个模块)
├── socket/           # Socket.IO 网关 (/events 命名空间, room 订阅)
│   └── middleware/   # 认证、错误处理
└── middleware/        # HTTP 中间件 (隧道认证)

packages/web/src/
├── layouts/          # RootLayout, SettingsLayout
├── pages/            # HomePage, ProjectKanbanPage, 设置页等
├── components/
│   ├── ui/           # shadcn/ui 组件
│   ├── task/         # 任务看板组件
│   ├── workspace/    # 终端、编辑器、文件树、Git 变更视图
│   ├── agent/        # 日志流、Todo 面板、Token 用量
│   └── mobile/       # 移动端适配组件
├── hooks/            # TanStack Query hooks (tasks, sessions, workspaces, git, attachments, notifications, tunnel 等)
├── stores/           # Zustand stores (agent-store, ui-store)
├── lib/
│   ├── api-client.ts # HTTP API 客户端
│   └── socket/       # Socket.IO 客户端 + hooks (useTerminal, useNormalizedLogs, useTaskRealtimeSync)
└── routes/           # react-router-dom 路由配置

packages/shared/src/
├── types.ts          # 核心业务类型 (Project, Task, Workspace, Session, TodoItem 等)
├── socket/events.ts  # Socket.IO 事件常量与 payload 类型
├── log-adapter.ts    # NormalizedEntry → LogEntry 前端适配
└── dev-port.ts       # 确定性端口计算
```

### 功能模块

- **Cloudflare 隧道**: 远程访问，带 token 认证
- **通知系统**: OS 系统通知 + 飞书 webhook
- **附件系统**: 文件上传 (50MB 限制)，支持传给 Agent
- **Commit Message 自动生成**: Session 完成后 AI 生成 commit message
- **项目配置**: auto-copy files、quick commands

## 开发命令

```bash
pnpm install                                    # 安装依赖
pnpm --filter web dev                           # 前端开发
pnpm --filter @agent-tower/server dev           # 后端开发
pnpm --filter web build                         # 前端构建
pnpm --filter @agent-tower/server build         # 后端构建
pnpm --filter @agent-tower/shared build         # 共享包构建
```

## 代码规范

- 使用 TypeScript 严格模式
- 前后端共享类型定义放在 `@agent-tower/shared`
- Socket 事件使用常量定义，避免魔法字符串
- React 组件使用函数式组件 + Hooks
- 导出路径: `@agent-tower/shared`, `@agent-tower/shared/socket`, `@agent-tower/shared/types`, `@agent-tower/shared/log-adapter`
