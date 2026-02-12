/**
 * MsgStore Token 往返一致性测试
 * Property 3: Token 用量数据 MsgStore 往返一致性
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { MsgStore } from '../msg-store.js'
import { createTokenUsageInfo } from '../types.js'
import { addNormalizedEntry } from '../utils/patch.js'

describe('Feature: token-usage-display, Property 3: Token 用量数据 MsgStore 往返一致性', () => {
  it('should preserve token_usage_info through MsgStore round-trip', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        fc.option(fc.nat(), { nil: undefined }),
        (totalTokens, modelContextWindow) => {
          const store = new MsgStore()
          const entry = createTokenUsageInfo(totalTokens, modelContextWindow)
          const index = store.entryIndex.next()
          const patch = addNormalizedEntry(index, entry)
          store.pushPatch(patch)

          const snapshot = store.getSnapshot()
          const recovered = snapshot.entries[index]

          expect(recovered.entryType).toBe('token_usage_info')
          expect(recovered.metadata!.tokenUsage!.totalTokens).toBe(totalTokens)
          expect(recovered.metadata!.tokenUsage!.modelContextWindow).toBe(modelContextWindow)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should preserve zero values in tokenUsage (Req 6.2)', () => {
    const store = new MsgStore()
    const entry = createTokenUsageInfo(0, 200000)
    const index = store.entryIndex.next()
    const patch = addNormalizedEntry(index, entry)
    store.pushPatch(patch)

    const snapshot = store.getSnapshot()
    const recovered = snapshot.entries[index]
    const tu = recovered.metadata!.tokenUsage!

    expect(tu.totalTokens).toBe(0)
    expect(tu.modelContextWindow).toBe(200000)
  })
})
