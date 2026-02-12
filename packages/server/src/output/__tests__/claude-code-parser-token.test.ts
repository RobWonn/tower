/**
 * ClaudeCodeParser Token 提取测试
 * Property 1: Claude Code Token 提取正确性
 * Property 7: Parser 错误容错
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { MsgStore } from '../msg-store.js'
import { ClaudeCodeParser } from '../claude-code-parser.js'

function feedLine(parser: ClaudeCodeParser, obj: Record<string, unknown>) {
  parser.processData(JSON.stringify(obj) + '\n')
}

function getTokenEntries(store: MsgStore) {
  const snap = store.getSnapshot()
  return snap.entries.filter((e) => e.entryType === 'token_usage_info')
}

describe('Feature: token-usage-display, Property 1: Claude Code Token 提取正确性', () => {
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
          const parser = new ClaudeCodeParser(store)

          feedLine(parser, {
            type: 'result',
            subtype: 'success',
            usage,
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

  it('should extract model_context_window from model_usage', () => {
    const store = new MsgStore()
    const parser = new ClaudeCodeParser(store)

    feedLine(parser, {
      type: 'result',
      subtype: 'success',
      usage: { input_tokens: 100, output_tokens: 50 },
      model_usage: {
        'claude-sonnet-4-20250514': { context_window: 200000 },
      },
    })

    const entries = getTokenEntries(store)
    expect(entries).toHaveLength(1)
    const tu = entries[0].metadata!.tokenUsage!
    expect(tu.totalTokens).toBe(150)
    expect(tu.modelContextWindow).toBe(200000)
  })

  it('should handle partial usage fields (missing fields default to 0)', () => {
    fc.assert(
      fc.property(
        fc.record(
          {
            input_tokens: fc.nat(),
            output_tokens: fc.nat(),
            cache_creation_input_tokens: fc.nat(),
            cache_read_input_tokens: fc.nat(),
          },
          { requiredKeys: [] }
        ),
        (usage) => {
          const store = new MsgStore()
          const parser = new ClaudeCodeParser(store)

          feedLine(parser, {
            type: 'result',
            subtype: 'success',
            usage,
          })

          const entries = getTokenEntries(store)
          expect(entries).toHaveLength(1)

          const tu = entries[0].metadata!.tokenUsage!
          const expectedTotal =
            (usage.input_tokens || 0) +
            (usage.output_tokens || 0) +
            (usage.cache_creation_input_tokens || 0) +
            (usage.cache_read_input_tokens || 0)
          expect(tu.totalTokens).toBe(expectedTotal)
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Feature: token-usage-display, Property 7: Parser 错误容错', () => {
  it('should not throw on malformed usage fields', () => {
    fc.assert(
      fc.property(
        fc.anything(),
        (usage) => {
          const store = new MsgStore()
          const parser = new ClaudeCodeParser(store)

          // Should not throw
          feedLine(parser, {
            type: 'result',
            subtype: 'success',
            usage,
          })

          // Parser should still work after malformed input
          feedLine(parser, {
            type: 'assistant',
            message: {
              id: 'msg-1',
              role: 'assistant',
              content: [{ type: 'text', text: 'hello' }],
            },
          })
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('ClaudeCodeParser Token 边界用例', () => {
  it('should not generate token_usage_info when result has no usage field (Req 1.2)', () => {
    const store = new MsgStore()
    const parser = new ClaudeCodeParser(store)

    feedLine(parser, {
      type: 'result',
      subtype: 'success',
    })

    const entries = getTokenEntries(store)
    expect(entries).toHaveLength(0)
  })

  it('should generate entry when all usage fields are 0', () => {
    const store = new MsgStore()
    const parser = new ClaudeCodeParser(store)

    feedLine(parser, {
      type: 'result',
      subtype: 'success',
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    })

    const entries = getTokenEntries(store)
    expect(entries).toHaveLength(1)
    const tu = entries[0].metadata!.tokenUsage!
    expect(tu.totalTokens).toBe(0)
  })

  it('should leave modelContextWindow undefined when no model_usage', () => {
    const store = new MsgStore()
    const parser = new ClaudeCodeParser(store)

    feedLine(parser, {
      type: 'result',
      subtype: 'success',
      usage: { input_tokens: 100, output_tokens: 50 },
    })

    const entries = getTokenEntries(store)
    expect(entries).toHaveLength(1)
    expect(entries[0].metadata!.tokenUsage!.modelContextWindow).toBeUndefined()
  })

  it('should not extract token usage from tool_result subtype', () => {
    const store = new MsgStore()
    const parser = new ClaudeCodeParser(store)

    feedLine(parser, {
      type: 'result',
      subtype: 'tool_result',
      tool_use_id: 'tool-1',
      usage: { input_tokens: 100, output_tokens: 50 },
    })

    const entries = getTokenEntries(store)
    expect(entries).toHaveLength(0)
  })
})
