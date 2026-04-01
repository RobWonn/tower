import { describe, expect, it } from 'vitest'
import { AgentType } from '@agent-tower/shared'
import { filterSlashCommands, getSlashCommandQuery, getSlashCommandsForAgentType } from '../slash-commands'

describe('slash command catalog', () => {
  it('returns the Codex built-in commands', () => {
    const commands = getSlashCommandsForAgentType(AgentType.CODEX)
    expect(commands.some((command) => command.command === '/skills')).toBe(true)
    expect(commands.some((command) => command.command === '/mcp')).toBe(true)
  })

  it('returns the Cursor Agent built-in commands', () => {
    const commands = getSlashCommandsForAgentType(AgentType.CURSOR_AGENT)
    expect(commands.some((command) => command.command === '/plan')).toBe(true)
    expect(commands.some((command) => command.command === '/mcp')).toBe(true)
  })
})

describe('slash command query detection', () => {
  it('detects a bare slash', () => {
    expect(getSlashCommandQuery('/')).toBe('')
  })

  it('detects a partial slash command token', () => {
    expect(getSlashCommandQuery('/sta')).toBe('sta')
  })

  it('ignores slash commands after arguments start', () => {
    expect(getSlashCommandQuery('/memory add')).toBeNull()
  })

  it('ignores inline slash text inside a normal sentence', () => {
    expect(getSlashCommandQuery('please run /status')).toBeNull()
  })
})

describe('slash command filtering', () => {
  it('matches Gemini aliases like /dir -> /directory', () => {
    const commands = getSlashCommandsForAgentType(AgentType.GEMINI_CLI)
    const matches = filterSlashCommands(commands, 'dir')
    expect(matches[0]?.command).toBe('/directory')
  })

  it('matches the main command token before description text', () => {
    const commands = getSlashCommandsForAgentType(AgentType.CLAUDE_CODE)
    const matches = filterSlashCommands(commands, 'mem')
    expect(matches[0]?.command).toBe('/memory')
  })
})
