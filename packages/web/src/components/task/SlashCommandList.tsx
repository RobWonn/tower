import type { SlashCommandOption } from '@agent-tower/shared'

interface SlashCommandListProps {
  commands: SlashCommandOption[]
  selectedIndex: number
  query: string
  hasCatalog: boolean
  title?: string
  queryPrefix?: string
  emptyCatalogMessage?: string
  emptyQueryMessage?: string
  insertionHint?: string
  compact?: boolean
  onSelect: (command: SlashCommandOption) => void
}

export function SlashCommandList({
  commands,
  selectedIndex,
  query,
  hasCatalog,
  title = 'Slash Commands',
  queryPrefix = '/',
  emptyCatalogMessage = 'No slash commands catalog for this agent yet.',
  emptyQueryMessage,
  insertionHint = 'Enter / Tab to insert',
  compact = false,
  onSelect,
}: SlashCommandListProps) {
  const listPadding = compact ? 'px-1.5 pb-1.5' : 'px-2 pb-2'
  const itemPadding = compact ? 'px-2 py-1.5' : 'px-2.5 py-2'
  const maxHeight = compact ? 'max-h-36' : 'max-h-48'

  return (
    <div className={compact ? 'pt-1.5' : 'pt-2'}>
      <div className={`mb-1 flex items-center justify-between ${compact ? 'px-2 pt-0.5' : 'px-3 pt-1'}`}>
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400">{title}</span>
        <span className="text-[10px] text-neutral-400">{insertionHint}</span>
      </div>

      {commands.length === 0 ? (
        <div className={`${compact ? 'px-2 pb-2 pt-1.5 text-[11px]' : 'px-3 pb-3 pt-2 text-xs'} text-neutral-400`}>
          {hasCatalog ? (emptyQueryMessage ?? `No matches for ${queryPrefix}${query}`) : emptyCatalogMessage}
        </div>
      ) : (
        <div className={`${listPadding} ${maxHeight} overflow-y-auto`}>
          {commands.map((command, index) => (
            <button
              key={command.command}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(command)}
              className={`w-full rounded-lg border text-left transition-colors ${
                index === selectedIndex
                  ? 'border-neutral-300 bg-neutral-50'
                  : 'border-transparent hover:border-neutral-200 hover:bg-neutral-50/80'
              } ${itemPadding}`}
            >
              <div className="flex items-center gap-2">
                <div className="font-mono text-[13px] text-neutral-900">{command.command}</div>
                {command.kind && command.kind !== 'builtin' ? (
                  <span className="rounded-full border border-neutral-200 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-neutral-500">
                    {command.scope ? `${command.scope} ${command.kind}` : command.kind}
                  </span>
                ) : null}
              </div>
              <div className={`${compact ? 'mt-0.5 text-[11px]' : 'mt-1 text-xs'} text-neutral-500`}>
                {command.description}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
