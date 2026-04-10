import { useMemo } from 'react'
import { useProjects } from '@/hooks/use-projects'
import { useTaskRealtimeSync } from '@/lib/socket/hooks/useTaskRealtimeSync'

export function GlobalRealtimeSync() {
  const { data: projectsData } = useProjects()
  const projectIds = useMemo(
    () => projectsData?.data.map(p => p.id) ?? [],
    [projectsData],
  )
  useTaskRealtimeSync(projectIds)
  return null
}
