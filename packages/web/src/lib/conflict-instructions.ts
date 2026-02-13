import { ConflictOp } from '@agent-tower/shared'

/**
 * 根据冲突上下文生成结构化的 AI Agent 冲突解决指令
 */
export function buildResolveConflictsInstructions(
  sourceBranch: string,
  targetBranch: string,
  conflictedFiles: string[],
  conflictOp: ConflictOp
): string {
  const fileList = conflictedFiles.map((f) => `- ${f}`).join('\n')

  if (conflictOp === ConflictOp.REBASE) {
    return [
      `## Rebase 冲突解决`,
      ``,
      `在将分支 \`${sourceBranch}\` rebase 到 \`${targetBranch}\` 时发生了冲突。`,
      ``,
      `### 冲突文件`,
      fileList,
      ``,
      `### 解决步骤`,
      `1. 打开上述冲突文件，解决所有冲突标记（\`<<<<<<<\`、\`=======\`、\`>>>>>>>\`）`,
      `2. 对每个已解决的文件执行 \`git add <file>\``,
      `3. 执行 \`git rebase --continue\` 继续 rebase 流程`,
    ].join('\n')
  }

  return [
    `## Merge 冲突解决`,
    ``,
    `在将分支 \`${sourceBranch}\` 合并到 \`${targetBranch}\` 时发生了冲突。`,
    ``,
    `### 冲突文件`,
    fileList,
    ``,
    `### 解决步骤`,
    `1. 打开上述冲突文件，解决所有冲突标记（\`<<<<<<<\`、\`=======\`、\`>>>>>>>\`）`,
    `2. 对每个已解决的文件执行 \`git add <file>\``,
    `3. 执行 \`git commit\` 完成合并`,
  ].join('\n')
}
