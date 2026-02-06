/**
 * Task 相关类型定义
 * 临时本地类型，后续迁移到 @agent-tower/shared
 */

export enum TaskStatus {
  Review = 'Review',
  Running = 'Running',
  Pending = 'Pending',
  Done = 'Done',
}

export interface Project {
  id: string
  name: string
  color: string // Tailwind text color class, e.g., 'text-blue-600'
}

export interface Task {
  id: string
  projectId: string
  title: string
  status: TaskStatus
  agent: string
  branch: string
  description: string
}
