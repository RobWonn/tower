# 需求文档：高级 Git 操作

## 简介

为 Agent Tower 添加高级 Git 操作功能，包括 Rebase 支持、增强的合并冲突检测与处理、Git 操作状态监控、冲突解决 UI 以及 AI 辅助冲突解决。这些功能参考了 vibe-kanban 项目的实现，旨在让用户在管理 AI Agent 任务时能够更好地处理分支分歧和代码冲突。

## 术语表

- **WorktreeManager**: 服务端 Git worktree 管理器，封装了 git CLI 操作，位于 `packages/server/src/git/worktree.manager.ts`
- **WorkspaceService**: 工作空间业务逻辑层，协调 WorktreeManager 与数据库操作
- **GitOperationStatus**: 描述当前 Git 操作状态的数据结构，包含操作类型（idle、rebase、merge）、是否有冲突、冲突文件列表
- **ConflictOp**: 冲突操作类型枚举，标识冲突来源（REBASE、MERGE）
- **ConflictBanner**: 前端冲突提示横幅组件，展示冲突状态和操作按钮
- **ResolveConflictsDialog**: 前端冲突解决对话框组件，让用户选择解决方式（AI 辅助或手动）
- **InstructionBuilder**: 冲突解决指令生成器，根据冲突上下文生成结构化的 AI Agent 指令
- **EventBus**: 服务端事件总线，通过 Socket.IO room 广播把实时事件转发给前端
- **Session**: AI Agent 的一次执行会话，可接收 follow-up 指令

## 需求

### 需求 1：Rebase 操作支持

**用户故事：** 作为用户，我希望能将工作空间分支 rebase 到最新的基础分支上，以便在基础分支前进后保持分支同步。

#### 验收标准

1. WHEN 用户对一个工作空间发起 rebase 操作时，THE WorktreeManager SHALL 计算任务分支与基础分支的 merge-base，然后执行 `git rebase --onto <new_base> <merge_base> <task_branch>`
2. WHEN rebase 操作成功完成时，THE WorkspaceService SHALL 返回包含成功状态的响应
3. IF rebase 过程中发生冲突，THEN THE WorktreeManager SHALL 抛出包含冲突文件列表和冲突操作类型（REBASE）的 MergeConflictError
4. IF 当前 worktree 中已有 rebase 操作正在进行，THEN THE WorktreeManager SHALL 拒绝新的 rebase 请求并抛出 RebaseInProgressError
5. IF rebase 操作失败且非冲突原因，THEN THE WorktreeManager SHALL 自动执行 `git rebase --abort` 以保持仓库干净状态

### 需求 2：Git 操作状态查询

**用户故事：** 作为用户，我希望能查询工作空间当前的 Git 操作状态，以便了解是否有 rebase 或 merge 正在进行中。

#### 验收标准

1. WHEN 用户查询工作空间的 Git 状态时，THE WorktreeManager SHALL 通过检测 rebase-merge 和 rebase-apply 目录是否存在来判断 rebase 是否进行中
2. WHEN 用户查询工作空间的 Git 状态时，THE WorktreeManager SHALL 通过检测 MERGE_HEAD 是否存在来判断 merge 是否进行中
3. WHEN 存在进行中的 Git 操作时，THE WorktreeManager SHALL 在 GitOperationStatus 中包含冲突文件列表
4. THE GitOperationStatus SHALL 包含操作类型（idle、rebase、merge）、冲突文件列表和分支分歧信息（ahead/behind 计数）

### 需求 3：中止 Git 操作

**用户故事：** 作为用户，我希望能中止正在进行的 rebase 或 merge 操作，以便在冲突无法解决时回退到操作前的状态。

#### 验收标准

1. WHEN 用户请求中止 rebase 操作时，THE WorktreeManager SHALL 执行 `git rebase --abort` 并恢复到 rebase 前的状态
2. WHEN 用户请求中止 merge 操作时，THE WorktreeManager SHALL 执行 `git merge --abort` 并恢复到 merge 前的状态
3. IF 没有正在进行的 Git 操作时用户请求中止，THEN THE WorktreeManager SHALL 返回成功（no-op 行为）
4. WHEN 中止操作完成后，THE WorktreeManager SHALL 确保 worktree 中不存在 rebase-merge、rebase-apply 目录或 MERGE_HEAD 文件

### 需求 4：增强的合并冲突检测

**用户故事：** 作为用户，我希望在合并或 rebase 操作失败时获得详细的冲突信息，以便了解哪些文件存在冲突以及冲突的来源。

#### 验收标准

