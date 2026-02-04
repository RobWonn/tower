# Agent Tower - 项目规格文档

## 1. 项目概述

### 1.1 项目目标

构建一个类似看板的 Web 应用，用于管理本地 AI Agent（如 Claude Code、Gemini CLI）执行的开发任务。通过可视化界面统一管理多个 AI 代理的任务分配、执行状态和代码产出。

### 1.2 核心需求

| 需求项 | 说明 |
|--------|------|
| AI Agent 支持 | 首期支持 Claude Code 和 Gemini CLI |
| 任务管理模式 | 看板视图（TODO → IN_PROGRESS → IN_REVIEW → DONE） |
| Git 集成 | Worktree 隔离，每个任务独立分支 |
| 部署方式 | Web 服务 |
| 用户模式 | 单用户（暂不实现多用户协作） |

### 1.3 参考项目

参考 `vibe-kanban` 项目的设计理念和功能实现，但使用 Node.js 技术栈重新构建。

---

## 2. 参考项目分析 (vibe-kanban)

### 2.1 vibe-kanban 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Rust + Axum |
| 数据库 | SQLite + SQLx |
| 前端 | React + Vite + TailwindCSS |
| 状态管理 | Zustand + React Query + TanStack React DB |
| 实时通信 | WebSocket + SSE |

### 2.2 vibe-kanban 核心架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           vibe-kanban 架构                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Frontend (React)                                                       │
│  ├── Pages (看板、工作空间、设置)                                         │
│  ├── Components (UI 组件)                                               │
│  ├── Hooks (80+ 自定义 hooks)                                           │
│  └── State (Zustand + React Query)                                      │
│                              │                                          │
│                    REST / WebSocket / SSE                               │
│                              │                                          │
│  Backend (Rust + Axum)                                                  │
│  ├── Routes (API 路由层)                                                │
│  ├── Services (业务逻辑层)                                              │
│  ├── Executors (AI 代理执行器 - 9种)                                    │
│  ├── Git (worktree 管理)                                                │
│  └── MCP Server (Model Context Protocol)                                │
│                              │                                          │
│  Database (SQLite)                                                      │
│  └── Models: Project, Task, Workspace, Session, ExecutionProcess        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 vibe-kanban 数据模型关系

```
Project (项目)
    │
    └── 1:n ── Task (任务)
                  │
                  ├── n:n ── Tag (标签)
                  ├── 1:n ── Image (图片附件)
                  │
                  └── 1:n ── Workspace (工作空间/git worktree)
                                │
                                └── 1:n ── Session (会话)
                                              │
                                              └── 1:n ── ExecutionProcess (执行进程)
                                                            │
                                                            └── 1:n ── CodingAgentTurn (对话轮次)
```

### 2.4 vibe-kanban 任务执行流程

```
1. 创建任务 (Task)
       │
       ▼
2. 创建工作空间 (Workspace)
   - 创建 Git worktree
   - 创建独立分支
   - 运行 setup script
       │
       ▼
3. 启动会话 (Session)
   - 选择 AI 代理 (Claude Code, Cursor, Gemini 等)
   - 配置 MCP 服务器
       │
       ▼
4. 执行进程 (Execution Process)
   - 启动 AI 代理进程
   - 捕获 stdout/stderr
   - 实时日志流推送
       │
       ▼
5. 代码审查 & 合并
   - 查看 diff
   - 创建 PR 或直接合并
   - 清理 worktree
```

### 2.5 vibe-kanban 支持的 AI 代理

| 代理 | 说明 |
|------|------|
| Claude Code | Anthropic 的 CLI 编码助手 |
| Cursor Agent | Cursor IDE 的 AI 代理 |
| Gemini CLI | Google 的 Gemini CLI |
| Codex | OpenAI Codex |
| Copilot | GitHub Copilot |
| Amp | Amp 编码助手 |
| Opencode | Opencode |
| QwenCode | 阿里 Qwen Code |
| Droid | Droid |

