import { useState } from 'react'
import { toast } from 'sonner'
import {
  Server,
  Plus,
  Trash2,
  RefreshCw,
  Download,
  LogIn,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
  Pencil,
  Loader2,
  Monitor,
  Shield,
  ShieldCheck,
  ShieldOff,
  Globe,
  Play,
  Square,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { CursorLoginDialog } from '@/components/remote/CursorLoginDialog'
import {
  useRemoteServers,
  useCreateRemoteServer,
  useUpdateRemoteServer,
  useDeleteRemoteServer,
  useTestServerConnection,
  useCheckCursorAgent,
  useInstallCursorAgent,
  type RemoteServer,
} from '@/hooks/use-remote-servers'
import {
  useRemoteClashStatus,
  useRemoteClashInstall,
  useRemoteClashFullSetup,
  useRemoteClashStart,
  useRemoteClashStop,
  useRemoteClashRestart,
  useRemoteClashSetTun,
  useRemoteClashTest,
  useRemoteClashSubscriptions,
  useRemoteClashAddSubscription,
  useRemoteClashUseSubscription,
  type RemoteClashTestResult,
} from '@/hooks/use-remote-clash'
import { useI18n } from '@/lib/i18n'

interface ServerFormData {
  name: string
  host: string
  port: number
  username: string
  authType: string
  privateKeyPath: string
  password: string
}

const emptyForm: ServerFormData = {
  name: '',
  host: '',
  port: 22,
  username: 'root',
  authType: 'key',
  privateKeyPath: '',
  password: '',
}

export function RemoteServersSettingsPage() {
  const { t } = useI18n()
  const { data: servers = [], isLoading } = useRemoteServers()
  const createServer = useCreateRemoteServer()
  const updateServer = useUpdateRemoteServer()
  const deleteServer = useDeleteRemoteServer()
  const testConnection = useTestServerConnection()
  const checkAgent = useCheckCursorAgent()
  const installAgent = useInstallCursorAgent()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ServerFormData>(emptyForm)
  const [loginServerId, setLoginServerId] = useState<string | null>(null)
  const [loginServerName, setLoginServerName] = useState('')
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string }>>({})

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (server: RemoteServer) => {
    setEditingId(server.id)
    setForm({
      name: server.name,
      host: server.host,
      port: server.port,
      username: server.username,
      authType: server.authType,
      privateKeyPath: server.privateKeyPath || '',
      password: '',
    })
    setShowForm(true)
  }

  const handleSubmit = () => {
    const data = {
      name: form.name,
      host: form.host,
      port: form.port,
      username: form.username,
      authType: form.authType,
      privateKeyPath: form.privateKeyPath || undefined,
      password: form.password || undefined,
    }
    if (editingId) {
      updateServer.mutate({ id: editingId, ...data }, { onSuccess: () => setShowForm(false) })
    } else {
      createServer.mutate(data, { onSuccess: () => setShowForm(false) })
    }
  }

  const handleTest = (id: string) => {
    setTestResults(prev => ({ ...prev, [id]: undefined as any }))
    testConnection.mutate(id, {
      onSuccess: (result) => setTestResults(prev => ({ ...prev, [id]: result })),
      onError: (err) => setTestResults(prev => ({ ...prev, [id]: { success: false, error: String(err) } })),
    })
  }

  const openLogin = (serverId: string, serverName: string) => {
    setLoginServerId(serverId)
    setLoginServerName(serverName)
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-neutral-900">{t('服务器管理')}</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {t('管理远程服务器连接，安装和登录 Cursor Agent')}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors"
        >
          <Plus size={14} />
          {t('添加服务器')}
        </button>
      </div>

      {/* Local server card */}
      <div className="mb-4 rounded-xl border border-neutral-100 bg-white">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <Monitor size={18} className="text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-neutral-900">{t('本机')}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
                  Hub
                </span>
              </div>
              <span className="text-xs text-neutral-400">localhost</span>
            </div>
          </div>
          <button
            onClick={() => openLogin('local', t('本机'))}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-neutral-600 border border-neutral-200 rounded-md hover:bg-neutral-50 transition-colors"
          >
            <LogIn size={12} />
            {t('登录 Cursor')}
          </button>
        </div>
      </div>

      {/* Remote server list */}
      {isLoading ? (
        <div className="text-sm text-neutral-400 text-center py-8">{t('加载中...')}</div>
      ) : servers.length === 0 ? (
        <div className="text-sm text-neutral-400 text-center py-8 border border-dashed border-neutral-200 rounded-xl">
          {t('暂无远程服务器，点击右上角添加')}
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map(server => (
            <ServerCard
              key={server.id}
              server={server}
              testResult={testResults[server.id]}
              onTest={() => handleTest(server.id)}
              onCheck={() => checkAgent.mutate(server.id, {
                onSuccess: (data) => {
                  if (data.installed) toast.success(t('Cursor Agent 已安装') + (data.version ? ` (${data.version})` : ''))
                  else toast.info(t('Cursor Agent 未安装'))
                },
                onError: (err) => toast.error(t('检查失败: ') + (err instanceof Error ? err.message : String(err))),
              })}
              onInstall={() => {
                toast.info(t('正在安装 Cursor Agent，请稍候...'))
                installAgent.mutate(server.id, {
                  onSuccess: (data) => {
                    if (data.success) toast.success(t('Cursor Agent 安装成功'))
                    else toast.error(t('安装完成但检测失败'))
                  },
                  onError: (err) => toast.error(t('安装失败: ') + (err instanceof Error ? err.message : String(err))),
                })
              }}
              onLogin={() => openLogin(server.id, server.name)}
              onEdit={() => openEdit(server)}
              onDelete={() => {
                if (confirm(t('确定删除此服务器？'))) deleteServer.mutate(server.id)
              }}
              isTesting={testConnection.isPending}
              isChecking={checkAgent.isPending}
              isInstalling={installAgent.isPending}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Add/Edit form modal */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editingId ? t('编辑服务器') : t('添加服务器')}
        action={
          <>
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-900"
            >
              {t('取消')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!form.name || !form.host || !form.username}
              className="px-4 py-1.5 text-xs font-medium bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {editingId ? t('保存') : t('添加')}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('名称')} value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="my-server" />
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label={t('主机')} value={form.host} onChange={v => setForm(f => ({ ...f, host: v }))} placeholder="192.168.1.100" />
            </div>
            <Field label={t('端口')} value={String(form.port)} onChange={v => setForm(f => ({ ...f, port: parseInt(v) || 22 }))} placeholder="22" />
          </div>
          <Field label={t('用户名')} value={form.username} onChange={v => setForm(f => ({ ...f, username: v }))} placeholder="root" />
          <div>
            <label className="text-xs font-medium text-neutral-700 mb-1 block">{t('认证方式')}</label>
            <div className="flex gap-2">
              <button
                onClick={() => setForm(f => ({ ...f, authType: 'key' }))}
                className={`flex-1 py-1.5 text-xs rounded-md border transition-colors ${form.authType === 'key' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
              >
                {t('SSH 密钥')}
              </button>
              <button
                onClick={() => setForm(f => ({ ...f, authType: 'password' }))}
                className={`flex-1 py-1.5 text-xs rounded-md border transition-colors ${form.authType === 'password' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
              >
                {t('密码')}
              </button>
            </div>
          </div>
          {form.authType === 'key' ? (
            <Field
              label={t('私钥路径 (留空使用默认)')}
              value={form.privateKeyPath}
              onChange={v => setForm(f => ({ ...f, privateKeyPath: v }))}
              placeholder="~/.ssh/id_rsa"
            />
          ) : (
            <Field
              label={t('密码')}
              value={form.password}
              onChange={v => setForm(f => ({ ...f, password: v }))}
              placeholder="••••••••"
              type="password"
            />
          )}
        </div>
      </Modal>

      {/* Login dialog */}
      {loginServerId !== null && (
        <CursorLoginDialog
          isOpen={true}
          onClose={() => setLoginServerId(null)}
          serverId={loginServerId}
          serverName={loginServerName}
        />
      )}
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="text-xs font-medium text-neutral-700 mb-1 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-300"
      />
    </div>
  )
}

function ServerCard({
  server, testResult, onTest, onCheck, onInstall, onLogin, onEdit, onDelete,
  isTesting, isChecking, isInstalling, t,
}: {
  server: RemoteServer
  testResult?: { success: boolean; error?: string }
  onTest: () => void
  onCheck: () => void
  onInstall: () => void
  onLogin: () => void
  onEdit: () => void
  onDelete: () => void
  isTesting: boolean
  isChecking: boolean
  isInstalling: boolean
  t: (s: string, vars?: Record<string, string>) => string
}) {
  const [showClash, setShowClash] = useState(false)

  return (
    <div className="rounded-xl border border-neutral-100 bg-white overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-neutral-50 flex items-center justify-center">
              <Server size={18} className="text-neutral-500" />
            </div>
            <div>
              <span className="text-sm font-semibold text-neutral-900">{server.name}</span>
              <div className="text-xs text-neutral-400 mt-0.5">
                {server.username}@{server.host}:{server.port}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onEdit} className="p-1.5 text-neutral-400 hover:text-neutral-900 transition-colors" title={t('编辑')}>
              <Pencil size={14} />
            </button>
            <button onClick={onDelete} className="p-1.5 text-neutral-400 hover:text-red-600 transition-colors" title={t('删除')}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2 mt-3">
          {testResult && (
            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {testResult.success ? <Wifi size={10} /> : <WifiOff size={10} />}
              {testResult.success ? t('已连接') : t('连接失败')}
            </span>
          )}
          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${server.agentInstalled ? 'bg-green-50 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}>
            {server.agentInstalled ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
            Cursor Agent {server.agentInstalled ? t('已安装') : t('未安装')}
          </span>
          {server.agentInstalled && (
            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${server.agentLoggedIn ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-600'}`}>
              {server.agentLoggedIn ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
              {server.agentLoggedIn ? t('已登录') : t('未登录')}
            </span>
          )}
        </div>
      </div>

      {/* Actions bar */}
      <div className="px-4 py-2.5 bg-neutral-50 border-t border-neutral-100 flex items-center gap-2">
        <ActionBtn icon={<RefreshCw size={12} />} label={t('测试连接')} onClick={onTest} loading={isTesting} />
        <ActionBtn icon={<RefreshCw size={12} />} label={t('检查 Agent')} onClick={onCheck} loading={isChecking} />
        {!server.agentInstalled && (
          <ActionBtn icon={<Download size={12} />} label={t('安装 Agent')} onClick={onInstall} loading={isInstalling} />
        )}
        {server.agentInstalled && (
          <ActionBtn icon={<LogIn size={12} />} label={t('登录 Cursor')} onClick={onLogin} />
        )}
        <div className="flex-1" />
        <button
          onClick={() => setShowClash(v => !v)}
          className="flex items-center gap-1 px-2 py-1 text-[11px] text-neutral-600 border border-neutral-200 rounded-md hover:bg-white transition-colors"
        >
          <Shield size={12} />
          {t('TUN 代理')}
          {showClash ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
      </div>

      {/* Collapsible Clash management panel */}
      {showClash && (
        <div className="px-4 py-3 border-t border-neutral-100 bg-neutral-50/50">
          <RemoteClashPanel serverId={server.id} t={t} />
        </div>
      )}
    </div>
  )
}

function ActionBtn({ icon, label, onClick, loading }: {
  icon: React.ReactNode; label: string; onClick: () => void; loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1 px-2 py-1 text-[11px] text-neutral-600 border border-neutral-200 rounded-md hover:bg-white transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : icon}
      {label}
    </button>
  )
}

// ─── Remote Clash Panel ────────────────────────────────────────────────────────

function RemoteClashPanel({ serverId, t }: { serverId: string; t: (s: string, vars?: Record<string, string>) => string }) {
  const { data: status, isLoading } = useRemoteClashStatus(serverId)
  const { data: subs } = useRemoteClashSubscriptions(serverId)
  const install = useRemoteClashInstall(serverId)
  const fullSetup = useRemoteClashFullSetup(serverId)
  const start = useRemoteClashStart(serverId)
  const stop = useRemoteClashStop(serverId)
  const restart = useRemoteClashRestart(serverId)
  const setTun = useRemoteClashSetTun(serverId)
  const testConn = useRemoteClashTest(serverId)
  const addSub = useRemoteClashAddSubscription(serverId)
  const useSub = useRemoteClashUseSubscription(serverId)

  const [subUrl, setSubUrl] = useState('')
  const [setupUrl, setSetupUrl] = useState('')
  const [testResult, setTestResult] = useState<RemoteClashTestResult | null>(null)

  if (isLoading) return <div className="text-xs text-neutral-400 py-2">{t('检测代理状态...')}</div>

  // Not installed: show install panel
  if (!status?.installed) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldOff size={14} className="text-neutral-400" />
          <span className="text-xs text-neutral-500">{t('TUN 代理未安装')}</span>
        </div>
        <p className="text-[11px] text-neutral-400">
          {t('一键安装 mihomo 并配置 TUN 代理，让远程 Agent 可以访问 Opus 等区域限制模型。')}
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={setupUrl}
            onChange={(e) => setSetupUrl(e.target.value)}
            placeholder={t('输入订阅链接...')}
            className="flex-1 h-8 px-3 border border-neutral-200 rounded-lg text-xs bg-white focus:outline-none focus:border-neutral-400"
          />
          <button
            onClick={() => {
              if (!setupUrl.trim()) {
                install.mutate(undefined, {
                  onSuccess: (r) => r.success ? toast.success(t('安装成功')) : toast.error(r.message),
                  onError: (e) => toast.error(String(e)),
                })
              } else {
                fullSetup.mutate(setupUrl.trim(), {
                  onSuccess: (r) => r.success ? toast.success(t('安装并配置完成')) : toast.error(r.message),
                  onError: (e) => toast.error(String(e)),
                })
              }
            }}
            disabled={install.isPending || fullSetup.isPending}
            className="h-8 px-3 text-xs font-medium rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {(install.isPending || fullSetup.isPending) ? t('安装中...') : setupUrl.trim() ? t('安装并配置') : t('仅安装')}
          </button>
        </div>
      </div>
    )
  }

  // Installed: show management panel
  return (
    <div className="space-y-3">
      {/* Status row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {status.running ? <ShieldCheck size={14} className="text-green-600" /> : <ShieldOff size={14} className="text-neutral-400" />}
            <span className={`text-xs font-medium ${status.running ? 'text-green-700' : 'text-neutral-500'}`}>
              {status.running ? t('代理运行中') : t('代理已停止')}
            </span>
          </div>
          {status.running && status.tunEnabled && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">TUN</span>
          )}
          {status.running && status.mixedPort && (
            <span className="text-[10px] text-neutral-400 font-mono">:{status.mixedPort}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {status.running ? (
            <>
              <button
                onClick={() => restart.mutate(undefined, { onSuccess: () => toast.success(t('已重启')) })}
                disabled={restart.isPending}
                className="h-6 px-2 text-[10px] rounded border border-neutral-200 text-neutral-600 hover:bg-white disabled:opacity-50"
              >
                {restart.isPending ? <Loader2 size={10} className="animate-spin" /> : t('重启')}
              </button>
              <button
                onClick={() => stop.mutate(undefined, { onSuccess: () => toast.success(t('已停止')) })}
                disabled={stop.isPending}
                className="h-6 px-2 text-[10px] rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Square size={10} />
              </button>
            </>
          ) : (
            <button
              onClick={() => start.mutate(undefined, { onSuccess: () => toast.success(t('已启动')) })}
              disabled={start.isPending}
              className="h-6 px-2 text-[10px] rounded bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {start.isPending ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
            </button>
          )}
        </div>
      </div>

      {/* TUN toggle */}
      {status.running && (
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-neutral-600">{t('TUN 模式（全局透明代理）')}</span>
          <button
            onClick={() => setTun.mutate(!status.tunEnabled, {
              onSuccess: () => toast.success(status.tunEnabled ? t('TUN 已关闭') : t('TUN 已开启')),
            })}
            disabled={setTun.isPending}
            className={`relative w-9 h-5 rounded-full transition-colors ${status.tunEnabled ? 'bg-green-500' : 'bg-neutral-300'} ${setTun.isPending ? 'opacity-50' : ''}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${status.tunEnabled ? 'translate-x-4' : ''}`} />
          </button>
        </div>
      )}

      {/* Subscriptions */}
      {subs && subs.profiles.length > 0 && (
        <div className="space-y-1">
          {subs.profiles.map((p) => (
            <div key={p.id} className={`flex items-center gap-2 px-2 py-1 rounded text-[11px] ${subs.use === p.id ? 'bg-neutral-900 text-white' : 'bg-neutral-50 text-neutral-600'}`}>
              <span className="flex-1 truncate font-mono">{p.url}</span>
              {subs.use !== p.id && (
                <button
                  onClick={() => useSub.mutate(p.id)}
                  disabled={useSub.isPending}
                  className="px-1.5 py-0.5 rounded bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-400 disabled:opacity-50"
                >
                  {t('使用')}
                </button>
              )}
              {subs.use === p.id && <span className="text-[10px] opacity-60">{t('当前')}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Add subscription */}
      <div className="flex gap-2">
        <input
          type="text"
          value={subUrl}
          onChange={(e) => setSubUrl(e.target.value)}
          placeholder={t('添加订阅链接...')}
          className="flex-1 h-7 px-2 border border-neutral-200 rounded text-[11px] bg-white focus:outline-none focus:border-neutral-400"
        />
        <button
          onClick={() => {
            if (!subUrl.trim()) return
            addSub.mutate(subUrl.trim(), { onSuccess: () => { setSubUrl(''); toast.success(t('订阅已添加')) } })
          }}
          disabled={addSub.isPending || !subUrl.trim()}
          className="h-7 px-2 text-[10px] font-medium rounded bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {addSub.isPending ? '...' : t('添加')}
        </button>
      </div>

      {/* Test connectivity */}
      {status.running && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => testConn.mutate(undefined, { onSuccess: (r) => setTestResult(r) })}
            disabled={testConn.isPending}
            className="h-6 px-2 text-[10px] rounded border border-neutral-200 text-neutral-600 hover:bg-white disabled:opacity-50 flex items-center gap-1"
          >
            {testConn.isPending ? <Loader2 size={10} className="animate-spin" /> : <Globe size={10} />}
            {t('测试出口')}
          </button>
          {testResult && (
            <span className={`text-[10px] ${testResult.success ? 'text-green-600' : 'text-red-500'}`}>
              {testResult.success ? `✓ ${testResult.ip} (${testResult.country})` : `✗ ${testResult.error?.slice(0, 60)}`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
