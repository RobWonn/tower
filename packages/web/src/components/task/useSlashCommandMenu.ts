import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type RefObject } from 'react'
import type { AgentType, SlashCommandOption } from '@agent-tower/shared'
import { useSlashCommandCatalog, mergeSlashCommandCatalog } from '@/hooks/use-slash-command-catalog'
import { filterSlashCommands, getSlashCommandQuery, getSlashCommandsForAgentType } from './slash-commands'

interface UseSlashCommandMenuOptions {
  agentType?: AgentType | string | null
  workingDir?: string
  input: string
  setInput: (value: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  minHeight: number
  maxHeight: number
}

function shouldSelectWithKeyboard(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  const isEnterSelection =
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.repeat &&
    !event.nativeEvent.isComposing &&
    event.nativeEvent.keyCode !== 229

  const isTabSelection = event.key === 'Tab' && !event.shiftKey
  return isEnterSelection || isTabSelection
}

export function useSlashCommandMenu({
  agentType,
  workingDir,
  input,
  setInput,
  textareaRef,
  minHeight,
  maxHeight,
}: UseSlashCommandMenuOptions) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const { data: discoveredCommands = [] } = useSlashCommandCatalog({ agentType, workingDir })

  const commands = useMemo(
    () => mergeSlashCommandCatalog(getSlashCommandsForAgentType(agentType), discoveredCommands),
    [agentType, discoveredCommands]
  )

  const query = useMemo(
    () => getSlashCommandQuery(input),
    [input]
  )

  const filteredCommands = useMemo(() => {
    if (query === null) return []
    return filterSlashCommands(commands, query)
  }, [commands, query])

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(minHeight, Math.min(el.scrollHeight, maxHeight))}px`
  }, [maxHeight, minHeight, textareaRef])

  useEffect(() => {
    setSelectedIndex(0)
  }, [agentType, query])

  useEffect(() => {
    if (selectedIndex < filteredCommands.length) return
    setSelectedIndex(0)
  }, [filteredCommands.length, selectedIndex])

  const applyCommand = useCallback((command: SlashCommandOption) => {
    const leadingWhitespace = input.match(/^(\s*)\/[^\s]*$/)?.[1] ?? ''
    const nextValue = `${leadingWhitespace}${command.command} `

    setInput(nextValue)

    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      resizeTextarea()
      el.focus()
      el.setSelectionRange(nextValue.length, nextValue.length)
    })
  }, [input, resizeTextarea, setInput, textareaRef])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (query === null || filteredCommands.length === 0) return false

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % filteredCommands.length)
      return true
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length)
      return true
    }

    if (shouldSelectWithKeyboard(event)) {
      event.preventDefault()
      applyCommand(filteredCommands[selectedIndex] ?? filteredCommands[0])
      return true
    }

    return false
  }, [applyCommand, filteredCommands, query, selectedIndex])

  return {
    allCommands: commands,
    query,
    filteredCommands,
    selectedIndex,
    setSelectedIndex,
    applyCommand,
    handleKeyDown,
  }
}
