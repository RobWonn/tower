import { useState, memo } from 'react'
import { ChevronDown, ChevronRight, Plus, Layers, Check, Settings } from 'lucide-react'
import { IconReview, IconRunning, IconPending, IconDone } from '@/components/agent/Icons'
import type { UITask, UIProject } from '@/components/task/types'
import { UITaskStatus } from '@/components/task/types'

interface MobileTaskListProps {
  tasks: UITask[]
  projects: UIProject[]
  filterProjectId: string | null
  setFilterProjectId: (id: string | null) => void
  onSelectTask: (id: string) => void
  onCreateProject: () => void
  onCreateTask: () => void
  activeTaskIds?: Set<string>
}

// ============ Task Group Config ============

const TASK_GROUP_CONFIG = [
  { status: UITaskStatus.Review, title: 'Review', defaultOpen: true },
  { status: UITaskStatus.Running, title: 'Running', defaultOpen: true },
  { status: UITaskStatus.Pending, title: 'Pending', defaultOpen: true },
  { status: UITaskStatus.Done, title: 'Done', defaultOpen: false },
] as const

function groupTasksByStatus(tasks: UITask[]) {
  const groups: Record<UITaskStatus, UITask[]> = {
    [UITaskStatus.Review]: [],
    [UITaskStatus.Running]: [],
    [UITaskStatus.Pending]: [],
    [UITaskStatus.Done]: [],
  }
  for (const task of tasks) {
    groups[task.status].push(task)
  }
  return groups
}

// ============ Status Icon ============

function StatusIcon({ status, isSelected }: { status: UITaskStatus; isSelected?: boolean }) {
  switch (status) {
    case UITaskStatus.Review:
      return <IconReview className={isSelected ? 'text-amber-600' : 'text-amber-500'} />
    case UITaskStatus.Running:
      return <IconRunning className="text-blue-600 animate-pulse" />
    case UITaskStatus.Pending:
      return <IconPending className="text-neutral-400" />
    case UITaskStatus.Done:
      return <IconDone className="text-emerald-500" />
  }
}

// ============ Mobile Task Card ============

