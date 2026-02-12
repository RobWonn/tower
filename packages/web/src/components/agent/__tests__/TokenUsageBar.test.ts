/**
 * TokenUsageBar 组件测试
 * formatNumber 函数正确性
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { formatNumber } from '../TokenUsageBar.js'

describe('Feature: token-usage-display, formatNumber 正确性', () => {
  it('formatNumber should produce correct K/M formatting for any non-negative integer', () => {
    fc.assert(
      fc.property(fc.nat(), (n) => {
        const result = formatNumber(n)
        expect(typeof result).toBe('string')
        expect(result.length).toBeGreaterThan(0)

        if (n >= 1_000_000) {
          expect(result).toMatch(/^\d+\.\dM$/)
        } else if (n >= 1_000) {
          expect(result).toMatch(/^\d+\.\dK$/)
        } else {
          expect(result).toBe(n.toString())
        }
      }),
      { numRuns: 100 }
    )
  })
})

describe('TokenUsageBar 边界用例', () => {
  it('formatNumber: specific K/M values', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(999)).toBe('999')
    expect(formatNumber(1000)).toBe('1.0K')
    expect(formatNumber(1500)).toBe('1.5K')
    expect(formatNumber(999999)).toBe('1000.0K')
    expect(formatNumber(1000000)).toBe('1.0M')
    expect(formatNumber(2500000)).toBe('2.5M')
  })
})
