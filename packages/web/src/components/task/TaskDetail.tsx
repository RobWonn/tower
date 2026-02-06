import { useState, useRef, useCallback } from 'react'
import { type LogEntry, LogType } from '@agent-tower/shared/log-adapter'
import { LogStream } from '@/components/agent'
import { IconRunning, IconReview, IconPending, IconDone } from '@/components/agent'
import { Paperclip, ArrowUp } from 'lucide-react'
import type { UITaskDetailData } from './types'
import { UITaskStatus } from './types'

interface TaskDetailProps {
  task: UITaskDetailData | null
}

// ============ Mock Data ============

const MOCK_LOGS: LogEntry[] = [
  {
    id: 'log-1',
    type: LogType.Action,
    content: 'Analyzing the codebase structure to understand the project layout...',
  },
  {
    id: 'log-2',
    type: LogType.Tool,
    title: 'Read File ✓',
    content: 'packages/web/src/components/agent/LogStream.tsx',
    isCollapsed: true,
  },
  {
    id: 'log-3',
    type: LogType.Info,
    content: 'The LogStream component uses LogEntry from @agent-tower/shared. I will create a TaskDetail wrapper that integrates it.',
  },
  {
    id: 'log-4',
    type: LogType.Tool,
    title: 'Edit File ✓',
    content: 'packages/web/src/components/task/TaskDetail.tsx\n+ Created new TaskDetail component with header, log stream, and input bar.',
    isCollapsed: false,
  },
  {
    id: 'log-5',
    type: LogType.User,
    content: 'Looks good! Can you also add the empty state placeholder?',
  },
  {
    id: 'log-6',
    type: LogType.Action,
    content: 'Adding empty state placeholder when no task is selected.',
  },
]

export const MOCK_TASK: UITaskDetailData = {
  id: 'task-1',
  projectName: 'Agent Tower',
  projectColor: 'text-blue-600',
  title: 'Migrate TaskDetail component to web app',
  status: UITaskStatus.Running,
  branch: 'feat/task-detail',
  description:
    'Migrate the TaskDetail component from the design prototype into the main web application, integrating with the existing LogStream component and shared types.',
  logs: MOCK_LOGS,
}

// ============ Empty State (hoisted JSX) ============

const EMPTY_STATE = (
  <div className="flex-1 flex flex-col items-center justify-center bg-white text-neutral-400 select-none">
    <div className="w-16 h-16 bg-neutral-50 rounded-2xl border border-neutral-100 flex items-center justify-center mb-6">
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-neutral-300"
      >
        <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor" />
        <path
          d="M2 17L12 22L22 17"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2 12L12 17L22 12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
    <h3 className="text-neutral-900 font-medium mb-2 text-lg">Agent Tower</h3>
    <p className="text-sm max-w-sm text-center text-neutral-500 leading-relaxed">
      Select a task from the sidebar to view logs, monitor execution, or interact with an agent.
    </p>
  </div>
)

// ============ Status Badge Helper ============

function StatusBadge({ status }: { status: UITaskStatus }) {
  const config = {
    [UITaskStatus.Running]: {
      className: 'bg-blue-50 text-blue-700 border-blue-100',
      icon: <IconRunning className="w-3 h-3 animate-pulse" />,
    },
    [UITaskStatus.Review]: {
      className: 'bg-amber-50 text-amber-700 border-amber-100',
      icon: <IconReview className="w-3 h-3" />,
    },
    [UITaskStatus.Pending]: {
      className: 'bg-neutral-50 text-neutral-600 border-neutral-100',
      icon: <IconPending className="w-3 h-3" />,
    },
    [UITaskStatus.Done]: {
      className: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      icon: <IconDone className="w-3 h-3" />,
    },
  }

  const { className, icon } = config[status]

  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${className}`}
    >
      {icon}
      <span>{status}</span>
    </div>
  )
}

// ============ TaskDetail Component ============

export function TaskDetail({ task }: TaskDetailProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // textarea auto-resize in onChange handler (not useEffect)
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    const scrollHeight = el.scrollHeight
    el.style.height = `${Math.max(60, Math.min(scrollHeight, 300))}px`
  }, [])

  const handleSend = useCallback(() => {
    if (!input.trim()) return
    // TODO: integrate with actual send logic
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = '60px'
    }
  }, [input])

  // Early return for null task
  if (!task) {
    return EMPTY_STATE
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white relative overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-neutral-100 bg-white/80 backdrop-blur-sm z-20 flex-shrink-0">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-xs font-semibold uppercase tracking-wider ${task.projectColor}`}>
              {task.projectName}
            </span>
            <span className="text-neutral-300 text-xs">/</span>
            <span className="text-xs text-neutral-500 font-mono">{task.branch}</span>
          </div>
          <h2 className="text-lg font-bold text-neutral-900">{task.title}</h2>
        </div>

        <StatusBadge status={task.status} />
      </div>

      {/* Scrollable Logs */}
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-4">
        <div className="w-full">
          {/* Task Description */}
          <div className="mb-8 pb-8 border-b border-neutral-100">
            <p className="text-sm text-neutral-500 leading-relaxed">{task.description}</p>
          </div>

          <LogStream logs={task.logs} />
          <div ref={bottomRef} className="h-4" />
        </div>
      </div>

      {/* Input Area */}
      <div className="p-6 pt-4 bg-white flex-shrink-0 w-full z-10 pb-6 border-t border-transparent">
        <div className="relative bg-white rounded-xl border border-neutral-200 shadow-sm hover:shadow-md focus-within:shadow-md focus-within:border-neutral-300 transition-all duration-200">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            rows={1}
            placeholder="Message Agent..."
            className="w-full px-4 pt-4 pb-2 bg-transparent border-none focus:outline-none resize-none text-sm text-neutral-900 placeholder-neutral-400 leading-relaxed"
            style={{ minHeight: '60px', maxHeight: '300px' }}
          />

          {/* Toolbar Row */}
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <div className="flex items-center gap-1">
              <button className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors">
                <Paperclip size={18} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  input.trim()
                    ? 'bg-neutral-900 text-white shadow-md hover:bg-black'
                    : 'bg-transparent text-neutral-300 cursor-not-allowed'
                }`}
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