---

## 3. 新项目技术方案

### 3.1 技术栈选型

| 层级 | 技术 | 选择理由 |
|------|------|----------|
| **后端框架** | Fastify | 高性能，TypeScript 原生支持，插件生态丰富 |
| **数据库** | SQLite + Prisma | 本地优先，类型安全 ORM，迁移管理方便 |
| **进程管理** | node-pty | 伪终端支持，可处理交互式 CLI |
| **Git 操作** | simple-git | 轻量级，Promise API，功能完整 |
| **实时通信** | WebSocket (ws) + SSE | 终端交互 + 事件推送 |
| **前端框架** | React 18 + Vite | 现代化，开发体验好 |
| **状态管理** | Zustand + TanStack Query | 轻量 + 服务端状态缓存 |
| **UI 组件库** | shadcn/ui + TailwindCSS | 可定制性强，基于 Radix UI |
| **包管理** | pnpm | Monorepo 支持好，磁盘效率高 |

### 3.2 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AI Agent 任务管理面板                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Frontend (React + Vite)                       │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │   │
│  │  │  看板页  │ │ 任务详情 │ │ 终端面板 │ │   Git 操作面板   │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                    REST API / WebSocket / SSE                           │
│                              │                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Backend (Node.js + Fastify)                   │   │
│  │                                                                  │   │
│  │  ┌──────────────────────────────────────────────────────────┐   │   │
│  │  │                      Routes Layer                         │   │   │
│  │  │  /projects | /tasks | /workspaces | /sessions | /terminal │   │   │
│  │  └──────────────────────────────────────────────────────────┘   │   │
│  │                              │                                   │   │
│  │  ┌──────────────────────────────────────────────────────────┐   │   │
│  │  │                    Services Layer                         │   │   │
│  │  │  ProjectService | TaskService | WorkspaceService | ...    │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  │                              │                                   │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐                  │   │
│  │  │  Executors │ │ Git Manager│ │  Process   │                  │   │
│  │  │ (AI 代理)  │ │ (Worktree) │ │  Manager   │                  │   │
│  │  └────────────┘ └────────────┘ └────────────┘                  │   │
│  │                              │                                   │   │
│  │  ┌──────────────────────────────────────────────────────────┐   │   │
│  │  │                  Database (SQLite + Prisma)               │   │   │
│  │  └──────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      AI Agent Executors                          │   │
│  │         ┌────────────────┐       ┌────────────────┐             │   │
│  │         │  Claude Code   │       │   Gemini CLI   │             │   │
│  │         │   Executor     │       │    Executor    │             │   │
│  │         └────────────────┘       └────────────────┘             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 目录结构

