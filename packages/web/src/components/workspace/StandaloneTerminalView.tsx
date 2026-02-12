import React, { useEffect, useRef, useCallback } from "react"
import { Terminal as XTerm } from "xterm"
import { FitAddon } from "@xterm/addon-fit"
import "xterm/css/xterm.css"

import { useStandaloneTerminal } from "@/lib/socket/hooks/useStandaloneTerminal"

// ============================================================
// Types
// ============================================================

export interface StandaloneTerminalViewProps {
  /** Working directory for the terminal */
  cwd?: string
  /** Called when the terminal process exits */
  onExit?: (exitCode: number) => void
}

// ============================================================
// xterm theme (shared with TerminalView)
// ============================================================

const XTERM_THEME = {
  background: "#1e1e1e",
  foreground: "#d4d4d4",
  cursor: "#d4d4d4",
  selectionBackground: "#264f78",
  black: "#1e1e1e",
  red: "#f44747",
  green: "#6a9955",
  yellow: "#d7ba7d",
  blue: "#569cd6",
  magenta: "#c586c0",
  cyan: "#4ec9b0",
  white: "#d4d4d4",
  brightBlack: "#808080",
  brightRed: "#f44747",
  brightGreen: "#6a9955",
  brightYellow: "#d7ba7d",
  brightBlue: "#569cd6",
  brightMagenta: "#c586c0",
  brightCyan: "#4ec9b0",
  brightWhite: "#ffffff",
} as const

// ============================================================
// Component
// ============================================================

export const StandaloneTerminalView: React.FC<StandaloneTerminalViewProps> = React.memo(
  function StandaloneTerminalView({ cwd, onExit }) {
    const terminalRef = useRef<HTMLDivElement>(null)
    const xtermRef = useRef<XTerm | null>(null)
    const fitAddonRef = useRef<FitAddon | null>(null)
    const createdRef = useRef(false)

    const {
      terminalId,
      isAttached,
      create,
      sendInput,
      resize,
    } = useStandaloneTerminal({
      cwd,
      onOutput: useCallback((data: string) => {
        xtermRef.current?.write(data)
      }, []),
      onExit: useCallback((exitCode: number) => {
        xtermRef.current?.writeln(
          `\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`
        )
        onExit?.(exitCode)
      }, [onExit]),
    })

    // Initialize xterm
    useEffect(() => {
      if (!terminalRef.current) return

      const xterm = new XTerm({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
        lineHeight: 1.4,
        theme: XTERM_THEME,
        scrollback: 5000,
        convertEol: true,
      })

      const fitAddon = new FitAddon()
      xterm.loadAddon(fitAddon)
      xterm.open(terminalRef.current)

      requestAnimationFrame(() => {
        try {
          fitAddon.fit()
        } catch {
          // fit may fail during init
        }
      })

      xtermRef.current = xterm
      fitAddonRef.current = fitAddon

      return () => {
        xterm.dispose()
        xtermRef.current = null
        fitAddonRef.current = null
      }
    }, [])

    // Auto-create terminal on mount
    useEffect(() => {
      if (createdRef.current) return
      createdRef.current = true
      create()
    }, [create])

    // Forward keyboard input to PTY
    useEffect(() => {
      const xterm = xtermRef.current
      if (!xterm || !isAttached) return

      const disposable = xterm.onData((data) => {
        sendInput(data)
      })

      return () => disposable.dispose()
    }, [sendInput, isAttached])

    // Auto-fit on container resize
    useEffect(() => {
      if (!terminalRef.current) return

      const observer = new ResizeObserver(() => {
        try {
          const fitAddon = fitAddonRef.current
          const xterm = xtermRef.current
          if (fitAddon && xterm) {
            fitAddon.fit()
            resize(xterm.cols, xterm.rows)
          }
        } catch {
          // ignore fit errors
        }
      })

      observer.observe(terminalRef.current)
      return () => observer.disconnect()
    }, [resize])

    return (
      <div className="flex h-full flex-col bg-[#1e1e1e]">
        {/* Terminal loading state */}
        {!terminalId && (
          <div className="flex-1 flex items-center justify-center text-neutral-500 text-xs">
            Starting terminal...
          </div>
        )}
        {/* Terminal body */}
        <div
          ref={terminalRef}
          className="flex-1 overflow-hidden px-1 pt-1"
          style={{ display: terminalId ? 'block' : 'none' }}
        />
      </div>
    )
  }
)
