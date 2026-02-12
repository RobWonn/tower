import React, { useState, useCallback } from "react"
import { Terminal, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { StandaloneTerminalView } from "./StandaloneTerminalView"

// ============================================================
// Types
// ============================================================

interface TerminalTab {
  id: string
  label: string
}

export interface TerminalTabsProps {
  /** Working directory for new terminals */
  cwd?: string
}

// ============================================================
// Counter for unique tab labels
// ============================================================

let tabCounter = 0

function nextTabId(): string {
  return `shell-${++tabCounter}`
}

// ============================================================
// Component
// ============================================================

export const TerminalTabs: React.FC<TerminalTabsProps> = React.memo(
  function TerminalTabs({ cwd }) {
    // Start with one terminal tab by default
    const [tabs, setTabs] = useState<TerminalTab[]>(() => {
      const id = nextTabId()
      return [{ id, label: "Shell 1" }]
    })
    const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id)

    // Add a new terminal tab
    const handleAddTab = useCallback(() => {
      const id = nextTabId()
      const newTab: TerminalTab = {
        id,
        label: `Shell ${tabs.length + 1}`,
      }
      setTabs(prev => [...prev, newTab])
      setActiveTabId(id)
    }, [tabs.length])

    // Close a terminal tab
    const handleCloseTab = useCallback((tabId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      setTabs(prev => {
        const next = prev.filter(t => t.id !== tabId)
        // If we closed the active tab, switch to the last remaining tab
        if (tabId === activeTabId && next.length > 0) {
          setActiveTabId(next[next.length - 1].id)
        }
        return next
      })
    }, [activeTabId])

    // Handle terminal exit — remove the tab
    const handleTerminalExit = useCallback((tabId: string) => {
      setTabs(prev => {
        const next = prev.filter(t => t.id !== tabId)
        if (tabId === activeTabId && next.length > 0) {
          setActiveTabId(next[next.length - 1].id)
        }
        return next
      })
    }, [activeTabId])

    return (
      <div className="flex h-full flex-col bg-[#1e1e1e]">
        {/* Terminal sub-tab bar */}
        <div className="flex items-center bg-[#252526] border-b border-[#333] shrink-0 select-none">
          <div className="flex items-center overflow-x-auto flex-1 min-w-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-[11px] border-r border-[#333] whitespace-nowrap group transition-colors",
                  tab.id === activeTabId
                    ? "bg-[#1e1e1e] text-neutral-200"
                    : "bg-[#2d2d2d] text-neutral-500 hover:text-neutral-300"
                )}
              >
                <Terminal size={11} className="shrink-0" />
                <span>{tab.label}</span>
                {tabs.length > 1 && (
                  <span
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    className="ml-1 p-0.5 rounded hover:bg-[#444] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <X size={10} />
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Add terminal button */}
          <button
            onClick={handleAddTab}
            className="flex items-center justify-center px-2 py-1.5 text-neutral-500 hover:text-neutral-300 hover:bg-[#333] transition-colors shrink-0"
            title="New Terminal"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Terminal content area */}
        <div className="flex-1 overflow-hidden relative">
          {tabs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center h-full text-neutral-500">
              <div className="flex flex-col items-center gap-2">
                <Terminal size={28} />
                <span className="text-xs">No terminals open</span>
                <button
                  onClick={handleAddTab}
                  className="mt-1 px-3 py-1 text-xs bg-[#333] hover:bg-[#444] rounded transition-colors text-neutral-300"
                >
                  New Terminal
                </button>
              </div>
            </div>
          ) : (
            tabs.map((tab) => (
              <div
                key={tab.id}
                className="absolute inset-0"
                style={{ display: tab.id === activeTabId ? 'block' : 'none' }}
              >
                <StandaloneTerminalView
                  cwd={cwd}
                  onExit={() => handleTerminalExit(tab.id)}
                />
              </div>
            ))
          )}
        </div>
      </div>
    )
  }
)
