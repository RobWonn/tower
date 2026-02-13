# Workspace 生命周期重构计划

## 背景

### 问题

当前 Agent Tower 的 `WorktreeManager.merge()` 在 squash merge 后立即执行 `git worktree remove` + `git branch -D`，导致：

1. 合并后无法在同一任务上继续工作（branch 被删了）
2. Agent 进程退出时如果有未提交变更，worktree 是脏的，后续 merge/rebase 会失败
3. 没有 auto-commit 兜底机制，依赖 Agent 自己提交

### 参考项目：vibe-kanban

通过分析 `example/vibe-kanban` 的 Rust 源码，发现其设计哲学与我们当前实现有重大差异：

| 维度 | Agent Tower 当前 | vibe-kanban |
|------|-----------------|-------------|
| merge 后 branch | `git branch -D` 删除 | `git update-ref` 指向 merge commit，保留 |
| merge 后 worktree | `git worktree remove` 立即删除 | 标记 archived，延迟清理 |
| 进程退出 auto-commit | 无 | 有，`try_commit_changes()` 兜底 |
| 继续工作 | 必须创建全新 workspace + 新 branch | 从保留的 branch 重建 worktree |
| worktree 清理 | merge 时立即清理 | 30 分钟定时任务扫描过期 workspace |

### 设计决策

经讨论，我们采用 vibe-kanban 的核心思路但做简化：

- **merge 后立即清理 worktree**（不搞定时任务，对本地单用户场景没必要）
- **保留 branch**（通过 `update-ref` 指向 merge commit）
- **需要继续工作时从 branch 重建 worktree**（`ensureWorktreeExists`）
- **进程退出时 auto-commit**（保证 worktree 始终干净）

### vibe-kanban 关键代码参考

| 功能 | 文件 | 行号 |
|------|------|------|
| squash merge + update-ref | `example/vibe-kanban/crates/git/src/lib.rs` | 818-916 |
| squash merge CLI | `example/vibe-kanban/crates/git/src/cli.rs` | 625-641 |
| merge API（标记 archived，不删 worktree） | `example/vibe-kanban/crates/server/src/routes/task_attempts.rs` | 458-578 |
| 进程退出 auto-commit | `example/vibe-kanban/crates/local-deployment/src/container.rs` | 496-505, 1397-1421 |
| ensure_worktree_exists（重建） | `example/vibe-kanban/crates/services/src/services/worktree_manager.rs` | 93-123 |
| 过期清理（定时任务） | `example/vibe-kanban/crates/local-deployment/src/container.rs` | 209-248 |
| ensure_container_exists（按需重建） | `example/vibe-kanban/crates/local-deployment/src/container.rs` | 1067-1106 |

---

## 流程图

### 当前流程（有问题）

```
用户启动 Agent
    │
    ▼
创建 Workspace ──► 新 branch (at/xxxx) + 新 worktree
    │
    ▼
Agent 在 worktree 中工作
    │
    ▼
Agent 退出 ──► ⚠️ 可能有未提交变更（无 auto-commit）
    │
    ▼
用户点击 Merge
    │
    ├── worktree 脏？ ──► ❌ 报错 WorktreeDirtyError（卡住）
    │
    ▼
git merge --squash
    │
    ▼
git worktree remove + git branch -D ──► ❌ branch 永久删除
    │
    ▼
Workspace 标记 MERGED
    │
    ▼
用户想继续改？ ──► 只能创建全新 workspace + 全新 branch
                    （与之前的工作完全断开）
```

### 重构后流程

```
用户启动 Agent
    │
    ├── Task 下有 MERGED workspace？
    │       │
    │       ├── 是 ──► 复用已有 branch，调用 ensureWorktreeExists 重建 worktree
    │       │          更新 workspace: MERGED → ACTIVE, 填入新 worktreePath
    │       │
    │       └── 否 ──► 创建新 branch (at/xxxx) + 新 worktree（现有逻辑）
    │
    ▼
Agent 在 worktree 中工作
    │
    ▼
Agent 退出
    │
    ▼
★ auto-commit ──► 检查 git status，有变更则 git add -A && git commit
    │               （保证 worktree 始终干净）
    ▼
Session 标记 COMPLETED，Task 自动推进到 IN_REVIEW
    │
    ▼
用户点击 Merge
    │
    ▼
git merge --squash --no-commit <taskBranch>
    │
    ▼
git commit -m "squash merge branch 'at/xxxx'"
    │
    ▼
★ git update-ref ──► 将 taskBranch 指向 merge commit（保留 branch）
    │
    ▼
git worktree remove ──► 清理物理目录（释放磁盘）
    │
    ▼
DB 更新: workspace.status = MERGED, workspace.worktreePath = ''
         task.status = DONE
    │
    ▼
用户想继续改？
    │
    ▼
重新启动 Agent ──► 回到顶部，走"复用已有 branch"路径
                    branch 已指向 merge commit，不会有冲突
```