```
agent-tower/
├── packages/
│   ├── server/                    # 后端服务
│   │   ├── src/
│   │   │   ├── index.ts           # 入口
│   │   │   ├── app.ts             # Fastify 应用配置
│   │   │   ├── routes/            # API 路由
│   │   │   │   ├── projects.ts
│   │   │   │   ├── tasks.ts
│   │   │   │   ├── workspaces.ts
│   │   │   │   ├── sessions.ts
│   │   │   │   └── terminal.ts
│   │   │   ├── services/          # 业务逻辑
│   │   │   │   ├── project.service.ts
│   │   │   │   ├── task.service.ts
│   │   │   │   ├── workspace.service.ts
│   │   │   │   └── session.service.ts
│   │   │   ├── executors/         # AI 代理执行器
│   │   │   │   ├── base.executor.ts
│   │   │   │   ├── claude-code.executor.ts
│   │   │   │   └── gemini-cli.executor.ts
│   │   │   ├── git/               # Git 操作
│   │   │   │   └── worktree.manager.ts
│   │   │   ├── process/           # 进程管理
│   │   │   │   └── process.manager.ts
│   │   │   └── types/             # 类型定义
│   │   │       └── index.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma      # 数据库模型
│   │   │   └── migrations/        # 迁移文件
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                       # 前端应用
│       ├── src/
│       │   ├── main.tsx           # 入口
│       │   ├── App.tsx            # 根组件
│       │   ├── components/        # UI 组件
│       │   │   ├── Kanban/
│       │   │   │   ├── KanbanBoard.tsx
│       │   │   │   ├── KanbanColumn.tsx
│       │   │   │   └── KanbanCard.tsx
│       │   │   ├── Task/
│       │   │   │   ├── TaskDetail.tsx
│       │   │   │   └── TaskForm.tsx
│       │   │   ├── Terminal/
│       │   │   │   └── Terminal.tsx
│       │   │   └── Git/
│       │   │       ├── DiffViewer.tsx
│       │   │       └── MergePanel.tsx
│       │   ├── pages/             # 页面
│       │   │   ├── ProjectList.tsx
│       │   │   └── ProjectKanban.tsx
│       │   ├── hooks/             # 自定义 Hooks
│       │   │   ├── useProjects.ts
│       │   │   ├── useTasks.ts
│       │   │   └── useTerminal.ts
│       │   ├── stores/            # Zustand stores
│       │   │   └── uiStore.ts
│       │   ├── api/               # API 客户端
│       │   │   └── client.ts
│       │   └── types/             # 类型定义
│       │       └── index.ts
│       ├── package.json
│       ├── vite.config.ts
│       └── tsconfig.json
│
├── package.json                   # Monorepo 根配置
├── pnpm-workspace.yaml
├── tsconfig.json                  # 根 TypeScript 配置
└── docs/
    └── PROJECT_SPEC.md            # 本文档
```

### 3.4 数据模型设计

```prisma
// packages/server/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./data.db"
}

// 项目
model Project {
  id          String      @id @default(uuid())
  name        String
  description String?
  repoPath    String      // Git 仓库绝对路径
  mainBranch  String      @default("main")
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  tasks       Task[]
}

// 任务
model Task {
  id          String      @id @default(uuid())
  title       String
  description String?     // 任务描述/需求
  status      TaskStatus  @default(TODO)
  priority    Int         @default(0)  // 数字越大优先级越高
  position    Int         @default(0)  // 看板中的排序位置
  projectId   String
  project     Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  workspaces  Workspace[]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@index([projectId])
  @@index([status])
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  IN_REVIEW
  DONE
}

// 工作空间 (对应一个 git worktree)
model Workspace {
  id           String      @id @default(uuid())
  taskId       String
  task         Task        @relation(fields: [taskId], references: [id], onDelete: Cascade)
  branchName   String      // 分支名称
  worktreePath String      // Worktree 绝对路径
  status       WorkspaceStatus @default(ACTIVE)
  sessions     Session[]
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  @@index([taskId])
}

enum WorkspaceStatus {
  ACTIVE
  MERGED
  ABANDONED
}

// 会话 (一次 AI 代理执行)
model Session {
  id          String        @id @default(uuid())
  workspaceId String
  workspace   Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  agentType   AgentType
  prompt      String        // 发送给 AI 的提示
  status      SessionStatus @default(PENDING)
  processes   ExecutionProcess[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([workspaceId])
}

enum AgentType {
  CLAUDE_CODE
  GEMINI_CLI
}

enum SessionStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}

// 执行进程
model ExecutionProcess {
  id          String      @id @default(uuid())
  sessionId   String
  session     Session     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  pid         Int?        // 进程 ID
  exitCode    Int?        // 退出码
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@index([sessionId])
}

// 执行日志 (单独存储，避免主表过大)
model ExecutionLog {
  id        String   @id @default(uuid())
  processId String
  content   String   // 日志内容
  timestamp DateTime @default(now())

  @@index([processId])
}
```

### 3.5 API 设计