const MobileTaskCard = memo(function MobileTaskCard({
  task,
  project,
  status,
  isActive,
  onSelect,
}: {
  task: UITask
  project?: UIProject
  status: UITaskStatus
  isActive: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className="flex items-start gap-3 w-full px-4 py-3.5 text-left active:bg-neutral-100 transition-colors"
      style={{ minHeight: 56 }}
    >
      <div className="mt-0.5 shrink-0">
        <StatusIcon status={status} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {project && (
            <>
              <span className={`text-xs font-medium ${project.color}`}>{project.name}</span>
              <span className="text-neutral-300 text-xs">/</span>
            </>
          )}
          <span className="text-sm font-medium text-neutral-900 truncate">{task.title}</span>
          {isActive && (
            <span className="relative inline-flex h-2 w-2 ml-1 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          )}
        </div>
        {task.description && (
          <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">{task.description}</p>
        )}
      </div>
      <ChevronRight size={16} className="text-neutral-300 mt-1 shrink-0" />
    </button>
  )
})

// ============ Mobile Task Group ============

function MobileTaskGroup({
  title,
  tasks,
  status,
  defaultOpen,
  projects,
  activeTaskIds,
  onSelectTask,
}: {
  title: string
  tasks: UITask[]
  status: UITaskStatus
  defaultOpen: boolean
  projects: UIProject[]
  activeTaskIds?: Set<string>
  onSelectTask: (id: string) => void
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  if (tasks.length === 0) return null

  const isReview = status === UITaskStatus.Review

  return (
    <div className="mb-1">
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="flex items-center w-full px-4 py-2.5 text-sm font-medium text-neutral-600 active:bg-neutral-50"
      >
        <span className="mr-2 text-neutral-400">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="flex-1 text-left">{title}</span>
        {isReview ? (
          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">
            {tasks.length}
          </span>
        ) : (
          <span className="text-xs text-neutral-400">({tasks.length})</span>
        )}
      </button>

      {isOpen && (
        <div className="divide-y divide-neutral-50">
          {tasks.map(task => {
            const project = projects.find(p => p.id === task.projectId)
            return (
              <MobileTaskCard
                key={task.id}
                task={task}
                project={project}
                status={status}
                isActive={activeTaskIds?.has(task.id) ?? false}
                onSelect={() => onSelectTask(task.id)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============ Bottom Sheet ============

function ProjectBottomSheet({
  isOpen,
  onClose,
  projects,
  filterProjectId,
  setFilterProjectId,
  onCreateProject,
}: {
  isOpen: boolean
  onClose: () => void
  projects: UIProject[]
  filterProjectId: string | null
  setFilterProjectId: (id: string | null) => void
  onCreateProject: () => void
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative bg-white rounded-t-2xl pb-safe animate-in slide-in-from-bottom duration-200">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-neutral-300" />
        </div>

        <div className="px-4 pb-2">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
            Select Project
          </h3>

          {/* All Projects */}
          <button
            onClick={() => { setFilterProjectId(null); onClose() }}
            className="w-full flex items-center justify-between px-3 py-3 rounded-lg active:bg-neutral-50"
          >
            <div className="flex items-center gap-3">
              <Layers size={16} className="text-neutral-500" />
              <span className={filterProjectId === null ? 'text-neutral-900 font-medium' : 'text-neutral-600'}>
                All Projects
              </span>
            </div>
            {filterProjectId === null && <Check size={16} className="text-neutral-900" />}
          </button>

          <div className="h-px bg-neutral-100 my-1" />

          {/* Project list */}
          {projects.map(p => {
            const isActive = filterProjectId === p.id
            const bgClass = p.color.replace('text-', 'bg-')
            return (
              <button
                key={p.id}
                onClick={() => { setFilterProjectId(p.id); onClose() }}
                className="w-full flex items-center justify-between px-3 py-3 rounded-lg active:bg-neutral-50"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${bgClass}`} />
                  <span className={isActive ? 'text-neutral-900 font-medium' : 'text-neutral-600'}>
                    {p.name}
                  </span>
                </div>
                {isActive && <Check size={16} className="text-neutral-900" />}
              </button>
            )
          })}

          <div className="h-px bg-neutral-100 my-1" />

          <button
            onClick={() => { onClose(); onCreateProject() }}
            className="w-full flex items-center gap-3 px-3 py-3 text-neutral-500 active:bg-neutral-50 rounded-lg"
          >
            <Plus size={16} />
            <span>Create New Project</span>
          </button>
        </div>

        {/* Safe area padding for home indicator */}
        <div className="h-6" />
      </div>
    </div>
  )
}

// ============ Main Component ============

export function MobileTaskList({
  tasks,
  projects,
  filterProjectId,
  setFilterProjectId,
  onSelectTask,
  onCreateProject,
  onCreateTask,
  activeTaskIds,
}: MobileTaskListProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  const filteredTasks = filterProjectId
    ? tasks.filter(t => t.projectId === filterProjectId)
    : tasks

  const currentProject = filterProjectId
    ? projects.find(p => p.id === filterProjectId) ?? null
    : null

  const grouped = groupTasksByStatus(filteredTasks)

  return (
    <div className="flex flex-col h-dvh bg-neutral-50 overflow-hidden">
      {/* Header */}
      <header className="h-12 bg-white border-b border-neutral-200 flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-neutral-900">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor" />
            <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-bold text-neutral-900 text-base">Agent Tower</span>
        </div>
        <a href="/settings" className="p-2 text-neutral-400 active:text-neutral-900 rounded-md">
          <Settings size={18} />
        </a>
      </header>

      {/* Project Filter Bar */}
      <div className="h-12 flex items-center justify-between px-4 bg-white border-b border-neutral-100 shrink-0">
        <button
          onClick={() => setIsSheetOpen(true)}
          className="flex items-center gap-2 py-1.5 text-sm font-semibold text-neutral-900 active:opacity-70"
        >
          {currentProject ? (
            <>
              <span className={`w-2 h-2 rounded-full ${currentProject.color.replace('text-', 'bg-')}`} />
              <span className="truncate max-w-[200px]">{currentProject.name}</span>
            </>
          ) : (
            <>
              <Layers size={16} className="text-neutral-500" />
              <span>All Projects</span>
            </>
          )}
          <ChevronDown size={14} className="text-neutral-400" />
        </button>

        <button
          onClick={onCreateTask}
          className="p-2 text-neutral-400 active:text-neutral-900 rounded-md"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Task Groups */}
      <div className="flex-1 overflow-y-auto">
        {TASK_GROUP_CONFIG.map(({ status, title, defaultOpen }) => (
          <MobileTaskGroup
            key={status}
            title={title}
            tasks={grouped[status]}
            status={status}
            defaultOpen={defaultOpen}
            projects={projects}
            activeTaskIds={activeTaskIds}
            onSelectTask={onSelectTask}
          />
        ))}

        {filteredTasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
            <p className="text-sm">No tasks yet</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-neutral-100 bg-white text-xs text-neutral-400 shrink-0">
        {filteredTasks.length} tasks
      </div>

      {/* Bottom Sheet */}
      <ProjectBottomSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        projects={projects}
        filterProjectId={filterProjectId}
        setFilterProjectId={setFilterProjectId}
        onCreateProject={onCreateProject}
      />
    </div>
  )
}
