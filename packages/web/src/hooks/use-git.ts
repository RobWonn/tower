import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { queryKeys } from './query-keys'

export type GitChangeEntry = {
  status: string
  path: string
}

export type GitChangesResponse = {
  uncommitted: GitChangeEntry[]
  committed: GitChangeEntry[]
}

export type GitDiffResponse = {
  diff: string
}

export function useGitChanges(workingDir: string | undefined) {
  return useQuery({
    queryKey: queryKeys.git.changes(workingDir || ''),
    queryFn: () =>
      apiClient.get<GitChangesResponse>('/git/changes', {
        params: { workingDir: workingDir || '' },
      }),
    enabled: !!workingDir,
  })
}

export function useGitDiff(
  workingDir: string | undefined,
  filePath: string | null,
  type: 'uncommitted' | 'committed'
) {
  return useQuery({
    queryKey: queryKeys.git.diff(workingDir || '', filePath || '', type),
    queryFn: () =>
      apiClient.get<GitDiffResponse>('/git/diff', {
        params: {
          workingDir: workingDir || '',
          path: filePath || '',
          type,
        },
      }),
    enabled: !!workingDir && !!filePath,
  })
}