#### 3.5.1 RESTful API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| **Projects** | | |
| GET | /api/projects | 获取项目列表 |
| POST | /api/projects | 创建项目 |
| GET | /api/projects/:id | 获取项目详情 |
| PUT | /api/projects/:id | 更新项目 |
| DELETE | /api/projects/:id | 删除项目 |
| **Tasks** | | |
| GET | /api/projects/:projectId/tasks | 获取项目任务列表 |
| POST | /api/projects/:projectId/tasks | 创建任务 |
| GET | /api/tasks/:id | 获取任务详情 |
| PUT | /api/tasks/:id | 更新任务 |
| PATCH | /api/tasks/:id/status | 更新任务状态 |
| PATCH | /api/tasks/:id/position | 更新任务位置 |
| DELETE | /api/tasks/:id | 删除任务 |
| **Workspaces** | | |
| POST | /api/tasks/:taskId/workspaces | 创建工作空间 |
| GET | /api/workspaces/:id | 获取工作空间详情 |
| DELETE | /api/workspaces/:id | 删除工作空间 |
| GET | /api/workspaces/:id/diff | 获取代码 diff |
| POST | /api/workspaces/:id/merge | 合并到主分支 |
| **Sessions** | | |
| POST | /api/workspaces/:workspaceId/sessions | 创建会话 |
| GET | /api/sessions/:id | 获取会话详情 |
| POST | /api/sessions/:id/start | 启动会话 |
| POST | /api/sessions/:id/stop | 停止会话 |
| POST | /api/sessions/:id/message | 发送后续消息 |
| **System** | | |
| GET | /api/health | 健康检查 |
| GET | /api/agents | 获取可用 AI 代理列表 |

#### 3.5.2 WebSocket 端点

| 路径 | 说明 |
|------|------|
| /ws/terminal/:sessionId | 终端实时交互 |

#### 3.5.3 SSE 端点

| 路径 | 说明 |
|------|------|
| /api/events | 全局事件流 (任务状态变更、会话状态等) |

### 3.6 执行器接口设计

```typescript
// packages/server/src/executors/base.executor.ts

import type { IPty } from 'node-pty';

export interface ExecutorConfig {
  workingDir: string;      // 工作目录 (worktree 路径)
  prompt: string;          // 发送给 AI 的提示
  env?: Record<string, string>;  // 额外环境变量
}

export interface SpawnResult {
  pid: number;
  pty: IPty;
}

export interface AgentAvailability {
  available: boolean;
  version?: string;
  error?: string;
}

export abstract class BaseExecutor {
  abstract readonly agentType: AgentType;
  abstract readonly displayName: string;

  // 检查代理是否已安装且可用
  abstract checkAvailability(): Promise<AgentAvailability>;

  // 获取启动命令
  abstract getCommand(): string;

  // 获取命令参数
  abstract getArgs(config: ExecutorConfig): string[];

  // 启动代理
  async spawn(config: ExecutorConfig): Promise<SpawnResult> {
    const pty = spawn(this.getCommand(), this.getArgs(config), {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: config.workingDir,
      env: { ...process.env, ...config.env },
    });

    return { pid: pty.pid, pty };
  }

  // 发送后续消息 (用于交互式对话)
  sendMessage(pty: IPty, message: string): void {
    pty.write(message + '\n');
  }
}
```

```typescript
// packages/server/src/executors/claude-code.executor.ts

export class ClaudeCodeExecutor extends BaseExecutor {
  readonly agentType = AgentType.CLAUDE_CODE;
  readonly displayName = 'Claude Code';

  async checkAvailability(): Promise<AgentAvailability> {
    try {
      const { stdout } = await execAsync('claude --version');
      return { available: true, version: stdout.trim() };
    } catch (error) {
      return { available: false, error: 'Claude Code CLI not installed' };
    }
  }

  getCommand(): string {
    return 'claude';
  }

  getArgs(config: ExecutorConfig): string[] {
    return ['--print', config.prompt];
  }
}
```

