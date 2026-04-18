import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface RemoteClashStatus {
  installed: boolean
  running: boolean
  version?: string
  mixedPort?: number
  tunEnabled?: boolean
}

export interface RemoteClashSubscriptions {
  use: number
  profiles: Array<{ id: number; url: string }>
}

export interface RemoteClashTestResult {
  success: boolean
  ip?: string
  country?: string
  error?: string
}

const KEYS = {
  status: (id: string) => ['remote-clash', id, 'status'] as const,
  subscriptions: (id: string) => ['remote-clash', id, 'subscriptions'] as const,
}

export function useRemoteClashStatus(serverId: string) {
  return useQuery({
    queryKey: KEYS.status(serverId),
    queryFn: () => apiClient.get<RemoteClashStatus>(`/remote-servers/${serverId}/clash/status`),
    refetchInterval: 8000,
    enabled: !!serverId,
  })
}

export function useRemoteClashSubscriptions(serverId: string) {
  return useQuery({
    queryKey: KEYS.subscriptions(serverId),
    queryFn: () => apiClient.get<RemoteClashSubscriptions>(`/remote-servers/${serverId}/clash/subscriptions`),
    enabled: !!serverId,
  })
}

export function useRemoteClashInstall(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (subscriptionUrl?: string) =>
      apiClient.post<{ success: boolean; message: string }>(`/remote-servers/${serverId}/clash/install`, { subscriptionUrl }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.status(serverId) }) },
  })
}

export function useRemoteClashFullSetup(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (subscriptionUrl: string) =>
      apiClient.post<{ success: boolean; message: string }>(`/remote-servers/${serverId}/clash/full-setup`, { subscriptionUrl }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.status(serverId) })
      qc.invalidateQueries({ queryKey: KEYS.subscriptions(serverId) })
    },
  })
}

export function useRemoteClashStart(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post(`/remote-servers/${serverId}/clash/start`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.status(serverId) }) },
  })
}

export function useRemoteClashStop(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post(`/remote-servers/${serverId}/clash/stop`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.status(serverId) }) },
  })
}

export function useRemoteClashRestart(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post(`/remote-servers/${serverId}/clash/restart`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.status(serverId) }) },
  })
}

export function useRemoteClashAddSubscription(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (url: string) =>
      apiClient.post(`/remote-servers/${serverId}/clash/subscriptions`, { url }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.subscriptions(serverId) }) },
  })
}

export function useRemoteClashUseSubscription(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      apiClient.post(`/remote-servers/${serverId}/clash/subscriptions/${id}/use`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.status(serverId) })
      qc.invalidateQueries({ queryKey: KEYS.subscriptions(serverId) })
    },
  })
}

export function useRemoteClashSetTun(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) =>
      apiClient.post(`/remote-servers/${serverId}/clash/tun`, { enabled }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.status(serverId) }) },
  })
}

export function useRemoteClashTest(serverId: string) {
  return useMutation({
    mutationFn: () =>
      apiClient.post<RemoteClashTestResult>(`/remote-servers/${serverId}/clash/test`),
  })
}
