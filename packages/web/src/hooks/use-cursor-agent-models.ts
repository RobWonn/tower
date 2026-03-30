import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { queryKeys } from './query-keys'

export interface CursorAgentModelOption {
  id: string
  label: string
}

/** 从服务端执行 `cursor-agent --list-models` 获取当前账号可用模型 */
export function useCursorAgentModels() {
  return useQuery({
    queryKey: queryKeys.system.cursorAgentModels,
    queryFn: () =>
      apiClient.get<{ models: CursorAgentModelOption[]; error?: string }>(
        '/system/cursor-agent-models'
      ),
    staleTime: 1000 * 60 * 10,
  })
}
