import { useState } from 'react'
import { GitBranch, GitMerge, AlertTriangle, CheckCircle, ArrowRight, Loader2, FileWarning } from 'lucide-react'
import type { GitOperationStatus } from '@agent-tower/shared'
import { Modal } from '@/components/ui/modal'
import { useRebaseWorkspace, useMergeWorkspace, useGitStatus } from '@/hooks/use-workspaces'

interface GitOperationsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  branchName: string
  targetBranch: string
  onConflict: () => void
}

function StatusChip({ children, variant }: { children: React.ReactNode; variant: 'success' | 'warning' | 'info' | 'neutral' | 'danger' }) {
  const styles = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
    neutral: 'bg-neutral-50 text-neutral-600 border-neutral-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${styles[variant]}`}>
      {children}
    </span>
  )
}

function BranchStatusInfo({ gitStatus, branchName, targetBranch }: {
  gitStatus: GitOperationStatus
  branchName: string
  targetBranch: string
}) {
  return (
    <div className="space-y-4">
      {/* Branch info */}
      <div className="flex items-center gap-2 text-sm">
        <span className="px-2.5 py-1 rounded-md bg-neutral-100 font-mono text-xs text-neutral-700">{branchName}</span>
        <ArrowRight size={14} className="text-neutral-400" />
        <span className="px-2.5 py-1 rounded-md bg-neutral-100 font-mono text-xs text-neutral-700">{targetBranch}</span>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-2">
        {gitStatus.hasUncommittedChanges && (
          <StatusChip variant="danger">
            <FileWarning size={12} />
            {gitStatus.uncommittedCount} 个未提交变更
          </StatusChip>
        )}
        {gitStatus.conflictedFiles.length > 0 && (
          <StatusChip variant="warning">
            <AlertTriangle size={12} />
            {gitStatus.conflictedFiles.length} 个冲突文件
          </StatusChip>
        )}
        {gitStatus.operation === 'rebase' && gitStatus.conflictedFiles.length === 0 && (
          <StatusChip variant="warning">
            <Loader2 size={12} className="animate-spin" />
            变基进行中
          </StatusChip>
        )}
        {gitStatus.operation === 'merge' && gitStatus.conflictedFiles.length === 0 && (
          <StatusChip variant="warning">
            <Loader2 size={12} className="animate-spin" />
            合并进行中
          </StatusChip>
        )}
        {gitStatus.ahead > 0 && (
          <StatusChip variant="success">
            <CheckCircle size={12} />
            领先 {gitStatus.ahead} 个提交
          </StatusChip>
        )}
        {gitStatus.behind > 0 && (
          <StatusChip variant="warning">
            落后 {gitStatus.behind} 个提交
          </StatusChip>
        )}
        {gitStatus.operation === 'idle' && gitStatus.ahead === 0 && gitStatus.behind === 0 && !gitStatus.hasUncommittedChanges && (
          <StatusChip variant="neutral">
            <CheckCircle size={12} />
            已是最新
          </StatusChip>
        )}
      </div>

      {/* Uncommitted changes hint */}
      {gitStatus.hasUncommittedChanges && (
        <div className="px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
          工作区有未提交的变更，请先让 Agent 提交或手动处理后再执行 Rebase / Merge 操作。
        </div>
      )}
    </div>
  )
}

export function GitOperationsDialog({
  open,
  onOpenChange,
  workspaceId,
  branchName,
  targetBranch,
  onConflict,
}: GitOperationsDialogProps) {
  const { data: gitStatus, isLoading } = useGitStatus(workspaceId)
  const rebaseWorkspace = useRebaseWorkspace()
  const mergeWorkspace = useMergeWorkspace()
  const [error, setError] = useState<string | null>(null)

  const hasConflicts = gitStatus ? gitStatus.conflictedFiles.length > 0 : false
  const isOperationInProgress = gitStatus ? gitStatus.operation !== 'idle' : false
  const isDirty = gitStatus?.hasUncommittedChanges ?? false

  const handleRebase = () => {
    setError(null)
    rebaseWorkspace.mutate(workspaceId, {
      onSuccess: () => onOpenChange(false),
      onError: (err: unknown) => {
        const apiErr = err as { status?: number; message?: string }
        if (apiErr.status === 409) {
          onOpenChange(false)
          onConflict()
        } else {
          setError(apiErr.message ?? '变基失败')
        }
      },
    })
  }

  const handleMerge = () => {
    setError(null)
    mergeWorkspace.mutate(workspaceId, {
      onSuccess: () => onOpenChange(false),
      onError: (err: unknown) => {
        const apiErr = err as { status?: number; message?: string }
        if (apiErr.status === 409) {
          onOpenChange(false)
          onConflict()
        } else {
          setError(apiErr.message ?? '合并失败')
        }
      },
    })
  }

  return (
    <Modal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Git 操作"
    >
      {isLoading || !gitStatus ? (
        <div className="flex items-center justify-center py-8 gap-2 text-neutral-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">加载分支状态...</span>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Branch status */}
          <BranchStatusInfo gitStatus={gitStatus} branchName={branchName} targetBranch={targetBranch} />

          {/* Error */}
          {error && (
            <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            <button
              onClick={handleRebase}
              disabled={rebaseWorkspace.isPending || hasConflicts || isOperationInProgress || isDirty}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-8 h-8 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
                <GitBranch size={16} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-neutral-900">
                  {rebaseWorkspace.isPending ? '变基中...' : '变基 (Rebase)'}
                </div>
                <div className="text-xs text-neutral-500">将当前分支变基到最新的 {targetBranch}</div>
              </div>
            </button>

            <button
              onClick={handleMerge}
              disabled={mergeWorkspace.isPending || hasConflicts || isOperationInProgress || isDirty || gitStatus.ahead === 0}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-8 h-8 rounded-md bg-emerald-50 flex items-center justify-center shrink-0">
                <GitMerge size={16} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-neutral-900">
                  {mergeWorkspace.isPending ? '合并中...' : '合并 (Merge)'}
                </div>
                <div className="text-xs text-neutral-500">Squash merge 到 {targetBranch}</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