1. WHEN squash merge 过程中发生冲突时，THE WorktreeManager SHALL 抛出包含冲突文件列表和冲突操作类型（MERGE）的 MergeConflictError
2. WHEN rebase 过程中发生冲突时，THE WorktreeManager SHALL 抛出包含冲突文件列表和冲突操作类型（REBASE）的 MergeConflictError
3. THE MergeConflictError SHALL 包含 conflictedFiles 字符串数组和 conflictOp 字段（类型为 ConflictOp）

### 需求 5：Git 操作 API 端点

**用户故事：** 作为前端开发者，我希望有完整的 REST API 端点来执行和查询 Git 操作，以便在 UI 中集成这些功能。

#### 验收标准

1. WHEN 前端发送 POST `/workspaces/:id/rebase` 请求时，THE API SHALL 执行 rebase 操作并返回包含操作结果的 JSON 响应
2. WHEN 前端发送 GET `/workspaces/:id/git-status` 请求时，THE API SHALL 返回符合 GitOperationStatus 结构的 JSON 响应
3. WHEN 前端发送 POST `/workspaces/:id/abort-operation` 请求时，THE API SHALL 中止当前进行中的 Git 操作并返回操作结果
4. WHEN Git 操作产生冲突时，THE API SHALL 返回 HTTP 409 状态码和包含冲突文件列表及冲突操作类型的 JSON 响应
5. IF 请求中指定的工作空间不存在，THEN THE API SHALL 返回 HTTP 404 状态码和标准错误响应

### 需求 6：冲突状态 UI 展示

**用户故事：** 作为用户，我希望在工作空间界面中看到冲突状态提示，以便及时了解并处理代码冲突。

#### 验收标准

1. WHEN 工作空间存在 Git 冲突时，THE ConflictBanner SHALL 展示冲突操作类型、冲突文件数量和操作按钮（解决冲突、中止操作）
2. WHEN 用户点击"中止操作"按钮时，THE ConflictBanner SHALL 调用 abort-operation API 并刷新 Git 状态
3. WHEN 用户点击"解决冲突"按钮时，THE ConflictBanner SHALL 打开 ResolveConflictsDialog
4. WHEN 工作空间没有冲突时，THE ConflictBanner SHALL 不渲染任何内容

### 需求 7：冲突解决对话框

**用户故事：** 作为用户，我希望通过对话框选择冲突解决方式，以便使用 AI Agent 自动解决冲突或手动处理。

#### 验收标准

1. WHEN ResolveConflictsDialog 打开时，THE ResolveConflictsDialog SHALL 展示冲突文件列表、冲突操作类型和可用的解决方式选项
2. WHEN 用户选择 AI 辅助解决并选定一个 Session 时，THE ResolveConflictsDialog SHALL 调用 InstructionBuilder 生成冲突解决指令并发送到该 Session
3. WHEN 用户选择手动解决时，THE ResolveConflictsDialog SHALL 提供在 IDE 中打开工作空间的选项
4. WHEN 冲突解决指令发送成功后，THE ResolveConflictsDialog SHALL 关闭对话框并显示操作已提交的通知

### 需求 8：AI 冲突解决指令生成

**用户故事：** 作为用户，我希望系统能生成结构化的冲突解决指令发送给 AI Agent，以便 Agent 能理解并自动解决冲突。

#### 验收标准

1. THE InstructionBuilder SHALL 根据冲突操作类型、源分支名、目标分支名和冲突文件列表生成结构化的冲突解决指令文本
2. WHEN 生成 rebase 冲突解决指令时，THE InstructionBuilder SHALL 在指令中包含执行 `git rebase --continue` 的步骤说明
3. WHEN 生成 merge 冲突解决指令时，THE InstructionBuilder SHALL 在指令中包含执行 `git add` 和 `git commit` 的步骤说明
4. THE InstructionBuilder SHALL 在指令文本中列出所有冲突文件的完整路径
5. THE InstructionBuilder SHALL 生成的指令文本为非空字符串

### 需求 9：共享类型定义

**用户故事：** 作为开发者，我希望 Git 操作相关的类型定义在前后端之间共享，以便保持类型一致性。

#### 验收标准

1. THE System SHALL 在 `packages/shared/src/types.ts` 中定义 GitOperationStatus 接口和 ConflictOp 枚举
2. FOR ALL 有效的 GitOperationStatus 对象，THE System SHALL 保证序列化为 JSON 后再反序列化能得到等价的对象（round-trip 属性）
3. THE ConflictOp 枚举 SHALL 包含 REBASE 和 MERGE 两种值
