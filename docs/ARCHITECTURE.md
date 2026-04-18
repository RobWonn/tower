# Agent Tower - 架构设计文档

本文档描述当前代码库的真实架构，而不是早期规划稿。项目目前已经演进为一个本地优先、单用户的 AI Agent 调度平台，核心能力包括任务看板、Git worktree 隔离、实时终端/日志、Provider 管理、MCP 集成、附件、通知和移动端访问。

## 1. 架构总览

### 1.1 系统图

```text
┌─────────────────────────────────────────────────────────────────────┐
│                           Browser / Mobile                         │
│  React Router ─ TanStack Query ─ Zustand ─ Socket.IO Client        │
│  Task Kanban ─ Task Detail ─ Log Stream ─ Workspace Panel          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                    HTTP REST + Socket.IO (/events)
                               │
┌──────────────────────────────┴──────────────────────────────────────┐
│                         Fastify Application                         │
│  Routes ─ Services ─ EventBus ─ SocketGateway ─ MCP HTTP Client    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ SessionManager + AgentPipeline                              │   │
│  │ PTY stdout/stderr -> Parser -> MsgStore -> JSON Patch -> UI │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  Executors: Claude Code / Gemini CLI / Cursor Agent / Codex        │
│  Git: WorktreeManager / git-cli / merge / rebase / conflict check  │
│  Extras: Tunnel / Notifications / Attachments / Commit messages    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                     Prisma ORM + SQLite Database
```

### 1.2 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React 19 + Vite 7 + TypeScript 5 | 单页应用，按路由懒加载 |
| 样式 | TailwindCSS v4 + shadcn/ui | UI 基础组件与样式系统 |
| 状态管理 | TanStack Query v5 + Zustand v5 | 服务端状态缓存 + 客户端 UI 状态 |
| 实时通信 | Socket.IO 4 | 基于 room 的实时订阅 |
| 后端 | Fastify 4 | REST API、静态托管、生命周期钩子 |
| 数据库 | Prisma 5 + SQLite | 本地优先，结构简单 |
| 进程管理 | node-pty | 托管 AI CLI 和独立终端 |
| Git | 原生 git CLI 封装 | worktree、rebase、merge、conflict 检测 |
| 协议扩展 | MCP SDK | 暴露任务/会话/工作区工具给外部 agent |
| 包管理 | pnpm monorepo | `shared/server/web` 三包结构 |

## 2. Monorepo 结构

### 2.1 顶层结构

```text
agent-tower/
├── packages/
│   ├── shared/   # 前后端共享类型、Socket 事件、日志适配、端口工具
│   ├── server/   # Fastify + Prisma + Socket.IO + MCP
│   └── web/      # React 前端
├── docs/         # 项目文档
├── design/       # 设计稿与实验性资料
├── scripts/      # 构建/发布脚本
├── package.json
└── pnpm-workspace.yaml
```

### 2.2 `packages/shared`

`shared` 负责跨端约定，避免前后端复制类型或事件定义。

- `src/types.ts`: `Project`、`Task`、`Workspace`、`Session`、`Provider` 等核心类型
- `src/socket/events.ts`: Socket.IO 事件名与 payload 类型
- `src/log-adapter.ts`: 规范化日志到前端展示数据的转换
- `src/dev-port.ts`: 基于目录路径 hash 的开发端口计算

### 2.3 `packages/server`

后端按职责分层，但已经比传统的 `routes/services` 更丰富：

- `src/routes/`: REST API 路由注册与参数校验
- `src/services/`: 项目、任务、工作区、会话、终端、通知、隧道等业务逻辑
- `src/core/`: 轻量容器与进程内 `EventBus`
- `src/pipeline/`: `AgentPipeline`，负责单个 session 的 PTY 生命周期
- `src/output/`: agent 输出解析、`MsgStore`、JSON Patch、Todo/Token 提取
- `src/executors/`: Claude Code、Gemini CLI、Cursor Agent、Codex 执行器，以及 provider/profile 管理
- `src/socket/`: Socket.IO namespace、room 转发、订阅协议
- `src/git/`: worktree、merge、rebase、冲突状态和 git 错误封装
- `src/mcp/`: MCP server 与 tool 注册

### 2.4 `packages/web`