```typescript
// packages/server/src/executors/gemini-cli.executor.ts

export class GeminiCliExecutor extends BaseExecutor {
  readonly agentType = AgentType.GEMINI_CLI;
  readonly displayName = 'Gemini CLI';

  async checkAvailability(): Promise<AgentAvailability> {
    try {
      const { stdout } = await execAsync('gemini --version');
      return { available: true, version: stdout.trim() };
    } catch (error) {
      return { available: false, error: 'Gemini CLI not installed' };
    }
  }

  getCommand(): string {
    return 'gemini';
  }

  getArgs(config: ExecutorConfig): string[] {
    return [config.prompt];
  }
}
```

### 3.7 Git Worktree 管理

```typescript
// packages/server/src/git/worktree.manager.ts

import simpleGit, { SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs/promises';

export class WorktreeManager {
  private git: SimpleGit;
  private repoPath: string;
  private worktreeBaseDir: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
    this.worktreeBaseDir = path.join(repoPath, '..', '.worktrees');
  }

  // 创建 worktree
  async create(branchName: string): Promise<string> {
    const worktreePath = path.join(this.worktreeBaseDir, branchName);

    // 确保目录存在
    await fs.mkdir(this.worktreeBaseDir, { recursive: true });

    // 创建新分支并添加 worktree
    await this.git.raw(['worktree', 'add', '-b', branchName, worktreePath]);

    return worktreePath;
  }

  // 删除 worktree
  async remove(worktreePath: string): Promise<void> {
    await this.git.raw(['worktree', 'remove', worktreePath, '--force']);
  }

  // 获取 diff
  async getDiff(worktreePath: string, baseBranch: string): Promise<string> {
    const worktreeGit = simpleGit(worktreePath);
    return worktreeGit.diff([baseBranch]);
  }

  // 合并到目标分支
  async merge(worktreePath: string, targetBranch: string): Promise<void> {
    const worktreeGit = simpleGit(worktreePath);
    const currentBranch = await worktreeGit.revparse(['--abbrev-ref', 'HEAD']);

    // 切换到目标分支
    await this.git.checkout(targetBranch);

    // 合并
    await this.git.merge([currentBranch]);

    // 删除 worktree
    await this.remove(worktreePath);

    // 删除分支
    await this.git.deleteLocalBranch(currentBranch, true);
  }

  // 列出所有 worktree
  async list(): Promise<string[]> {
    const result = await this.git.raw(['worktree', 'list', '--porcelain']);
    // 解析输出...
    return [];
  }
}
```

---

## 4. 待确认事项

| 序号 | 问题 | 选项 | 当前选择 |
|------|------|------|----------|
| 1 | 项目名称 | agent-kanban / ai-task-board / 其他 | ✅ agent-tower |
| 2 | 包管理器 | pnpm / npm / yarn | ✅ pnpm |
| 3 | UI 组件库 | 纯 TailwindCSS / shadcn/ui / Ant Design | ✅ shadcn/ui + TailwindCSS |
| 4 | 第一版功能范围 | 见下方清单 | 待定 |

### 第一版功能清单

- [ ] 项目管理 (CRUD)
- [ ] 任务看板 (拖拽排序)
- [ ] Git worktree 创建/管理
- [ ] Claude Code 执行器
- [ ] Gemini CLI 执行器
- [ ] 终端实时日志
- [ ] 代码 diff 查看
- [ ] 合并到主分支

---

## 5. 后续扩展方向

1. **更多 AI 代理支持**: Cursor Agent, Copilot, Codex 等
2. **MCP 协议集成**: 让 AI 代理可以直接操作任务面板
3. **多用户协作**: 用户认证、权限管理、团队协作
4. **任务模板**: 预设常用任务类型
5. **自动化工作流**: 任务完成后自动创建 PR、自动合并等
6. **统计分析**: AI 代理使用统计、任务完成率等

---

## 更新记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-02-04 | v0.1 | 初始版本，完成需求分析和架构设计 |
