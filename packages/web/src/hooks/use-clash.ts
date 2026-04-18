import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface ClashStatus {
  installed: boolean
  running: boolean
  version?: string
  mixedPort?: number
  apiPort?: string
}

export interface ClashSubscription {
  id: number
  url: string
  path: string
}

export interface ClashSubscriptions {
  use: number
  profiles: ClashSubscription[]
}

export interface ClashProxyGroup {
  name: string
  type: string
  now: string
  all: string[]
}

export interface ClashProxyNode {
  name: string
  type: string
  alive: boolean
  history: Array<{ delay: number }>
}

export interface ClashTestResult {
  success: boolean
  ip?: string
  country?: string
  city?: string
  error?: string
}

const KEYS = {
  status: ['clash', 'status'] as const,
  subscriptions: ['clash', 'subscriptions'] as const,
  groups: ['clash', 'groups'] as const,
  nodes: ['clash', 'nodes'] as const,
}

export function useClashStatus() {
  return useQuery({
    queryKey: KEYS.status,
    queryFn: () => apiClient.get<ClashStatus>('/clash/status'),
    refetchInterval: 5000,
  })
}

export function useClashSubscriptions() {
  return useQuery({
    queryKey: KEYS.subscriptions,
    queryFn: () => apiClient.get<ClashSubscriptions>('/clash/subscriptions'),
  })
}

export function useClashGroups() {
  return useQuery({
    queryKey: KEYS.groups,
    queryFn: () => apiClient.get<ClashProxyGroup[]>('/clash/groups'),
    refetchInterval: 10000,
  })
}

export function useClashNodes() {
  return useQuery({
    queryKey: KEYS.nodes,
    queryFn: () => apiClient.get<ClashProxyNode[]>('/clash/nodes'),
  })
}

export function useClashStart() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post('/clash/start'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.status }) },
  })
}

export function useClashStop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post('/clash/stop'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.status }) },
  })
}

export function useClashRestart() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post('/clash/restart'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.status })
      qc.invalidateQueries({ queryKey: KEYS.groups })
      qc.invalidateQueries({ queryKey: KEYS.nodes })
    },
  })
}

export function useClashAddSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (url: string) => apiClient.post('/clash/subscriptions', { url }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.subscriptions }) },
  })
}

export function useClashDeleteSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/clash/subscriptions/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.subscriptions }) },
  })
}

export function useClashUseSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient.post(`/clash/subscriptions/${id}/use`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.subscriptions })
      qc.invalidateQueries({ queryKey: KEYS.groups })
      qc.invalidateQueries({ queryKey: KEYS.nodes })
      qc.invalidateQueries({ queryKey: KEYS.status })
    },
  })
}

export function useClashUpdateSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id?: number) => apiClient.post('/clash/subscriptions/update', { id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.subscriptions })
      qc.invalidateQueries({ queryKey: KEYS.groups })
      qc.invalidateQueries({ queryKey: KEYS.nodes })
    },
  })
}

export function useClashSwitchNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { group: string; node: string }) => apiClient.post('/clash/switch', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.groups }) },
  })
}

export function useClashTest() {
  return useMutation({
    mutationFn: () => apiClient.post<ClashTestResult>('/clash/test'),
  })
}