### auto-commit 详细流程

```
session:exit 事件触发
    │
    ▼
查询 session → workspace → task → project
    │
    ▼
获取 worktreePath
    │
    ├── worktreePath 为空？ ──► 跳过
    │
    ▼
git status --porcelain (在 worktreePath 下执行)
    │
    ├── 输出为空（干净）？ ──► 跳过
    │
    ▼
git add -A
    │
    ▼
git commit -m "auto-commit: uncommitted changes from session {shortId}"
    │
    ▼
日志: [SessionManager] Auto-committed changes for session xxx
    │
    ▼
继续执行 persistCompletedSnapshot → checkTaskAutoAdvance
```

---

## 改动清单

### 改动 1：Prisma Schema — worktreePath 支持空值

文件：`packages/server/prisma/schema.prisma`，第 48 行

```diff
- worktreePath String
+ worktreePath String    @default("")
```

MERGED 状态的 workspace 的 worktreePath 会被清空为 `""`。

执行：`npx prisma migrate dev --name workspace-worktree-path-optional`

### 改动 2：WorktreeManager.merge() — 保留 branch，update-ref

文件：`packages/server/src/git/worktree.manager.ts`，第 242-301 行

当前第 289-301 行：
```typescript
// 5. Commit the squash
const message = options?.commitMessage ?? `squash merge branch '${taskBranch}'`;
await execGit(this.repoPath, ['commit', '-m', message]);

// 6. Clean up: remove worktree and delete task branch
await this.remove(worktreePath);
try {
  await execGit(this.repoPath, ['branch', '-D', taskBranch]);
} catch {
  // Branch may already be removed with the worktree — ignore
}
```

改为：
```typescript
// 5. Commit the squash
const message = options?.commitMessage ?? `squash merge branch '${taskBranch}'`;
await execGit(this.repoPath, ['commit', '-m', message]);

// 6. Get the merge commit SHA
const sha = (await execGit(this.repoPath, ['rev-parse', 'HEAD'])).trim();

// 7. Update task branch ref to point to the merge commit
//    This allows future work to continue from the merged state without conflicts
//    参考: vibe-kanban crates/git/src/lib.rs:873-879
await execGit(this.repoPath, ['update-ref', `refs/heads/${taskBranch}`, sha]);

// 8. Remove worktree (but keep the branch for future reuse)
await this.remove(worktreePath);

return { sha, taskBranch };
```

同时修改方法签名：
```diff
- async merge(...): Promise<void> {
+ async merge(...): Promise<{ sha: string; taskBranch: string }> {
```

### 改动 3：WorktreeManager 新增 ensureWorktreeExists()

文件：`packages/server/src/git/worktree.manager.ts`

在 `remove()` 方法之后新增：

```typescript
/**
 * 确保 worktree 存在。如果已存在且有效则直接返回路径，否则从已有 branch 重建。
 * 用于 MERGED workspace 被重新激活时恢复 worktree。
 *
 * 与 create() 的区别：create() 创建新 branch (-b)，本方法挂载已有 branch。
 * 参考: vibe-kanban crates/services/src/services/worktree_manager.rs:93-123
 */
async ensureWorktreeExists(branchName: string): Promise<string> {
  // 1. 确认 branch 存在
  const exists = await this.checkBranchExists(branchName);
  if (!exists) {
    throw new BranchNotFoundError(branchName);
  }

  const worktreePath = path.join(this.worktreeBaseDir, branchName);

  // 2. 检查 worktree 是否已存在且有效
  const pathExists = await fs.access(worktreePath).then(() => true).catch(() => false);
  if (pathExists) {
    // 检查是否是有效的 git worktree（有 .git 文件）
    const gitFileExists = await fs.access(path.join(worktreePath, '.git')).then(() => true).catch(() => false);
    if (gitFileExists) {
      return worktreePath; // 已存在且有效
    }
    // 无效的目录，先清理
    await this.remove(worktreePath);
  }

  // 3. 清理可能残留的 stale worktree 引用
  await this.prune();

  // 4. 创建 worktree（挂载已有 branch，不加 -b）
  await fs.mkdir(this.worktreeBaseDir, { recursive: true });
  try {
    await execGit(this.repoPath, ['worktree', 'add', worktreePath, branchName]);
  } catch (err) {
    if (err instanceof GitError) {
      throw new GitError(
        `Failed to recreate worktree for branch '${branchName}': ${err.message}`,
        'WORKTREE_RECREATE_FAILED'
      );
    }
    throw err;
  }

  return worktreePath;
}
```

