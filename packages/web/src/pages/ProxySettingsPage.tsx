import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import {
  useClashStatus,
  useClashSubscriptions,
  useClashGroups,
  useClashStart,
  useClashStop,
  useClashRestart,
  useClashAddSubscription,
  useClashDeleteSubscription,
  useClashUseSubscription,
  useClashUpdateSubscription,
  useClashSwitchNode,
  useClashTest,
} from '@/hooks/use-clash'
import type { ClashProxyGroup, ClashTestResult } from '@/hooks/use-clash'

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-neutral-300'}`} />
  )
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="border border-neutral-100 rounded-xl p-5 space-y-4">{children}</div>
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

function SubscriptionSection() {
  const { t } = useI18n()
  const { data: subs, isLoading } = useClashSubscriptions()
  const addSub = useClashAddSubscription()
  const delSub = useClashDeleteSubscription()
  const useSub = useClashUseSubscription()
  const updateSub = useClashUpdateSubscription()
  const [newUrl, setNewUrl] = useState('')

  const handleAdd = () => {
    if (!newUrl.trim()) return
    addSub.mutate(newUrl.trim(), { onSuccess: () => setNewUrl('') })
  }

  if (isLoading) return <p className="text-xs text-neutral-400">{t('加载中...')}</p>

  return (
    <SectionCard>
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-neutral-900">{t('订阅管理')}</h3>
        <button
          onClick={() => updateSub.mutate(undefined)}
          disabled={updateSub.isPending}
          className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors disabled:opacity-50"
        >
          {updateSub.isPending ? t('更新中...') : t('更新当前订阅')}
        </button>
      </div>

      {/* Subscription list */}
      {subs && subs.profiles.length > 0 ? (
        <div className="space-y-2">
          {subs.profiles.map((p) => (
            <div
              key={p.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                subs.use === p.id ? 'bg-neutral-900 text-white' : 'bg-neutral-50 text-neutral-700'
              }`}
            >
              <span className="flex-1 truncate font-mono text-xs">{p.url}</span>
              <span className="text-xs opacity-60">#{p.id}</span>
              {subs.use !== p.id && (
                <>
                  <button
                    onClick={() => useSub.mutate(p.id)}
                    disabled={useSub.isPending}
                    className="text-xs px-2 py-0.5 rounded bg-white text-neutral-700 border border-neutral-200 hover:border-neutral-400 transition-colors disabled:opacity-50"
                  >
                    {t('使用')}
                  </button>
                  <button
                    onClick={() => delSub.mutate(p.id)}
                    disabled={delSub.isPending}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                  >
                    {t('删除')}
                  </button>
                </>
              )}
              {subs.use === p.id && (
                <span className="text-xs px-2 py-0.5 rounded bg-white/20">{t('当前')}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-neutral-400">{t('暂无订阅，请添加')}</p>
      )}

      {/* Add subscription */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={t('输入订阅链接...')}
          className="flex-1 h-9 px-3 border border-neutral-200 rounded-lg text-sm bg-white hover:border-neutral-300 focus:outline-none focus:border-neutral-400 transition-colors"
        />
        <button
          onClick={handleAdd}
          disabled={addSub.isPending || !newUrl.trim()}
          className="h-9 px-4 text-sm font-medium rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 transition-colors disabled:opacity-50"
        >
          {addSub.isPending ? t('添加中...') : t('添加')}
        </button>
      </div>
      {addSub.isError && (
        <p className="text-xs text-red-500">{(addSub.error as Error).message}</p>
      )}
    </SectionCard>
  )
}

// ─── Proxy Groups ─────────────────────────────────────────────────────────────

function GroupCard({ group }: { group: ClashProxyGroup }) {
  const { t } = useI18n()
  const switchNode = useClashSwitchNode()
  const isSelector = group.type === 'Selector'

  return (
    <div className="border border-neutral-100 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium text-neutral-900">{group.name}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">{group.type}</span>
        <span className="text-xs text-neutral-400">→</span>
        <span className="text-xs font-mono text-green-700">{group.now}</span>
      </div>

      {isSelector && group.all.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {group.all.map((node) => (
            <button
              key={node}
              onClick={() => switchNode.mutate({ group: group.name, node })}
              disabled={switchNode.isPending}
              className={`text-xs px-2 py-1 rounded-md transition-colors ${
                node === group.now
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {node}
            </button>
          ))}
        </div>
      )}

      {!isSelector && (
        <p className="text-xs text-neutral-400">{t('自动选择模式，共 {n} 个节点', { n: String(group.all.length) })}</p>
      )}
    </div>
  )
}

function ProxyGroupsSection() {
  const { t } = useI18n()
  const { data: groups, isLoading } = useClashGroups()

  if (isLoading) return <p className="text-xs text-neutral-400">{t('加载中...')}</p>
  if (!groups || groups.length === 0) return null

  return (
    <SectionCard>
      <h3 className="text-[13px] font-semibold text-neutral-900">{t('策略组 / 节点')}</h3>
      <div className="space-y-3">
        {groups.map((g) => (
          <GroupCard key={g.name} group={g} />
        ))}
      </div>
    </SectionCard>
  )
}

// ─── Connectivity Test ────────────────────────────────────────────────────────

function TestSection() {
  const { t } = useI18n()
  const test = useClashTest()
  const [result, setResult] = useState<ClashTestResult | null>(null)

  const handleTest = () => {
    test.mutate(undefined, { onSuccess: (data) => setResult(data) })
  }

  return (
    <SectionCard>
      <div className="flex items-center gap-3">
        <h3 className="text-[13px] font-semibold text-neutral-900">{t('Agent 连通性测试')}</h3>
        <button
          onClick={handleTest}
          disabled={test.isPending}
          className="h-8 px-4 text-xs font-medium rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors disabled:opacity-50"
        >
          {test.isPending ? t('测试中...') : t('测试出口 IP')}
        </button>
      </div>
      {result && (
        <div className={`text-sm px-3 py-2 rounded-lg ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          {result.success
            ? `✓ ${result.ip} — ${result.country} · ${result.city}`
            : `✗ ${result.error}`}
        </div>
      )}
      <p className="text-xs text-neutral-400">
        {t('测试从代理出口访问外网，确认 Agent 发起的请求能通过代理正常转发。')}
      </p>
    </SectionCard>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ProxySettingsPage() {
  const { t } = useI18n()
  const { data: status, isLoading } = useClashStatus()
  const start = useClashStart()
  const stop = useClashStop()
  const restart = useClashRestart()

  return (
    <div className="px-10 py-6 mx-auto w-full max-w-3xl space-y-6">
      {/* Header */}
      <section>
        <h2 className="text-lg font-semibold text-neutral-900">{t('代理设置')}</h2>
        <p className="mt-1 text-sm text-neutral-500">
          {t('管理本机 Clash (mihomo) 代理。Agent 启动时自动通过代理转发网络请求。')}
        </p>
      </section>

      {/* Status bar */}
      <SectionCard>
        {isLoading ? (
          <p className="text-xs text-neutral-400">{t('检测中...')}</p>
        ) : !status?.installed ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <StatusDot ok={false} />
              <span className="text-sm text-neutral-700">{t('Clash 未安装')}</span>
            </div>
            <p className="text-xs text-neutral-400">
              {t('请先安装 clash-for-linux：')}
              <code className="ml-1 px-1.5 py-0.5 bg-neutral-100 rounded text-[11px]">
                git clone https://github.com/nelvko/clash-for-linux-install && cd clash-for-linux-install && bash install.sh
              </code>
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <StatusDot ok={status.running} />
                <span className="text-sm text-neutral-900 font-medium">
                  {status.running ? t('运行中') : t('已停止')}
                </span>
              </div>
              {status.version && (
                <span className="text-xs text-neutral-400 font-mono">{status.version}</span>
              )}
              {status.running && status.mixedPort && (
                <span className="text-xs text-neutral-400">
                  {t('端口')}: <span className="font-mono">{status.mixedPort}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {status.running ? (
                <>
                  <button
                    onClick={() => restart.mutate()}
                    disabled={restart.isPending}
                    className="h-8 px-3 text-xs font-medium rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors disabled:opacity-50"
                  >
                    {restart.isPending ? t('重启中...') : t('重启')}
                  </button>
                  <button
                    onClick={() => stop.mutate()}
                    disabled={stop.isPending}
                    className="h-8 px-3 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {t('停止')}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => start.mutate()}
                  disabled={start.isPending}
                  className="h-8 px-4 text-xs font-medium rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 transition-colors disabled:opacity-50"
                >
                  {start.isPending ? t('启动中...') : t('启动')}
                </button>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {status?.installed && (
        <>
          <SubscriptionSection />
          {status.running && (
            <>
              <ProxyGroupsSection />
              <TestSection />
            </>
          )}
        </>
      )}
    </div>
  )
}
