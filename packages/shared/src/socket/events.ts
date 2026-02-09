/**
 * Socket.IO 事件类型定义
 * 前后端共享，提供类型安全的事件名称和 payload 类型
 */

// ============ 命名空间 ============

export const NAMESPACES = {
  TERMINAL: '/terminal',
  AGENTS: '/agents',
} as const

// ============ Terminal 命名空间事件 ============

export const TerminalClientEvents = {
  ATTACH: 'terminal:attach',
  DETACH: 'terminal:detach',
  INPUT: 'terminal:input',
  RESIZE: 'terminal:resize',
  /** 创建独立终端 PTY */
  CREATE: 'terminal:create',
  /** 销毁独立终端 PTY */
  DESTROY: 'terminal:destroy',
} as const

export const TerminalServerEvents = {
  ATTACHED: 'terminal:attached',
  DETACHED: 'terminal:detached',
  OUTPUT: 'terminal:output',
  EXIT: 'terminal:exit',
  ERROR: 'terminal:error',
  /** 标准化日志 JSON Patch */
  PATCH: 'terminal:patch',
  /** Agent 内部 session ID */
  SESSION_ID: 'terminal:session_id',
  /** 独立终端创建成功 */
  CREATED: 'terminal:created',
} as const

// ============ Agents 命名空间事件 ============

export const AgentClientEvents = {
  SUBSCRIBE: 'agent:subscribe',
  UNSUBSCRIBE: 'agent:unsubscribe',
} as const

export const AgentServerEvents = {
  STATUS_CHANGED: 'agent:status_changed',
  LIST_UPDATE: 'agent:list_update',
} as const

// ============ Payload 类型定义 ============

// Terminal payloads
export interface TerminalAttachPayload {
  sessionId: string
}

export interface TerminalDetachPayload {
  sessionId: string
}

export interface TerminalInputPayload {
  sessionId: string
  data: string
}

export interface TerminalResizePayload {
  sessionId: string
  cols: number
  rows: number
}

export interface TerminalOutputPayload {
  sessionId: string
  data: string
}

export interface TerminalExitPayload {
  sessionId: string
  exitCode: number
}

export interface TerminalErrorPayload {
  sessionId: string
  message: string
}

/** 创建独立终端 payload */
export interface TerminalCreatePayload {
  workingDir: string
  terminalId?: string
}

/** 销毁独立终端 payload */
export interface TerminalDestroyPayload {
  terminalId: string
}

/** 独立终端创建成功 payload */
export interface TerminalCreatedPayload {
  terminalId: string
}

/** JSON Patch 操作 */
export interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test'
  path: string
  value?: unknown
  from?: string
}

/** 标准化日志 Patch payload */
export interface TerminalPatchPayload {
  sessionId: string
  patch: JsonPatchOperation[]
}

/** Agent 内部 session ID payload */
export interface TerminalSessionIdPayload {
  sessionId: string
  agentSessionId: string
}

// Agent payloads
export type AgentStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error'

export interface AgentStatusPayload {
  agentId: string
  sessionId: string
  status: AgentStatus
  error?: string
  timestamp: number
}

export interface AgentSubscribePayload {
  agentId?: string
}

// ============ ACK 响应类型 ============

export interface AckResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

// ============ 类型工具 ============

export type TerminalClientEventType = typeof TerminalClientEvents[keyof typeof TerminalClientEvents]
export type TerminalServerEventType = typeof TerminalServerEvents[keyof typeof TerminalServerEvents]
export type AgentClientEventType = typeof AgentClientEvents[keyof typeof AgentClientEvents]
export type AgentServerEventType = typeof AgentServerEvents[keyof typeof AgentServerEvents]
