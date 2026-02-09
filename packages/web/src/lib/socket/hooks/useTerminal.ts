import { useEffect, useRef, useCallback, useState } from 'react'
import { socketManager } from '../manager.js'
import {
  TerminalClientEvents,
  TerminalServerEvents,
  type TerminalOutputPayload,
  type TerminalExitPayload,
  type TerminalErrorPayload,
  type TerminalCreatedPayload,
  type AckResponse,
} from '@agent-tower/shared/socket'

// ============================================================
// Shared types
// ============================================================

interface UseTerminalOptionsBase {
  onOutput?: (data: string) => void
  onExit?: (exitCode: number) => void
  onError?: (message: string) => void
}

/** Agent 终端 — 使用后端已有的 sessionId */
interface UseTerminalSessionOptions extends UseTerminalOptionsBase {
  sessionId: string
  terminalId?: never
}

/** 独立终端 — 使用前端分配的 terminalId */
interface UseTerminalIdOptions extends UseTerminalOptionsBase {
  terminalId: string
  sessionId?: never
}

export type UseTerminalOptions = UseTerminalSessionOptions | UseTerminalIdOptions

export interface UseTerminalReturn {
  isConnected: boolean
  isAttached: boolean
  attach: () => Promise<boolean>
  detach: () => void
  sendInput: (data: string) => void
  resize: (cols: number, rows: number) => void
}

// ============================================================
// useTerminal — 连接单个终端实例
// ============================================================

/**
 * 终端 Socket 连接 Hook
 * 管理与特定终端会话的连接
 *
 * 两种模式：
 *   - sessionId: Agent 终端（后端创建的 PTY session）
 *   - terminalId: 独立终端（前端通过 createTerminal 创建的 PTY）
 *
 * 两者在协议层使用同一个 sessionId 字段通信（独立终端的 terminalId 就是其 sessionId）。
 */
export function useTerminal(options: UseTerminalOptions): UseTerminalReturn {
  const { onOutput, onExit, onError } = options
  // 统一 key —— 独立终端的 terminalId 等价于 sessionId
  const key = options.sessionId ?? options.terminalId

  const [isConnected, setIsConnected] = useState(false)
  const [isAttached, setIsAttached] = useState(false)

  // 使用 ref 保存回调，避免重复订阅
  const callbacksRef = useRef({ onOutput, onExit, onError })
  callbacksRef.current = { onOutput, onExit, onError }

  // 连接和事件监听
  useEffect(() => {
    const socket = socketManager.connect('TERMINAL')

    // 连接状态
    const handleConnect = () => setIsConnected(true)
    const handleDisconnect = () => {
      setIsConnected(false)
      setIsAttached(false)
    }

    // 终端事件
    const handleOutput = (payload: TerminalOutputPayload) => {
      if (payload.sessionId === key) {
        callbacksRef.current.onOutput?.(payload.data)
      }
    }

    const handleExit = (payload: TerminalExitPayload) => {
      if (payload.sessionId === key) {
        setIsAttached(false)
        callbacksRef.current.onExit?.(payload.exitCode)
      }
    }

    const handleError = (payload: TerminalErrorPayload) => {
      if (payload.sessionId === key) {
        callbacksRef.current.onError?.(payload.message)
      }
    }

    const handleAttached = (payload: { sessionId: string }) => {
      if (payload.sessionId === key) {
        setIsAttached(true)
      }
    }

    const handleDetached = (payload: { sessionId: string }) => {
      if (payload.sessionId === key) {
        setIsAttached(false)
      }
    }

    // 注册事件监听
    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on(TerminalServerEvents.OUTPUT, handleOutput)
    socket.on(TerminalServerEvents.EXIT, handleExit)
    socket.on(TerminalServerEvents.ERROR, handleError)
    socket.on(TerminalServerEvents.ATTACHED, handleAttached)
    socket.on(TerminalServerEvents.DETACHED, handleDetached)

    // 初始状态
    setIsConnected(socket.connected)

    // 清理
    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off(TerminalServerEvents.OUTPUT, handleOutput)
      socket.off(TerminalServerEvents.EXIT, handleExit)
      socket.off(TerminalServerEvents.ERROR, handleError)
      socket.off(TerminalServerEvents.ATTACHED, handleAttached)
      socket.off(TerminalServerEvents.DETACHED, handleDetached)

      // 如果已 attach，自动 detach
      if (isAttached) {
        socket.emit(TerminalClientEvents.DETACH, { sessionId: key })
      }
    }
  }, [key])

  // Attach 到终端会话
  const attach = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket('TERMINAL')

      if (!socket.connected) {
        resolve(false)
        return
      }

      socket.emit(
        TerminalClientEvents.ATTACH,
        { sessionId: key },
        (response: AckResponse) => {
          resolve(response.success)
        }
      )
    })
  }, [key])

  // Detach 从终端会话
  const detach = useCallback(() => {
    const socket = socketManager.getSocket('TERMINAL')
    socket.emit(TerminalClientEvents.DETACH, { sessionId: key })
  }, [key])

  // 发送输入
  const sendInput = useCallback((data: string) => {
    const socket = socketManager.getSocket('TERMINAL')
    socket.emit(TerminalClientEvents.INPUT, { sessionId: key, data })
  }, [key])

  // 调整终端大小
  const resize = useCallback((cols: number, rows: number) => {
    const socket = socketManager.getSocket('TERMINAL')
    socket.emit(TerminalClientEvents.RESIZE, { sessionId: key, cols, rows })
  }, [key])

  return {
    isConnected,
    isAttached,
    attach,
    detach,
    sendInput,
    resize,
  }
}

