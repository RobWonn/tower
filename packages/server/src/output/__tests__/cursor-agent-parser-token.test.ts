/**
 * CursorAgentParser Token 提取测试
 * Property 2: Cursor Agent Token 提取正确性
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { MsgStore } from '../msg-store.js'
import { CursorAgentParser } from '../cursor-agent-parser.js'

function feedLine(parser: CursorAgentParser, obj: Record<string, unknown>) {
  parser.processData(JSON.stringify(obj) + '\n')
}

function getTokenEntries(store: MsgStore) {
  const snap = store.getSnapshot()
  return snap.entries.filter((e) => e.entryType === 'token_usage_info')
}

describe('Feature: token-usage-display, Property 2: Cursor Agent Token 提取正确性', () => {
  it('should compute totalTokens as sum of all usage fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          input_tokens: fc.nat(),
          output_tokens: fc.nat(),
          cache_creation_input_tokens: fc.nat(),
          cache_read_input_tokens: fc.nat(),
        }),
        (usage) => {
          const store = new MsgStore()
          const parser = new CursorAgentParser(store)

          feedLine(parser, {
            type: 'result',
            result: { usage },
          })

          const entries = getTokenEntries(store)
          expect(entries).toHaveLength(1)

          const tu = entries[0].metadata!.tokenUsage!
          const expectedTotal =
            usage.input_tokens +
            usage.output_tokens +
            usage.cache_creation_input_tokens +
            usage.cache_read_input_tokens
          expect(tu.totalTokens).toBe(expectedTotal)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should support camelCase token field names (inputTokens/outputTokens)', () => {
    const store = new MsgStore()
    const parser = new CursorAgentParser(store)

    feedLine(parser, {
      type: 'result',
      result: {
        usage: {
          inputTokens: 500,
          outputTokens: 200,
        },
      },
    })

    const entries = getTokenEntries(store)
    expect(entries).toHaveLength(1)
    const tu = entries[0].metadata!.tokenUsage!
    expect(tu.totalTokens).toBe(700)
  })
})

describe('CursorAgentParser Token 边界用例', () => {
  it('should not generate token_usage_info when result has no usage data (Req 2.2)', () => {
    const store = new MsgStore()
    const parser = new CursorAgentParser(store)

    feedLine(parser, {
      type: 'result',
      result: { duration_ms: 1234 },
    })

    const entries = getTokenEntries(store)
    expect(entries).toHaveLength(0)
  })

  it('should not generate token_usage_info when result is null', () => {
    const store = new MsgStore()
    const parser = new CursorAgentParser(store)

    feedLine(parser, {
      type: 'result',
      result: null,
    })

    const entries = getTokenEntries(store)
    expect(entries).toHaveLength(0)
  })

  it('should not throw on malformed result', () => {
    const store = new MsgStore()
    const parser = new CursorAgentParser(store)

    // Should not throw
    feedLine(parser, {
      type: 'result',
      result: 'not an object',
    })

    feedLine(parser, {
      type: 'result',
      result: { usage: 'not an object' },
    })

    const entries = getTokenEntries(store)
    expect(entries).toHaveLength(0)
  })
})
