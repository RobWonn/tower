import { describe, expect, it } from 'vitest'
import { filterPromptCommands, getSkillMentionMatch } from '../skill-mentions'

describe('skill mention query detection', () => {
  it('detects a bare skill mention token', () => {
    expect(getSkillMentionMatch('$')).toEqual({ query: '', replaceStart: 0 })
  })

  it('detects a trailing skill mention after text', () => {
    expect(getSkillMentionMatch('please use $tech')).toEqual({ query: 'tech', replaceStart: 11 })
  })

  it('ignores inline skill syntax when more arguments have been typed after it', () => {
    expect(getSkillMentionMatch('please use $tech lead')).toBeNull()
  })
})

describe('skill mention filtering', () => {
  it('matches skill names without the leading dollar sign', () => {
    const matches = filterPromptCommands([
      { command: '$tech-lead', description: 'Coordinate multiple workers' },
      { command: '$frontend-design', description: 'Design polished frontend UI' },
    ], 'front')

    expect(matches[0]?.command).toBe('$frontend-design')
  })
})
