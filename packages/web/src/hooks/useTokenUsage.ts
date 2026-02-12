import { useMemo } from 'react'
import type { LogEntry } from '@agent-tower/shared/log-adapter'

export interface TokenUsageInfo {
  totalTokens: number
  modelContextWindow?: number
}

/**
 * 从 logs 中取最新一条 token_usage_info，
 * Agent 每次 result 输出的 totalTokens 已经是累计值。
 * 当 logs 中没有 token 数据时，回退到持久化的 initialUsage。
 */
export function useTokenUsage(logs: LogEntry[], initialUsage?: TokenUsageInfo | null): TokenUsageInfo | null {
  return useMemo(() => {
    // findLast: 取最新的一条（忽略 totalTokens 为 0 的无效条目）
    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i]
      if (log.tokenUsage && typeof log.tokenUsage.totalTokens === 'number' && log.tokenUsage.totalTokens > 0) {
        return {
          totalTokens: log.tokenUsage.totalTokens,
          modelContextWindow: log.tokenUsage.modelContextWindow,
        }
      }
    }
    return initialUsage ?? null
  }, [logs, initialUsage])
}
