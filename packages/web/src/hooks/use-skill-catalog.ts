import { useQuery } from '@tanstack/react-query'
import { AgentType, type SlashCommandCatalogResponse } from '@agent-tower/shared'
import { apiClient } from '@/lib/api-client'
import { queryKeys } from './query-keys'

interface UseSkillCatalogOptions {
  agentType?: AgentType | string | null
  workingDir?: string
}

export function useSkillCatalog({ agentType, workingDir }: UseSkillCatalogOptions) {
  return useQuery({
    queryKey: queryKeys.system.skillCatalog(agentType, workingDir),
    queryFn: async () => {
      const response = await apiClient.get<SlashCommandCatalogResponse>('/system/skill-catalog', {
        params: {
          agentType: String(agentType),
          ...(workingDir ? { workingDir } : {}),
        },
      })
      return response.commands
    },
    enabled: agentType === AgentType.CODEX,
    staleTime: 30_000,
  })
}