### 改动 4：SessionManager — 进程退出时 auto-commit

文件：`packages/server/src/services/session-manager.ts`

**4a. 修改 `session:exit` 事件处理（第 25-38 行）：**

```typescript
this.eventBus.on('session:exit', ({ sessionId }) => {
  const pipeline = this.pipelines.get(sessionId);
  if (!pipeline) return;
  pipeline.destroy();
  this.pipelines.delete(sessionId);
  // auto-commit → persist snapshot → auto-advance task
  this.autoCommitChanges(sessionId)
    .then(() => this.persistCompletedSnapshot(sessionId))
    .then(() => this.checkTaskAutoAdvance(sessionId))
    .catch((error) => {
      console.error(`[SessionManager] post-exit handling failed for ${sessionId}:`, error);
    });
});
```

**4b. 新增 `autoCommitChanges` 私有方法：**

参考 vibe-kanban `crates/local-deployment/src/container.rs:496-505, 1397-1421`

```typescript
/**
 * Agent 进程退出后自动提交未保存的变更。
 *
 * 这是保证 worktree 始终干净的兜底机制。
 * vibe-kanban 在 spawn_exit_monitor 中也有相同逻辑（try_commit_changes）。
 * commit message 使用固定格式，因为最终会被 squash merge 合并，
 * 单次 commit message 质量不重要。
 */
private async autoCommitChanges(sessionId: string): Promise<void> {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { workspace: true },
    });
    if (!session?.workspace?.worktreePath) return;

    const worktreePath = session.workspace.worktreePath;

    // 检查是否有未提交变更
    const status = await execGit(worktreePath, ['status', '--porcelain']);
    if (!status.trim()) return;

    // auto-commit 所有变更
    await execGit(worktreePath, ['add', '-A']);
    await execGit(worktreePath, ['commit', '-m',
      `auto-commit: uncommitted changes from session ${sessionId.slice(0, 8)}`
    ]);

    console.log(`[SessionManager] Auto-committed changes for session ${sessionId}`);
  } catch (error) {
    // auto-commit 失败不应阻断后续流程
    console.warn(`[SessionManager] Auto-commit failed for session ${sessionId}:`,
      error instanceof Error ? error.message : error
    );
  }
}
```

需要在文件顶部 import `execGit`：
```typescript
import { execGit } from '../git/git-cli.js';
```

### 改动 5：WorkspaceService.merge() — 更新状态逻辑

文件：`packages/server/src/services/workspace.service.ts`，第 185-225 行

```typescript
async merge(id: string): Promise<string> {
  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: { task: { include: { project: true } } },
  });

  if (!workspace) {
    throw new NotFoundError('Workspace', id);
  }

  const worktreeManager = new WorktreeManager(workspace.task.project.repoPath);
  const { sha } = await worktreeManager.merge(
    workspace.worktreePath,
    workspace.task.project.mainBranch
  );

  // 更新 workspace：标记 MERGED，清空 worktreePath（物理目录已删除）
  await prisma.workspace.update({
    where: { id },
    data: { status: WorkspaceStatus.MERGED, worktreePath: '' },
  });

  // Task 推进到 DONE（参考 vibe-kanban: merge 后直接 Done）
  const advanceableStatuses = [TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW];
  if (advanceableStatuses.includes(workspace.task.status as TaskStatus)) {
    await prisma.task.update({
      where: { id: workspace.task.id },
      data: { status: TaskStatus.DONE },
    });
    this.eventBus.emit('task:updated', {
      taskId: workspace.task.id,
      projectId: workspace.task.projectId,
      status: TaskStatus.DONE,
    });
  }

  return sha;
}
```

### 改动 6：WorkspaceService.create() — 支持复用已合并的 branch

文件：`packages/server/src/services/workspace.service.ts`，第 49-106 行

在现有 `create()` 方法开头，查询是否有可复用的 MERGED workspace：

