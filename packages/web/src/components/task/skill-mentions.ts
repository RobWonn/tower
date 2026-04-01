import type { SlashCommandOption } from '@agent-tower/shared'

export interface SkillMentionMatch {
  query: string
  replaceStart: number
}

function normalizePromptToken(value: string): string {
  return value.trim().toLowerCase().replace(/^[/$]/, '')
}

function getCommandToken(option: SlashCommandOption): string {
  return normalizePromptToken(option.command)
}

function getMatchScore(option: SlashCommandOption, query: string): number {
  if (!query) return 1_000

  const commandToken = getCommandToken(option)
  const aliases = option.aliases?.map(normalizePromptToken) ?? []
  const searchableTokens = [commandToken, ...aliases]
  let bestScore = 0

  for (const token of searchableTokens) {
    if (token === query) bestScore = Math.max(bestScore, 500)
    else if (token.startsWith(query)) bestScore = Math.max(bestScore, 400 - (token.length - query.length))
    else if (token.includes(query)) bestScore = Math.max(bestScore, 250 - token.indexOf(query))
  }

  if (bestScore > 0) return bestScore

  const searchableText = `${commandToken} ${aliases.join(' ')} ${option.description}`.toLowerCase()
  return searchableText.includes(query) ? 100 : 0
}

export function getSkillMentionMatch(input: string): SkillMentionMatch | null {
  const match = /(^|[\s])\$([^\s]*)$/.exec(input)
  if (!match || match.index === undefined) return null

  const replaceStart = match.index + match[1].length
  return {
    query: normalizePromptToken(match[2]),
    replaceStart,
  }
}

export function filterPromptCommands(commands: SlashCommandOption[], query: string): SlashCommandOption[] {
  const normalizedQuery = normalizePromptToken(query)
  if (!normalizedQuery) return commands.slice()

  return commands
    .map((command, index) => ({
      command,
      index,
      score: getMatchScore(command, normalizedQuery),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index || a.command.command.localeCompare(b.command.command))
    .map((entry) => entry.command)
}
