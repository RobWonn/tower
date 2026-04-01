import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type RefObject } from 'react'
import { AgentType, type SlashCommandOption } from '@agent-tower/shared'
import { useSkillCatalog } from '@/hooks/use-skill-catalog'
import { filterPromptCommands, getSkillMentionMatch } from './skill-mentions'

interface UseSkillMentionMenuOptions {
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

export function useSkillMentionMenu({
  agentType,
  workingDir,
  input,
  setInput,
  textareaRef,
  minHeight,
  maxHeight,
}: UseSkillMentionMenuOptions) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const { data: skills = [] } = useSkillCatalog({ agentType, workingDir })

  const match = useMemo(
    () => (agentType === AgentType.CODEX ? getSkillMentionMatch(input) : null),
    [agentType, input]
  )

  const query = match?.query ?? null

  const filteredSkills = useMemo(() => {
    if (query === null) return []
    return filterPromptCommands(skills, query)
  }, [query, skills])

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
    if (selectedIndex < filteredSkills.length) return
    setSelectedIndex(0)
  }, [filteredSkills.length, selectedIndex])

  const applySkill = useCallback((skill: SlashCommandOption) => {
    const currentMatch = getSkillMentionMatch(input)
    if (!currentMatch) return

    const nextValue = `${input.slice(0, currentMatch.replaceStart)}${skill.command} `
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
    if (query === null || filteredSkills.length === 0) return false

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % filteredSkills.length)
      return true
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + filteredSkills.length) % filteredSkills.length)
      return true
    }

    if (shouldSelectWithKeyboard(event)) {
      event.preventDefault()
      applySkill(filteredSkills[selectedIndex] ?? filteredSkills[0])
      return true
    }

    return false
  }, [applySkill, filteredSkills, query, selectedIndex])

  return {
    allSkills: skills,
    query,
    filteredSkills,
    selectedIndex,
    setSelectedIndex,
    applySkill,
    handleKeyDown,
  }
}
