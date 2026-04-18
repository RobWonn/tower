import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { queryKeys } from './query-keys'

export interface RemoteServer {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: string
  privateKeyPath: string | null
  password: string | null
  agentInstalled: boolean
  agentLoggedIn: boolean
  lastCheckedAt: string | null
  createdAt: string
  updatedAt: string
}

interface CreateServerInput {
  name: string
  host: string
  port?: number
  username: string
  authType?: string
  privateKeyPath?: string
  password?: string
}

interface UpdateServerInput {
  id: string
  name?: string
  host?: string
  port?: number
  username?: string
  authType?: string
  privateKeyPath?: string
  password?: string
}

export function useRemoteServers() {
  return useQuery({
    queryKey: queryKeys.remoteServers.list(),
    queryFn: () => apiClient.get<RemoteServer[]>('/remote-servers'),
  })
}

export function useRemoteServer(id: string) {
  return useQuery({
    queryKey: queryKeys.remoteServers.detail(id),
    queryFn: () => apiClient.get<RemoteServer>(`/remote-servers/${id}`),
    enabled: !!id,
  })
}

export function useCreateRemoteServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateServerInput) =>
      apiClient.post<RemoteServer>('/remote-servers', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.remoteServers.all })
    },
  })
}

export function useUpdateRemoteServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateServerInput) =>
      apiClient.put<RemoteServer>(`/remote-servers/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.remoteServers.all })
    },
  })
}

export function useDeleteRemoteServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/remote-servers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.remoteServers.all })
    },
  })
}

export function useTestServerConnection() {
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ success: boolean; error?: string }>(`/remote-servers/${id}/test`),
  })
}

export function useCheckCursorAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ installed: boolean; loggedIn: boolean; version?: string }>(
        `/remote-servers/${id}/check-agent`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.remoteServers.all })
    },
  })
}

export function useInstallCursorAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ success: boolean; output: string }>(
        `/remote-servers/${id}/install-agent`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.remoteServers.all })
    },
  })
}

export function useLoginCursorAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (serverId: string) => {
      const endpoint = serverId === 'local'
        ? '/remote-servers/local/login-agent'
        : `/remote-servers/${serverId}/login-agent`
      return apiClient.post<{ status: string; serverId: string }>(endpoint)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.remoteServers.all })
    },
  })
}
