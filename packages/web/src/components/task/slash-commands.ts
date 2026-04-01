import { AgentType, type SlashCommandOption } from '@agent-tower/shared'
import { filterPromptCommands } from './skill-mentions'

const CODEX_COMMANDS: SlashCommandOption[] = [
  { command: '/permissions', description: 'Manage what Codex can do without approval' },
  { command: '/sandbox-add-read-dir', description: 'Grant read access to another directory' },
  { command: '/agent', description: 'Switch between built-in agent personas' },
  { command: '/apps', description: 'Manage connected apps' },
  { command: '/clear', description: 'Start a fresh conversation' },
  { command: '/compact', description: 'Replace chat context with a summary' },
  { command: '/copy', description: 'Copy the last assistant message to your clipboard' },
  { command: '/diff', description: 'Show the current git diff' },
  { command: '/experimental', description: 'Toggle experimental features' },
  { command: '/feedback', description: 'Share feedback on Codex CLI' },
  { command: '/init', description: 'Create or update AGENTS.md for the repo' },
  { command: '/logout', description: 'Sign out of Codex' },
  { command: '/mcp', description: 'Manage MCP servers' },
  { command: '/mention', description: 'Add files or directories to the conversation context' },
  { command: '/model', description: 'Change the active model' },
  { command: '/fast', description: 'Toggle low reasoning mode' },
  { command: '/plan', description: 'Toggle plan mode for code changes' },
  { command: '/personality', description: 'Select how Codex communicates' },
  { command: '/ps', description: 'List running background tasks' },
  { command: '/fork', description: 'Fork the current conversation state' },
  { command: '/resume', description: 'Resume a previous conversation' },
  { command: '/new', description: 'Open a conversation picker to start or resume' },
  { command: '/quit', description: 'Exit Codex CLI', aliases: ['exit'] },
  { command: '/review', description: 'Run a code review' },
  { command: '/status', description: 'Show session and configuration status' },
  { command: '/debug-config', description: 'Inspect the effective configuration' },
  { command: '/statusline', description: 'Configure the custom status line' },
  { command: '/skills', description: 'Browse available skills and insert a $skill mention' },
]

const CLAUDE_CODE_COMMANDS: SlashCommandOption[] = [
  { command: '/clear', description: 'Clear the conversation history' },
  { command: '/compact', description: 'Compact the conversation context', aliases: ['compact focus'] },
  { command: '/config', description: 'Open the configuration panel' },
  { command: '/cost', description: 'Show token usage and cost' },
  { command: '/doctor', description: 'Check Claude Code installation health' },
  { command: '/help', description: 'Show help and available commands' },
  { command: '/init', description: 'Initialize project instructions' },
  { command: '/login', description: 'Sign in to Claude Code' },
  { command: '/logout', description: 'Sign out of Claude Code' },
  { command: '/mcp', description: 'Manage MCP servers' },
  { command: '/memory', description: 'Edit project memory files' },
  { command: '/model', description: 'Change the active model' },
  { command: '/permissions', description: 'Review or update tool permissions' },
  { command: '/pr_comments', description: 'Read pull request review comments' },
  { command: '/review', description: 'Run a code review' },
  { command: '/status', description: 'Show account and system status' },
  { command: '/terminal-setup', description: 'Configure terminal newline shortcuts' },
  { command: '/vim', description: 'Toggle vim mode' },
]

const GEMINI_CLI_COMMANDS: SlashCommandOption[] = [
  { command: '/bug', description: 'File an issue about Gemini CLI' },
  { command: '/chat', description: 'Manage chat checkpoints and exports' },
  { command: '/clear', description: 'Clear the terminal display' },
  { command: '/compress', description: 'Replace chat context with a summary' },
  { command: '/copy', description: 'Copy the last Gemini CLI output' },
  { command: '/directory', description: 'Manage additional workspace directories', aliases: ['dir'] },
  { command: '/editor', description: 'Choose the preferred editor' },
  { command: '/extensions', description: 'List active Gemini CLI extensions' },
  { command: '/help', description: 'Show help and command usage', aliases: ['?'] },
  { command: '/mcp', description: 'Show MCP servers and tools' },
  { command: '/memory', description: 'Manage loaded GEMINI.md memory' },
  { command: '/restore', description: 'Restore files from a tool checkpoint' },
  { command: '/settings', description: 'Open the Gemini CLI settings editor' },
  { command: '/stats', description: 'Show session statistics and token usage' },
  { command: '/theme', description: 'Change the Gemini CLI theme' },
  { command: '/auth', description: 'Change the authentication method' },
  { command: '/about', description: 'Show version information' },
  { command: '/tools', description: 'List currently available tools' },
  { command: '/privacy', description: 'Review privacy and data collection settings' },
  { command: '/quit', description: 'Exit Gemini CLI', aliases: ['exit'] },
  { command: '/vim', description: 'Toggle vim mode' },
  { command: '/init', description: 'Generate a tailored GEMINI.md file' },
]

const CURSOR_AGENT_COMMANDS: SlashCommandOption[] = [
  { command: '/model', description: 'Change the active model' },
  { command: '/plan', description: 'Create or reopen a plan' },
  { command: '/ask', description: 'Toggle ask mode (read-only Q&A)' },
  { command: '/debug', description: 'Toggle debug mode' },
  { command: '/clear', description: 'Start a new chat session', aliases: ['new', 'new-chat', 'newchat'] },
  { command: '/compress', description: 'Summarize the conversation to reduce context' },
  { command: '/vim', description: 'Toggle vim mode' },
  { command: '/shell', description: 'Enter shell mode' },
  { command: '/about', description: 'Show CLI, system, and account information' },
  { command: '/setup-terminal', description: 'Configure terminal newline shortcuts' },
  { command: '/feedback', description: 'Share feedback with the Cursor team' },
  { command: '/open', description: 'Open the repository git root in Cursor' },
  { command: '/cursor', description: 'Alias for /open', aliases: ['open'] },
  { command: '/resume-chat', description: 'Resume a previous chat by folder name', aliases: ['resume'] },
  { command: '/copy-request-id', description: 'Copy the last request ID' },
  { command: '/copy-conversation-id', description: 'Copy the current conversation ID' },
  { command: '/logout', description: 'Sign out from Cursor' },
  { command: '/quit', description: 'Exit Cursor Agent', aliases: ['exit'] },
  { command: '/mcp', description: 'Manage MCP servers' },
]

const SLASH_COMMANDS_BY_AGENT_TYPE: Record<string, SlashCommandOption[]> = {
  [AgentType.CODEX]: CODEX_COMMANDS,
  [AgentType.CLAUDE_CODE]: CLAUDE_CODE_COMMANDS,
  [AgentType.GEMINI_CLI]: GEMINI_CLI_COMMANDS,
  [AgentType.CURSOR_AGENT]: CURSOR_AGENT_COMMANDS,
}

function normalizeSlashToken(value: string): string {
  return value.trim().toLowerCase().replace(/^\//, '')
}

export function getSlashCommandsForAgentType(agentType?: AgentType | string | null): SlashCommandOption[] {
  if (!agentType) return []
  return (SLASH_COMMANDS_BY_AGENT_TYPE[agentType] ?? []).map((command) => ({
    ...command,
    kind: command.kind ?? 'builtin',
  }))
}

export function getSlashCommandQuery(input: string): string | null {
  const match = input.match(/^\s*\/([^\s]*)$/)
  return match ? normalizeSlashToken(match[1]) : null
}

export function filterSlashCommands(commands: SlashCommandOption[], query: string): SlashCommandOption[] {
  return filterPromptCommands(commands, normalizeSlashToken(query))
}
