/**
 * useTokenUsage Hook 测试
 * 取最新一条 token_usage_info 的逻辑
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type { LogEntry } from '@agent-tower/shared/log-adapter'
import { LogType } from '@agent-tower/shared/log-adapter'

// 直接测试取最新值逻辑（不依赖 React hooks）
function getLatestTokenUsage(logs: LogEntry[]) {
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i]
    if (log.tokenUsage && typeof log.tokenUsage.totalTokens === 'number') {
      return {
        totalTokens: log.tokenUsage.totalTokens,
        modelContextWindow: log.tokenUsage.modelContextWindow,
      }
    }
  }
  return null
}

function makeTokenLog(totalTokens: number, modelContextWindow?: number): LogEntry {
  return {
    id: crypto.randomUUID(),
    type: LogType.Info,
    content: '',
    tokenUsage: { totalTokens, modelContextWindow },
  }
}

describe('useTokenUsage: 取最新一条 token_usage_info', () => {
  it('should return the last token_usage_info entry', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(), { minLength: 1, maxLength: 20 }),
        (totals) => {
          const logs = totals.map((t) => makeTokenLog(t))
          const result = getLatestTokenUsage(logs)

          expect(result).not.toBeNull()
          expect(result!.totalTokens).toBe(totals[totals.length - 1])
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return modelContextWindow from the latest entry', () => {
    const logs = [
      makeTokenLog(100, 200000),
      makeTokenLog(200, 1000000),
    ]
    const result = getLatestTokenUsage(logs)
    expect(result!.totalTokens).toBe(200)
    expect(result!.modelContextWindow).toBe(1000000)
  })

  it('should return null when no token usage entries exist', () => {
    const logs: LogEntry[] = [
      { id: '1', type: LogType.Info, content: 'hello' },
      { id: '2', type: LogType.Assistant, content: 'world' },
    ]
    expect(getLatestTokenUsage(logs)).toBeNull()
  })

  it('should return null for empty array', () => {
    expect(getLatestTokenUsage([])).toBeNull()
  })

  it('should skip entries without valid totalTokens', () => {
    const logs: LogEntry[] = [
      makeTokenLog(500, 200000),
      { id: 'bad', type: LogType.Info, content: '', tokenUsage: undefined },
    ]
    const result = getLatestTokenUsage(logs)
    expect(result!.totalTokens).toBe(500)
  })
})
