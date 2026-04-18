import { useEffect, useState, useRef } from 'react'
import { ExternalLink, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { socketManager } from '@/lib/socket'
import { ServerEvents } from '@agent-tower/shared/socket'
import type {
  ServerLoginUrlPayload,
  ServerLoginOutputPayload,
  ServerLoginDonePayload,
} from '@agent-tower/shared/socket'
import { useLoginCursorAgent } from '@/hooks/use-remote-servers'
import { useI18n } from '@/lib/i18n'

interface CursorLoginDialogProps {
  isOpen: boolean
  onClose: () => void
  serverId: string
  serverName: string
}

type LoginState = 'idle' | 'waiting' | 'url_received' | 'done_success' | 'done_failed'

export function CursorLoginDialog({ isOpen, onClose, serverId, serverName }: CursorLoginDialogProps) {
  const { t } = useI18n()
  const [state, setState] = useState<LoginState>('idle')
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [output, setOutput] = useState('')
  const outputRef = useRef<HTMLPreElement>(null)
  const loginMutation = useLoginCursorAgent()
  const hasStartedRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      setState('idle')
      setAuthUrl(null)
      setOutput('')
      hasStartedRef.current = false
      return
    }

    if (hasStartedRef.current) return
    hasStartedRef.current = true

    setState('waiting')
    loginMutation.mutate(serverId)

    const socket = socketManager.getSocket()

    const handleUrl = (payload: ServerLoginUrlPayload) => {
      if (payload.serverId !== serverId) return
      setAuthUrl(payload.url)
      setState('url_received')
    }

    const handleOutput = (payload: ServerLoginOutputPayload) => {
      if (payload.serverId !== serverId) return
      setOutput(prev => prev + payload.data)
    }

    const handleDone = (payload: ServerLoginDonePayload) => {
      if (payload.serverId !== serverId) return
      setState(payload.success ? 'done_success' : 'done_failed')
    }

    socket.on(ServerEvents.SERVER_LOGIN_URL, handleUrl)
    socket.on(ServerEvents.SERVER_LOGIN_OUTPUT, handleOutput)
    socket.on(ServerEvents.SERVER_LOGIN_DONE, handleDone)

    return () => {
      socket.off(ServerEvents.SERVER_LOGIN_URL, handleUrl)
      socket.off(ServerEvents.SERVER_LOGIN_OUTPUT, handleOutput)
      socket.off(ServerEvents.SERVER_LOGIN_DONE, handleDone)
    }
  }, [isOpen, serverId])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${t('登录 Cursor Agent')} — ${serverName}`}
      className="max-w-xl"
    >
      <div className="space-y-4">
        {/* Status indicator */}
        <div className="flex items-center gap-3">
          {state === 'waiting' && (
            <>
              <Loader2 size={18} className="animate-spin text-blue-500" />
              <span className="text-sm text-neutral-600">
                {t('正在启动登录流程...')}
              </span>
            </>
          )}
          {state === 'url_received' && (
            <>
              <Loader2 size={18} className="animate-spin text-amber-500" />
              <span className="text-sm text-neutral-600">
                {t('请在浏览器中完成登录验证')}
              </span>
            </>
          )}
          {state === 'done_success' && (
            <>
              <CheckCircle2 size={18} className="text-green-500" />
              <span className="text-sm text-green-700 font-medium">
                {t('登录成功')}
              </span>
            </>
          )}
          {state === 'done_failed' && (
            <>
              <XCircle size={18} className="text-red-500" />
              <span className="text-sm text-red-700 font-medium">
                {t('登录失败')}
              </span>
            </>
          )}
        </div>

        {/* Auth URL */}
        {authUrl && state !== 'done_success' && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm text-blue-800 mb-2">{t('请点击以下链接完成认证：')}</p>
            <a
              href={authUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 break-all"
            >
              {authUrl}
              <ExternalLink size={14} className="shrink-0" />
            </a>
          </div>
        )}

        {/* Terminal output */}
        {output && (
          <div className="rounded-lg border border-neutral-200 bg-neutral-900 overflow-hidden">
            <div className="px-3 py-1.5 bg-neutral-800 border-b border-neutral-700">
              <span className="text-xs text-neutral-400">{t('终端输出')}</span>
            </div>
            <pre
              ref={outputRef}
              className="p-3 text-xs text-green-400 font-mono overflow-auto max-h-48 whitespace-pre-wrap"
            >
              {output}
            </pre>
          </div>
        )}
      </div>
    </Modal>
  )
}
