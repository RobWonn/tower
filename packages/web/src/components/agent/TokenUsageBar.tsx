import { Gauge } from 'lucide-react'
import type { TokenUsageInfo } from '../../hooks/useTokenUsage'

interface TokenUsageIndicatorProps {
  usage: TokenUsageInfo | null
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function getUsageColor(ratio: number): string {
  if (ratio >= 0.9) return 'text-red-500'
  if (ratio >= 0.7) return 'text-amber-500'
  return 'text-neutral-400'
}

export function TokenUsageIndicator({ usage }: TokenUsageIndicatorProps) {
  if (!usage) return null

  const maxCtx = usage.modelContextWindow
  const ratio = maxCtx ? usage.totalTokens / maxCtx : 0
  const percentage = maxCtx ? Math.min(Math.round(ratio * 100), 100) : null
  const colorClass = maxCtx ? getUsageColor(ratio) : 'text-neutral-400'

  return (
    <div className="group relative flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-lg hover:bg-neutral-100 transition-colors cursor-default select-none">
      <Gauge size={14} className={colorClass} />
      <span className={`tabular-nums ${colorClass}`}>
        {formatNumber(usage.totalTokens)}
        {percentage !== null && (
          <span className="text-neutral-300 ml-0.5">/ {percentage}%</span>
        )}
      </span>

      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-neutral-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
        {maxCtx ? (
          <span>上下文: {formatNumber(usage.totalTokens)} / {formatNumber(maxCtx)} tokens</span>
        ) : (
          <span>已使用: {formatNumber(usage.totalTokens)} tokens</span>
        )}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900" />
      </div>
    </div>
  )
}

export { formatNumber }
