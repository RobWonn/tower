# Implementation Plan: 高级 Git 操作

## 概述

按照分层架构自底向上实现：共享类型 → Git 层 → 服务层 → API 层 → 前端 hooks → 前端组件。每一步都在前一步基础上构建，确保没有孤立代码。

## Tasks

- [ ] 1. 共享类型与错误类型定义
  - [ ] 1.1 在 `packages/shared/src/types.ts` 中添加 ConflictOp 枚举和 GitOperationStatus 接口
    - 添加 `ConflictOp` 枚举（REBASE、MERGE）
    - 添加 `GitOperationStatus` 接口（operation、conflictedFiles、conflictOp、ahead、behind）
    - _Requirements: 9.1, 9.3_
  - [ ]* 1.2 编写 GitOperationStatus round-trip 属性测试
    - 使用 fast-check 生成随机 GitOperationStatus 对象
    - 验证 JSON.parse(JSON.stringify(obj)) 与原对象深度相等
    - **Property 9: GitOperationStatus 序列化 round-trip**
    - **Validates: Requirements 9.2**
  - [ ] 1.3 在 `packages/server/src/git/git-cli.ts` 中添加 RebaseInProgressError 类和扩展 MergeConflictError
    - 新增 `RebaseInProgressError` 错误类
    - 为 `MergeConflictError` 添加 `conflictOp` 字段
    - 更新现有 `merge` 方法中的 MergeConflictError 构造调用，传入 `ConflictOp.MERGE`
    - _Requirements: 4.3, 1.4_

- [ ] 2. WorktreeManager Git 操作扩展
  - [ ] 2.1 实现 `isRebaseInProgress` 和 `isMergeInProgress` 私有方法
    - `isRebaseInProgress`: 通过 `git rev-parse --git-path rebase-merge` 和 `rebase-apply` 检测目录是否存在
    - `isMergeInProgress`: 通过 `git rev-parse --verify MERGE_HEAD` 检测
    - _Requirements: 2.1, 2.2_
  - [ ] 2.2 实现 `getGitOperationStatus` 方法
    - 调用 isRebaseInProgress、isMergeInProgress 判断操作类型
    - 调用 getConflictedFiles 获取冲突文件列表（将现有私有方法改为 public 或在此方法内调用）
    - 调用 getBranchStatus 获取 ahead/behind 信息
    - 返回 GitOperationStatus 对象
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [ ] 2.3 实现 `rebase` 方法
    - 检查 isRebaseInProgress，如果是则抛出 RebaseInProgressError
    - 通过 `git merge-base <baseBranch> <taskBranch>` 计算 merge-base
    - 执行 `git rebase --onto <baseBranch> <mergeBase> <taskBranch>`
    - 冲突时：获取冲突文件列表，抛出 MergeConflictError(files, ConflictOp.REBASE)（保留 rebase 状态不自动中止）
    - 非冲突失败时：自动执行 `git rebase --abort` 清理
    - _Requirements: 1.1, 1.3, 1.4, 1.5_
  - [ ] 2.4 实现 `abortOperation` 方法
    - 检测当前操作类型（rebase 或 merge）
    - rebase 进行中：执行 `git rebase --abort`
    - merge 进行中：执行 `git merge --abort`
    - 无操作进行中：no-op，直接返回
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [ ]* 2.5 编写 Git 操作状态检测属性测试
    - 使用临时 Git 仓库，创建不同状态（idle、mid-rebase、mid-merge）
    - 验证 getGitOperationStatus 返回值与实际 Git 状态一致
    - **Property 4: Git 操作状态检测准确性**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
  - [ ]* 2.6 编写 InstructionBuilder 输出完整性属性测试
    - 使用 fast-check 生成随机分支名、冲突文件列表和操作类型
    - 验证输出包含所有文件路径，且根据操作类型包含正确的 git 命令
    - **Property 8: InstructionBuilder 输出完整性**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**