```typescript
async create(taskId: string, branchName?: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true },
  });

  if (!task) {
    throw new NotFoundError('Task', taskId);
  }

  const worktreeManager = new WorktreeManager(task.project.repoPath);

  // ★ 新增：查找可复用的 MERGED workspace
  if (!branchName) {
    const mergedWorkspace = await prisma.workspace.findFirst({
      where: { taskId, status: WorkspaceStatus.MERGED },
      orderBy: { updatedAt: 'desc' },
    });

    if (mergedWorkspace) {
      // 从保留的 branch 重建 worktree
      const worktreePath = await worktreeManager.ensureWorktreeExists(mergedWorkspace.branchName);

      // 恢复 workspace 为 ACTIVE
      const updated = await prisma.workspace.update({
        where: { id: mergedWorkspace.id },
        data: {
          status: WorkspaceStatus.ACTIVE,
          worktreePath,
        },
        include: { sessions: true, task: { include: { project: true } } },
      });

      // Task 状态回退到 IN_PROGRESS（如果需要）
      if (task.status !== TaskStatus.IN_PROGRESS && task.status !== TaskStatus.TODO) {
        await prisma.task.update({
          where: { id: taskId },
          data: { status: TaskStatus.IN_PROGRESS },
        });
        this.eventBus.emit('task:updated', {
          taskId,
          projectId: task.projectId,
          status: TaskStatus.IN_PROGRESS,
        });
      }

      return updated;
    }
  }

  // ── 以下为现有的新建逻辑（不变）──
  const workspace = await prisma.workspace.create({ ... });
  // ...
}
```

### 改动 7：WorkspaceService.cleanup() — 最终清理时删除 branch

文件：`packages/server/src/services/workspace.service.ts`，第 276-302 行

```typescript
async cleanup(): Promise<number> {
  const workspaces = await prisma.workspace.findMany({
    where: {
      status: { in: [WorkspaceStatus.ABANDONED, WorkspaceStatus.MERGED] },
      task: { status: TaskStatus.DONE },
    },
    include: { task: { include: { project: true } } },
  });

  let cleaned = 0;

  for (const workspace of workspaces) {
    try {
      const worktreeManager = new WorktreeManager(workspace.task.project.repoPath);

      // 清理残留 worktree（如果还存在）
      if (workspace.worktreePath) {
        await worktreeManager.remove(workspace.worktreePath);
      }

      // ★ 新增：Task 已 DONE，branch 不再需要，删除
      if (workspace.branchName) {
        try {
          await execGit(workspace.task.project.repoPath, ['branch', '-D', workspace.branchName]);
        } catch {
          // branch 可能已不存在，忽略
        }
      }
    } catch (err) {
      console.warn(
        `[WorkspaceService] cleanup: failed for workspace ${workspace.id}: ${err instanceof Error ? err.message : err}`
      );
    }

    // 删除 DB 记录
    await prisma.workspace.delete({ where: { id: workspace.id } });
    cleaned++;
  }

  return cleaned;
}
```

### 改动 8：前端适配（最小改动）

前端当前的逻辑已经基本兼容：
- `TaskDetail.tsx` 第 146 行 `ws.status !== 'ACTIVE'` 会跳过 MERGED workspace
- `TaskDetail.tsx` 第 171 行 `ws.status === 'ACTIVE' && ws.worktreePath` 会跳过空 worktreePath
- `StartAgentDialog.tsx` 无条件调用 `POST /tasks/:taskId/workspaces`，后端自动处理复用

无需前端改动。后端的复用逻辑对前端完全透明。

---

## 执行顺序

```
1. 改动 1 (Schema)
   │  生成 migration
   ▼
2. 改动 2 (WorktreeManager.merge — update-ref + 保留 branch)
   │
   ▼
3. 改动 3 (WorktreeManager.ensureWorktreeExists — 重建能力)
   │
   ▼
4. 改动 4 (SessionManager auto-commit — 兜底提交) ★ 关键
   │
   ▼
5. 改动 5 (WorkspaceService.merge — 状态更新)
   │
   ▼
6. 改动 6 (WorkspaceService.create — 复用 MERGED workspace)
   │
   ▼
7. 改动 7 (WorkspaceService.cleanup — 最终清理删 branch)
   │
   ▼
8. 改动 8 (前端验证 — 预计无需改动)
```

每步完成后应能独立编译通过。改动 4（auto-commit）是独立的，可以与改动 2/3 并行开发。

---

## 验证场景

1. **正常流程**：创建任务 → 启动 Agent → Agent 工作并提交 → merge → 验证 branch 保留 + worktree 删除
2. **auto-commit**：创建任务 → 启动 Agent → Agent 工作但不提交 → 停止 Agent → 验证自动提交
3. **继续工作**：完成场景 1 后 → 再次启动 Agent → 验证复用已有 branch + worktree 重建
4. **cleanup**：完成场景 1 后 → Task 标记 DONE → 调用 cleanup → 验证 branch 删除 + DB 记录清理