前端围绕“看板 + 任务详情 + 工作区”组织：

- `src/routes/`: 路由定义，按页面懒加载
- `src/layouts/`: 根布局、设置页布局
- `src/pages/`: 首页看板、设置页、demo 页
- `src/components/task/`: 任务列表、任务详情、启动 agent 对话框
- `src/components/workspace/`: 编辑器、变更视图、终端、Git 操作、历史视图
- `src/components/agent/`: 日志流、Todo 面板、Token 用量
- `src/hooks/`: TanStack Query hooks
- `src/lib/socket/`: Socket 连接管理与订阅 hooks
- `src/stores/`: UI 状态与 agent 状态

## 3. 核心业务模型

### 3.1 实体关系

当前核心模型为：

```text
Project
  └── Task
        └── Workspace (git worktree)
              └── Session
                    └── ExecutionProcess
```

补充模型：

- `Provider`: 配置不同 agent CLI 的环境变量、设置和默认项
- `Attachment`: 上传文件，既能在前端预览，也能拼接进 prompt
- `NotificationSettings`: OS 通知与飞书 webhook 配置

### 3.2 状态流转

- `Task`: `TODO -> IN_PROGRESS -> IN_REVIEW -> DONE/CANCELLED`
- `Workspace`: `ACTIVE -> MERGED/ABANDONED`
- `Session`: `PENDING -> RUNNING -> COMPLETED/FAILED/CANCELLED`

后端会自动处理一部分状态：

- Session 启动时，任务自动回到 `IN_PROGRESS`
- 一个任务下所有聊天 session 结束后，任务自动推进到 `IN_REVIEW`
- Workspace 成功 squash merge 后，任务推进到 `DONE`

## 4. 运行时执行链路

### 4.1 创建并启动任务

典型流程如下：

1. 前端创建 `Task`
2. 后端创建 `Workspace`，生成或复用 git worktree
3. 根据项目配置复制文件、异步执行 setup script
4. 前端创建 `Session`
5. `SessionManager` 根据 `providerId` 或 `agentType` 选择 executor
6. executor 在 worktree 目录中启动对应 AI CLI
7. `AgentPipeline` 接管 PTY、parser 和消息同步

### 4.2 Session Pipeline

每个 session 都由一个 `AgentPipeline` 管理：

```text
PTY.onData
  -> MsgStore.pushStdout()
  -> Parser.processData()
  -> MsgStore.pushPatch()
  -> EventBus.emit('session:patch')
  -> SocketGateway 转发到 session room
  -> 前端增量更新日志 / Todo / token usage
```

关键点：

- `MsgStore` 保存 stdout、patch、sessionId 等消息，并能重建快照
- 快照会被 debounce 持久化到数据库的 `logSnapshot`
- parser 会尽量把原始终端输出结构化为标准化消息
- 当前主要对 Claude Code、Cursor Agent、Codex 做了结构化解析；Gemini 主要按原始输出处理

### 4.3 Session 结束后的后处理

普通聊天 session 结束后，后端会自动执行：

1. 尝试对 worktree 中未提交变更做兜底 auto-commit
2. 持久化日志快照和 token usage
3. 广播 `session:completed`
4. 检查任务是否应进入 `IN_REVIEW`
5. 触发 commit message 的后台生成

## 5. Git 与工作区设计

### 5.1 Worktree 隔离

每个任务默认使用独立分支和独立目录，例如：

- 分支名：`at/<workspace-short-id>`
- 工作目录：仓库旁边的 `.worktrees/<branch>`

这样多个 agent 可以同时修改同一个项目，而不直接污染主工作区。

### 5.2 当前 Git 能力

`WorktreeManager` 当前负责：

- 创建和删除 worktree
- 获取分支领先/落后状态
- 获取 diff 和 diff stat
- squash merge 到目标分支
- rebase 到最新 base branch
- 检测 merge/rebase 冲突
- 中止进行中的 git 操作
- 启动时 prune 过期 worktree 引用

### 5.3 合并策略

当前 merge 不是直接把 task branch 合并回主分支，而是：

1. 检查 worktree 是否干净
2. 检查 task branch 是否落后 base branch
3. 在主仓库执行 `git merge --squash --no-commit`
4. 用用户输入或 AI 生成的 commit message 提交
5. 更新 task branch ref 到新的 squash commit
6. 删除 worktree 目录，但保留 branch 以便未来继续工作

