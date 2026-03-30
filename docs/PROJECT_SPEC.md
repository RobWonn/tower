# Agent Tower - 项目规格文档

本文档描述 Agent Tower 当前产品范围、核心用户流程和主要能力边界，作为“项目现在是什么”的说明，而不是最初的立项草案。

## 1. 产品定位

Agent Tower 是一个本地优先的 AI Agent 任务管理面板，用来把多个 coding agent 的执行过程集中到一个界面中管理。

它解决的问题包括：

- 多个 agent 同时跑任务时，终端窗口和上下文容易失控
- 多任务同时改同一个仓库时，容易互相踩文件
- 需要从手机远程查看任务进度，而不是一直守在电脑前
- 不同任务适合不同 provider，希望能按任务切换成本和能力
- 需要把 agent 的运行日志、代码变更、待办、token 用量、合并流程集中在一起

## 2. 目标用户

当前主要面向以下用户：

- 在本地机器上同时运行多个 AI coding agent 的个人开发者
- 需要把 Claude Code、Gemini CLI、Cursor Agent、Codex 混合使用的人
- 希望把 AI 任务从“一个个终端窗口”升级为“可审阅、可恢复、可并行”的工作流的人

当前产品默认是单用户模式，不以团队协作或云端多租户为目标。

## 3. 核心业务对象

### 3.1 数据模型

系统围绕以下对象组织：

```text
Project -> Task -> Workspace -> Session -> ExecutionProcess
```

含义如下：

- `Project`: 一个本地 Git 仓库
- `Task`: 看板中的工作项
- `Workspace`: 任务对应的独立 git worktree
- `Session`: 一次 agent 执行或一次后续续聊
- `ExecutionProcess`: 实际启动的底层 PTY/进程记录

补充对象：

- `Provider`: agent 的具体配置实例，包含环境变量和 CLI 设置
- `Attachment`: 上传的文件，可注入到任务描述或会话消息中
- `NotificationSettings`: 系统通知和飞书 webhook 配置

### 3.2 状态定义

- Task 状态：`TODO`、`IN_PROGRESS`、`IN_REVIEW`、`DONE`、`CANCELLED`
- Workspace 状态：`ACTIVE`、`MERGED`、`ABANDONED`
- Session 状态：`PENDING`、`RUNNING`、`COMPLETED`、`FAILED`、`CANCELLED`
- Session 用途：`CHAT`、`COMMIT_MSG`

## 4. 当前已实现能力

### 4.1 项目与任务管理

- 项目 CRUD，记录仓库路径、主分支、自动复制文件、setup script、快捷命令
- 任务 CRUD
- 看板式状态管理
- 任务详情视图
- 按项目过滤与实时刷新

### 4.2 Worktree 与 Git 工作流

- 每个任务可创建独立 workspace
- workspace 使用独立分支和 git worktree 目录
- 支持读取 diff、查看 Git 状态、rebase、abort operation
- merge 使用 squash merge 流程
- merge/rebase 冲突检测与冲突解决入口
- merged workspace 可复用，便于任务继续迭代

### 4.3 Agent 执行

当前支持的 agent 类型：

- Claude Code
- Gemini CLI
- Cursor Agent
- Codex

当前支持的执行能力：

- 创建 session
- 启动 agent
- 续聊或继续执行已有 session
- 停止运行中的 session
- 为同一 agent 类型切换 provider
- 记录 token usage、日志快照和执行进程

### 4.4 实时体验

- 通过 Socket.IO 订阅 session、task、project、terminal、agent room
- 实时查看终端 stdout
- 实时同步结构化日志 patch
- 实时更新任务状态
- 实时展示 workspace setup script 进度
- 实时推送 AI 生成的 commit message

### 4.5 Workspace 工作台

任务详情页集成了一个完整工作台：

- 日志流
- Todo 面板
- token usage 指示器
- 文件编辑器
- Git changes 视图
- 历史视图
- 独立终端 tabs
- Open in IDE

### 4.6 附加能力

- 上传附件并注入任务/消息
- OS 通知
- 飞书 webhook 通知
- Cloudflare tunnel 远程访问
- MCP server 暴露任务板工具
- 移动端适配

## 5. 典型用户流程

### 5.1 创建并启动任务

1. 用户创建项目，关联本地仓库路径
2. 用户创建任务，输入标题、描述、附件
3. 用户选择 provider
4. 系统创建 workspace，并在仓库旁边创建 git worktree
5. 系统复制项目配置文件并异步执行 setup script
6. 系统创建 session
7. 系统启动对应 agent CLI
8. 前端实时显示日志、Todo、变更和 token 使用情况

### 5.2 继续对话

1. 用户在任务详情页输入后续消息
2. 后端为该 session 新建或替换底层 PTY
3. 如有可用的 agent session id，则尝试 follow-up 模式
4. 新输出继续进入同一个日志快照体系

### 5.3 审查与合并

1. 一个任务下所有聊天 session 结束后，任务自动推进到 `IN_REVIEW`
2. 系统异步生成 commit message
3. 用户查看 diff / Git 状态 / 冲突信息
4. 用户执行 squash merge
5. 任务推进到 `DONE`

## 6. 自动化规则

当前后端内置了几条重要的自动化规则：

- Session 启动时，任务会自动转到 `IN_PROGRESS`
- 任务下所有 `CHAT` session 结束后，任务自动转到 `IN_REVIEW`
- 普通 `CHAT` session 正常退出后，后端会尝试自动提交未保存改动
- 每次聊天 session 结束后，会重新触发 commit message 生成
- 应用启动时会对所有项目执行 `git worktree prune`

这些规则的目标是让任务尽量保持“可恢复、可审阅、状态一致”。

## 7. 对外接口范围

### 7.1 REST API

当前 API 已覆盖以下领域：

- 项目
- 任务
- 工作区
- 会话
- Git 状态与变更
- 文件系统浏览与文件读写
- Provider / Profile 管理
- 独立终端
- 附件
- 通知设置
- 隧道控制
- 系统能力与清理

### 7.2 Socket.IO 事件

当前主要事件流包括：

- session stdout / patch / exit / completed
- task updated / deleted
- terminal stdout / exit
- workspace setup progress
- workspace commit message updated
- agent status changed

### 7.3 MCP

MCP 当前提供的主要工具包括：

- `list_projects`
- `list_tasks`
- `create_task`
- `get_task`
- `update_task`
- `delete_task`
- `list_providers`
- `start_workspace_session`
- `get_workspace_diff`
- `merge_workspace`
- `stop_session`
- `send_message`
- `get_context`（仅在 worktree 目录内可用）

## 8. 非目标与当前限制

以下内容当前不属于已完成能力：

- 多用户账户系统
- 细粒度权限控制
- 云端托管 agent 执行
- GitHub PR / Checks 深度集成
- 完整的浏览器预览面板
- 通用的团队协作通知流

此外，产品仍然依赖本机环境：

- 目标仓库必须在本地可访问
- 对应 agent CLI 必须已安装并可运行
- provider 所需环境变量需要本机配置

## 9. 当前设计原则

- 本地优先：数据、代码、执行过程都尽量留在本机
- 可恢复：session 日志会持久化为快照，页面刷新后仍可回看
- 可并行：每个任务通过 worktree 隔离，允许多个 agent 并行工作
- 可观察：日志、Todo、token、diff、Git 状态尽量集中呈现
- 可扩展：通过 provider、executor、MCP tools 扩展能力，而不是把逻辑写死在单一 agent 上

## 10. 更新记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-03-30 | v0.2 | 从早期方案文档重写为当前产品规格，补齐真实能力边界与用户流程 |