- [ ] 3. Checkpoint - 确保 Git 层测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [ ] 4. WorkspaceService 扩展
  - [ ] 4.1 在 WorkspaceService 中添加 `rebase`、`getGitStatus`、`abortOperation` 方法
    - `rebase(id)`: 查找 workspace → 获取 project → 调用 worktreeManager.rebase
    - `getGitStatus(id)`: 查找 workspace → 获取 project → 调用 worktreeManager.getGitOperationStatus
    - `abortOperation(id)`: 查找 workspace → 获取 project → 调用 worktreeManager.abortOperation
    - 所有方法在 workspace 不存在时抛出 NotFoundError
    - _Requirements: 1.2, 5.1, 5.2, 5.3, 5.5_

- [ ] 5. API 路由扩展
  - [ ] 5.1 在 `packages/server/src/routes/workspaces.ts` 中添加三个新端点
    - `POST /workspaces/:id/rebase`: 调用 workspaceService.rebase，成功返回 200
    - `GET /workspaces/:id/git-status`: 调用 workspaceService.getGitStatus，返回 GitOperationStatus
    - `POST /workspaces/:id/abort-operation`: 调用 workspaceService.abortOperation，返回 200
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ] 5.2 更新错误处理钩子支持新错误类型
    - MergeConflictError → 409 响应，包含 conflictedFiles 和 conflictOp
    - RebaseInProgressError → 409 响应
    - _Requirements: 5.4_
  - [ ]* 5.3 编写 API 冲突响应格式属性测试
    - 验证 MergeConflictError 转换为 409 响应时包含正确的 conflictedFiles 和 conflictOp
    - **Property 6: API 冲突响应格式正确性**
    - **Validates: Requirements 5.4**

- [ ] 6. Checkpoint - 确保服务端测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [ ] 7. 前端 Hooks 与工具函数
  - [ ] 7.1 在 `packages/web/src/hooks/use-workspaces.ts` 中添加 useGitStatus、useRebaseWorkspace、useAbortOperation hooks
    - `useGitStatus(workspaceId)`: useQuery，queryKey 为 workspaces.gitStatus(id)
    - `useRebaseWorkspace()`: useMutation，POST /workspaces/:id/rebase
    - `useAbortOperation()`: useMutation，POST /workspaces/:id/abort-operation，成功后 invalidate gitStatus 查询
    - 在 `packages/web/src/hooks/query-keys.ts` 中添加 gitStatus query key
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ] 7.2 创建 `packages/web/src/lib/conflict-instructions.ts` 实现 InstructionBuilder
    - 实现 `buildResolveConflictsInstructions(sourceBranch, targetBranch, conflictedFiles, conflictOp)` 函数
    - rebase 类型：包含 rebase 上下文描述和 `git rebase --continue` 步骤
    - merge 类型：包含 merge 上下文描述和 `git add` + `git commit` 步骤
    - 列出所有冲突文件路径
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 8. 前端冲突 UI 组件
  - [ ] 8.1 创建 `packages/web/src/components/workspace/ConflictBanner.tsx`
    - 接收 workspaceId 和 gitStatus props
    - 当无冲突时返回 null
    - 展示冲突操作类型标签（Rebase/Merge）、冲突文件数量
    - 提供"中止操作"按钮（调用 useAbortOperation）和"解决冲突"按钮（触发 onResolve 回调）
    - 使用 shadcn/ui Alert 组件样式
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ] 8.2 创建 `packages/web/src/components/workspace/ResolveConflictsDialog.tsx`
    - 使用 shadcn/ui Dialog 组件
    - 展示冲突文件列表和操作类型
    - AI 辅助解决：选择 Session 下拉 → 调用 buildResolveConflictsInstructions → useSendMessage 发送
    - 手动解决：调用 useOpenInEditor 打开工作空间
    - 发送成功后关闭对话框
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [ ] 8.3 将 ConflictBanner 集成到现有工作空间详情视图中
    - 在工作空间详情页面中引入 useGitStatus hook
    - 在合适位置渲染 ConflictBanner
    - 连接 ConflictBanner 的 onResolve 回调到 ResolveConflictsDialog
    - _Requirements: 6.1_
  - [ ]* 8.4 编写 ConflictBanner 渲染正确性单元测试
    - 测试有冲突时渲染正确内容
    - 测试无冲突时不渲染
    - **Property 7: ConflictBanner 渲染正确性**
    - **Validates: Requirements 6.1, 6.4**

- [ ] 9. Final checkpoint - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加快 MVP 交付
- 每个任务引用了具体的需求编号以保证可追溯性
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况
- Checkpoint 确保增量验证