这使“已合并任务继续迭代”成为可能。

## 6. 通信机制

### 6.1 REST API

REST API 负责 CRUD、文件访问和控制型操作，当前主要分组包括：

- `projects`
- `tasks`
- `workspaces`
- `sessions`
- `git`
- `files` / `filesystem`
- `providers` / `profiles`
- `terminals`
- `attachments`
- `notifications`
- `tunnel`
- `system`

### 6.2 Socket.IO

实时层统一使用 `/events` namespace，而不是独立的 WS/SSE 通道。订阅以 room 为单位：

- `session:{id}` / `session:all`
- `task:{id}` / `task:all`
- `project:{id}` / `project:all`
- `terminal:{id}` / `terminal:all`
- `agent:{id}` / `agent:all`

主要事件：

- `session:stdout`
- `session:patch`
- `session:exit`
- `session:completed`
- `task:updated`
- `task:deleted`
- `terminal:stdout`
- `workspace:setup_progress`
- `workspace:commit_message_updated`

### 6.3 MCP

MCP server 是独立的 stdio 进程，通过 HTTP 调用 Agent Tower 后端。它不直接访问数据库，而是复用现有 REST API 和业务规则。

当前已暴露项目、任务、provider、workspace、session 相关 tools，并支持在 worktree 目录下提供 `get_context`。

## 7. 关键设计决策

### 7.1 使用 `packages/shared` 统一约定

项目已采用共享包维护：

- 领域类型
- Socket 事件定义
- 日志适配逻辑
- 开发端口计算逻辑

这样前后端可以共享一套契约，减少手写同步成本。

### 7.2 Prisma 使用字符串字段承载状态枚举

数据库中的 `status`、`agentType`、`purpose` 等字段多数为 `String`，而不是 Prisma enum。枚举约束主要放在 TypeScript 层。

优点：

- 迁移成本更低
- 与历史数据兼容更容易
- 更方便新增 agent 类型或状态

### 7.3 Room-based Socket 架构

前端应用启动时只建立一个 socket 连接，各页面和 hook 再按需订阅 room。这样可以避免为每个 session/terminal 建立独立连接，也更适合同时观察多个任务。

### 7.4 本地优先 + 隧道远程访问

项目默认是单用户、本地运行：

- 数据库存放在本机
- Git 操作直接作用于本地仓库
- agent CLI 直接在本机执行

远程访问通过 Cloudflare tunnel 暴露，并配套 token 认证，而不是完整的多用户鉴权系统。

## 8. 代理与 TUN 透明代理

Agent Tower 通过 mihomo (Clash Meta) + TUN 模式为本地和远程服务器提供透明代理，使 AI Agent 可以访问区域限制模型（如 Opus 4.6）。

核心组件：

- `ClashService`: 管理本地 mihomo（状态、启停、订阅、LAN 规则注入）
- `RemoteClashService`: 通过 SSH 管理远程 mihomo（SFTP 安装、配置、重启）
- Web UI: 代理设置页 + 远程服务器卡片中的 TUN 代理面板

关键设计决策：

- **三层 SSH 保护**: `route-exclude-address`（TUN 层）+ `IP-CIDR DIRECT`（规则层）+ `strict-route: false`（故障恢复）
- **订阅更新自动保护**: `ensureLanRules()` 在每次 merge 后验证并注入 LAN 直连规则
- **远程安装无需 GitHub**: 通过 SFTP 从本地上传二进制 + 配置
- **安全重启**: 远程使用 nohup 后台脚本避免 SSH 断连

详细文档见 [proxy-tun-architecture.md](./proxy-tun-architecture.md)。

## 9. 仍然存在的边界

以下能力当前仍非完整产品目标，文档中不应误写为已实现：

- 多用户协作与权限系统
- 云端托管的任务执行
- PR 工作流和 GitHub 审核集成
- 通用预览面板（`Preview` 仍是占位）
- 完整的领域模块化拆分

## 更新记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-03-30 | v0.2 | 基于当前代码实现重写，补齐 shared、Socket.IO、provider、pipeline、MCP、附件、通知与 Git 工作流 |
