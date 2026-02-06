import { memo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { IconReview, IconRunning, IconPending, IconDone } from '../agent/Icons'
import type { Task, Project } from './types'
import { TaskStatus } from './types'

interface TaskGroupProps {
  title: string
  tasks: Task[]
  status: TaskStatus
  defaultOpen: boolean
  selectedTaskId: string | null
  onSelectTask: (id: string) => void
  projects: Project[]
}

/** 状态图标映射 */
const StatusIcon = ({ status, isSelected }: { status: TaskStatus; isSelected?: boolean }) => {
  switch (status) {
    case TaskStatus.Review:
      return <IconReview className={isSelected ? 'text-amber-600' : 'text-neutral-500'} />
    case TaskStatus.Running:
      return <IconRunning className="animate-pulse" />
    case TaskStatus.Pending:
      return <IconPending />
    case TaskStatus.Done:
      return <IconDone className="text-neutral-400" />
  }
}

/** 空状态 placeholder - 静态 JSX 提升到组件外 */
const EmptyPlaceholder = null

export const TaskGroup = memo(function TaskGroup({
  title,
  tasks,
  status,
  defaultOpen,
  selectedTaskId,
  onSelectTask,
  projects,
}: TaskGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  if (tasks.length === 0) return EmptyPlaceholder

  const isReview = status === TaskStatus.Review

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="flex items-center w-full px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 transition-colors"
      >
        <span className="mr-2 text-neutral-400">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="flex-1 text-left">{title}</span>
        {isReview ? (
          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full animate-hop">
            {tasks.length}
          </span>
        ) : (
          <span className="text-xs text-neutral-400 font-normal">({tasks.length})</span>
        )}
      </button>

      {isOpen ? (
        <div className="flex flex-col mt-1">
          {tasks.map(task => {
            const project = projects.find(p => p.id === task.projectId)
            const isSelected = selectedTaskId === task.id

            return (
              <button
                key={task.id}
                onClick={() => onSelectTask(task.id)}
                className={`flex items-start pl-8 pr-4 py-3 text-sm w-full text-left transition-all border-l-2 group
                  ${isSelected
                    ? 'bg-neutral-100 border-neutral-800'
                    : 'border-transparent hover:bg-neutral-50 hover:border-neutral-200'
                  }`}
              >
                <div className={`mt-0.5 mr-3 flex-shrink-0 ${status === TaskStatus.Running ? 'text-blue-600' : 'text-neutral-500'}`}>
                  <StatusIcon status={status} isSelected={isSelected} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="mb-0.5">
                    <span className={`font-medium mr-1 ${project?.color ?? 'text-neutral-500'}`}>
                      {project?.name}
                    </span>
                    <span className="text-neutral-400">/</span>
                    <span className={`ml-1 ${isSelected ? 'text-neutral-900' : 'text-neutral-700'}`}>
                      {task.title}
                    </span>
                  </div>
                  <p className={`text-xs line-clamp-2 leading-relaxed ${isSelected ? 'text-neutral-500' : 'text-neutral-400 group-hover:text-neutral-500'}`}>
                    {task.description}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
})