// ============================================================
// useTerminalManager — 管理多个独立终端的创建/销毁
// ============================================================

export interface TerminalTab {
  /** 唯一标识 — 后端创建成功后替换为真实 terminalId */
  id: string
  /** 显示标题 */
  title: string
  /** 运行状态 */
  status: 'running' | 'idle' | 'creating'
  /** 工作目录 */
  workingDir: string
}

export interface UseTerminalManagerReturn {
  terminals: TerminalTab[]
  activeTerminalId: string | null
  setActiveTerminalId: (id: string | null) => void
  createTerminal: (workingDir: string) => void
  destroyTerminal: (id: string) => void
}

/**
 * 多终端管理 Hook
 * 负责创建/销毁独立终端、维护 Tab 列表
 */
export function useTerminalManager(): UseTerminalManagerReturn {
  const [terminals, setTerminals] = useState<TerminalTab[]>([])
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null)

  // 计数器 ref，用于生成友好标题
  const counterRef = useRef(0)

  // 映射: 临时 ID → 真实 terminalId（当 tempId === realId 时无需映射）
  const pendingMapRef = useRef<Map<string, string>>(new Map())

  // 监听 terminal:created 事件
  useEffect(() => {
    const socket = socketManager.connect('TERMINAL')

    const handleCreated = (payload: TerminalCreatedPayload) => {
      const { terminalId } = payload

      // 查找对应的 pending terminal
      // 后端的 terminal:create 使用 terminalId 字段传 clientId
      // terminal:created 返回真实 terminalId
      setTerminals((prev) =>
        prev.map((t) => {
          if (t.id === terminalId || pendingMapRef.current.get(t.id) === terminalId) {
            return { ...t, status: 'running' as const }
          }
          return t
        })
      )
    }

    socket.on(TerminalServerEvents.CREATED, handleCreated)

    return () => {
      socket.off(TerminalServerEvents.CREATED, handleCreated)
    }
  }, [])

  // 创建独立终端
  const createTerminal = useCallback((workingDir: string) => {
    const socket = socketManager.getSocket('TERMINAL')
    counterRef.current += 1
    const clientId = `term-${Date.now()}-${counterRef.current}`

    const newTab: TerminalTab = {
      id: clientId,
      title: `Terminal ${counterRef.current}`,
      status: 'creating',
      workingDir,
    }

    setTerminals((prev) => [...prev, newTab])
    setActiveTerminalId(clientId)

    // 发送创建请求
    socket.emit(
      TerminalClientEvents.CREATE,
      { workingDir, terminalId: clientId },
      (response: AckResponse<{ terminalId: string }>) => {
        if (response.success && response.data) {
          const realId = response.data.terminalId

          if (realId !== clientId) {
            // 后端返回了不同的 ID，需要更新
            pendingMapRef.current.set(clientId, realId)
            setTerminals((prev) =>
              prev.map((t) =>
                t.id === clientId ? { ...t, id: realId, status: 'running' } : t
              )
            )
            setActiveTerminalId((prev) => (prev === clientId ? realId : prev))
          } else {
            // ID 一致，直接标记为 running
            setTerminals((prev) =>
              prev.map((t) =>
                t.id === clientId ? { ...t, status: 'running' } : t
              )
            )
          }
        } else {
          // 创建失败，标记为 idle
          setTerminals((prev) =>
            prev.map((t) =>
              t.id === clientId ? { ...t, status: 'idle' } : t
            )
          )
        }
      }
    )
  }, [])

  // 销毁独立终端
  const destroyTerminal = useCallback((id: string) => {
    const socket = socketManager.getSocket('TERMINAL')

    socket.emit(TerminalClientEvents.DESTROY, { terminalId: id })

    setTerminals((prev) => {
      const remaining = prev.filter((t) => t.id !== id)
      return remaining
    })

    setActiveTerminalId((prev) => {
      if (prev !== id) return prev
      // 切到相邻 tab
      const idx = terminals.findIndex((t) => t.id === id)
      const remaining = terminals.filter((t) => t.id !== id)
      if (remaining.length === 0) return null
      const nextIdx = Math.min(idx, remaining.length - 1)
      return remaining[nextIdx].id
    })
  }, [terminals])

  return {
    terminals,
    activeTerminalId,
    setActiveTerminalId,
    createTerminal,
    destroyTerminal,
  }
}
