import { useState, useEffect, useCallback, useRef } from 'react'
import { Folder, FolderGit2, ChevronRight, Loader2, AlertCircle, Check } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// === API 响应类型 ===

interface DirEntry {
  name: string
  path: string
  isGitRepo: boolean
}

interface BrowseResponse {
  current: string
  parent: string
  dirs: DirEntry[]
}

// === Props ===

export interface FolderPickerProps {
  /** 当前选中的路径 */
  value: string
  /** 路径变化回调 */
  onChange: (path: string) => void
  /** 占位文字 */
  placeholder?: string
  /** 远程服务器 ID，不传则浏览本地文件系统 */
  serverId?: string
}

export function FolderPicker({ value, onChange, placeholder, serverId }: FolderPickerProps) {
  const { t } = useI18n()
  const [currentPath, setCurrentPath] = useState('')
  const [dirs, setDirs] = useState<DirEntry[]>([])
  const [parentPath, setParentPath] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState(value)
  const initialLoadDone = useRef(false)

  useEffect(() => {
    setInputValue(value)
  }, [value])

  // === 浏览目录 ===
  const browsePath = useCallback(async (dirPath?: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {}
      if (dirPath) params.path = dirPath
      if (serverId) {
        params.serverId = serverId
        const res = await apiClient.get<BrowseResponse>('/filesystem/browse-remote', { params })
        setCurrentPath(res.current)
        setParentPath(res.parent)
        setDirs(res.dirs)
      } else {
        const res = await apiClient.get<BrowseResponse>('/filesystem/browse', { params })
        setCurrentPath(res.current)
        setParentPath(res.parent)
        setDirs(res.dirs)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to browse directory')
    } finally {
      setIsLoading(false)
    }
  }, [serverId])

  const prevServerIdRef = useRef(serverId)
  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true
      browsePath()
    } else if (prevServerIdRef.current !== serverId) {
      prevServerIdRef.current = serverId
      onChange('')
      browsePath()
    }
  }, [browsePath, serverId, onChange])

  // === 选中当前浏览的目录 ===
  const selectCurrentDir = useCallback(() => {
    if (currentPath) {
      onChange(currentPath)
    }
  }, [currentPath, onChange])

  // === 点击目录条目 → 仅导航 ===
  const handleDirClick = useCallback((entry: DirEntry) => {
    browsePath(entry.path)
  }, [browsePath])

  const breadcrumbSegments = currentPath ? currentPath.split('/').filter(Boolean) : []

  const handleBreadcrumbClick = useCallback((index: number) => {
    const targetPath = '/' + breadcrumbSegments.slice(0, index + 1).join('/')
    browsePath(targetPath)
  }, [breadcrumbSegments, browsePath])

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
      e.preventDefault()
      const trimmed = inputValue.trim()
      if (trimmed) {
        onChange(trimmed)
        browsePath(trimmed)
      }
    }
  }, [inputValue, browsePath, onChange])

  const isCurrentSelected = value === currentPath && value !== ''

  return (
    <div className="space-y-2">
      {/* 手动输入框 */}
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder ?? 'e.g., /Users/me/projects/my-repo'}
          className={cn(
            'w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none transition-colors pr-8',
            value
              ? 'border-emerald-300 bg-emerald-50/50 focus:border-emerald-400'
              : 'border-neutral-200 focus:border-neutral-400',
          )}
        />
        {value && (
          <Check
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500"
          />
        )}
      </div>

      {/* 提示文字 */}
      <p className="text-xs text-neutral-400">
        {t('Navigate to a folder below, then click "Select" — or type a path and press Enter')}
      </p>

      {/* 面包屑导航 + 选择按钮 */}
      <div className="flex items-center gap-1">
        <div className="flex-1 flex items-center gap-0.5 text-xs text-neutral-500 overflow-x-auto pb-0 scrollbar-none min-w-0">
          <button
            onClick={() => browsePath('/')}
            className="hover:text-neutral-900 transition-colors flex-shrink-0 px-1 py-0.5 rounded hover:bg-neutral-100"
          >
            /
          </button>
          {breadcrumbSegments.map((segment, i) => (
            <span key={i} className="flex items-center gap-0.5 flex-shrink-0">
              <ChevronRight size={10} className="text-neutral-300" />
              <button
                onClick={() => handleBreadcrumbClick(i)}
                className={cn(
                  'px-1 py-0.5 rounded transition-colors truncate max-w-[120px]',
                  i === breadcrumbSegments.length - 1
                    ? 'font-medium text-neutral-900'
                    : 'hover:text-neutral-900 hover:bg-neutral-100',
                )}
              >
                {segment}
              </button>
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={selectCurrentDir}
          disabled={!currentPath}
          className={cn(
            'flex-shrink-0 px-3 py-1 text-xs font-medium rounded-md transition-all',
            isCurrentSelected
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-neutral-900 text-white hover:bg-black',
          )}
        >
          {isCurrentSelected ? t('Selected') : t('Select')}
        </button>
      </div>

      {/* 目录列表 */}
      <div className="border border-neutral-200 rounded-lg overflow-hidden">
        <div className="max-h-[200px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-neutral-400">
              <Loader2 size={16} className="animate-spin mr-2" />
              <span className="text-xs">Loading...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-8 text-red-500 gap-2">
              <AlertCircle size={14} />
              <span className="text-xs">{error}</span>
            </div>
          ) : dirs.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-neutral-400">
              <span className="text-xs">No subdirectories</span>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {currentPath !== parentPath && (
                <li>
                  <button
                    onClick={() => browsePath(parentPath)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-neutral-50 transition-colors group"
                  >
                    <Folder size={14} className="text-neutral-400 flex-shrink-0" />
                    <span className="text-xs text-neutral-500 group-hover:text-neutral-700">..</span>
                  </button>
                </li>
              )}
              {dirs.map((entry) => (
                <li key={entry.path}>
                  <button
                    onClick={() => handleDirClick(entry)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors group hover:bg-neutral-50"
                  >
                    {entry.isGitRepo ? (
                      <FolderGit2 size={14} className="text-emerald-500 flex-shrink-0" />
                    ) : (
                      <Folder size={14} className="text-neutral-400 flex-shrink-0" />
                    )}
                    <span className="text-xs text-neutral-700 group-hover:text-neutral-900 truncate">
                      {entry.name}
                    </span>
                    {entry.isGitRepo && (
                      <span className="ml-auto flex-shrink-0 text-[10px] font-medium bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded">
                        Git
                      </span>
                    )}
                    {!entry.isGitRepo && (
                      <ChevronRight
                        size={12}
                        className="ml-auto text-neutral-300 group-hover:text-neutral-400 flex-shrink-0"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
