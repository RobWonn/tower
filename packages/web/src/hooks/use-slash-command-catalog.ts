import { useQuery } from '@tanstack/react-query'
import { type AgentType, type SlashCommandCatalogResponse, type SlashCommandOption } from '@agent-tower/shared'
import { apiClient } from '@/lib/api-client'
import { queryKeys } from './query-keys'

interface UseSlashCommandCatalogOptions {
  agentType?: AgentType | string | null
  workingDir?: string
}

export function useSlashCommandCatalog({ agentType, workingDir }: UseSlashCommandCatalogOptions) {
  return useQuery({
    queryKey: queryKeys.system.slashCommandCatalog(agentType, workingDir),
    queryFn: async () => {
      const response = await apiClient.get<SlashCommandCatalogResponse>('/system/slash-command-catalog', {
        params: {
          agentType: String(agentType),
          ...(workingDir ? { workingDir } : {}),
        },
      })
      return response.commands
    },
    enabled: Boolean(agentType),
    staleTime: 30_000,
  })
}

export function mergeSlashCommandCatalog(
  builtinCommands: SlashCommandOption[],
  discoveredCommands: SlashCommandOption[]
): SlashCommandOption[] {
  const seen = new Set<string>()
  const merged: SlashCommandOption[] = []

  for (const command of [...builtinCommands, ...discoveredCommands]) {
    const key = command.command.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(command.kind ? command : { ...command, kind: 'builtin' })
  }

  return merged
}
