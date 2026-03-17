import type { ReactNode } from 'react'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Hover tooltip using pure CSS (group-hover pattern).
 * Wrap any trigger element; the tooltip appears above on hover.
 */
export function Tooltip({ content, children, className = '' }: TooltipProps) {
  return (
    <div className={`group/tooltip relative ${className}`}>
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-neutral-900 text-white text-xs rounded-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
        {content}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900" />
      </div>
    </div>
  )
}
