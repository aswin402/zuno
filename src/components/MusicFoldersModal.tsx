import { useState } from 'react'
import { FolderOpen, FolderPlus, HardDrive, Plus, RefreshCw, Terminal, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/tooltip'
import { formatError, shortenHomePath } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getAndroidBridge, isTauriRuntime, type MusicSource } from '@/lib/zunoApi'

interface MusicFoldersModalProps {
  open: boolean
  sources: MusicSource[]
  suggestedDirs: string[]
  homeDir?: string | null
  busy?: boolean
  onClose: () => void
  onPickNativeFolder: () => Promise<void>
  onAddFolder: (path: string) => Promise<void>
  onRemoveFolder: (path: string) => Promise<void>
  onRescan: () => Promise<void>
}

function formatShortFolderPath(path: string, homeDir?: string | null): string {
  if (path === '/storage/emulated/0') return 'Internal'
  if (path.startsWith('/storage/emulated/0/')) {
    return `Internal/${path.slice('/storage/emulated/0/'.length)}`
  }
  const sdMatch = /^\/storage\/([^/]+)(\/(.*))?$/.exec(path)
  if (sdMatch) {
    return sdMatch[3] ? `${sdMatch[1]}/${sdMatch[3]}` : sdMatch[1]
  }
  return shortenHomePath(path, homeDir)
}

function suggestionChipLabel(path: string, homeDir?: string | null): string {
  const short = formatShortFolderPath(path, homeDir)
  const parts = short.split('/').filter(Boolean)
  return parts[parts.length - 1] || short
}

/**
 * Minimal zero-copy Music Folders manager for Mobile & Desktop.
 */
export function MusicFoldersModal({
  open,
  sources,
  suggestedDirs,
  homeDir,
  busy = false,
  onClose,
  onPickNativeFolder,
  onAddFolder,
  onRemoveFolder,
  onRescan,
}: MusicFoldersModalProps) {
  const [manualPath, setManualPath] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const native = isTauriRuntime() || Boolean(getAndroidBridge()?.pickMusicFolder)

  const linkedSet = new Set(sources.map((s) => s.path))
  const availableSuggestions = suggestedDirs.filter((d) => !linkedSet.has(d))

  async function handleSubmitPath(e: React.FormEvent) {
    e.preventDefault()
    const clean = manualPath.trim()
    if (!clean) return
    setError(null)
    try {
      await onAddFolder(clean)
      setManualPath('')
      setShowManual(false)
    } catch (err) {
      setError(formatError(err))
    }
  }

  async function handleQuickAdd(dir: string) {
    setError(null)
    try {
      await onAddFolder(dir)
    } catch (err) {
      setError(formatError(err))
    }
  }

  async function handleBrowse() {
    if (busy || picking) return
    setError(null)
    setPicking(true)
    try {
      await onPickNativeFolder()
    } catch (err) {
      setError(formatError(err))
    } finally {
      setPicking(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Music Folders">
      <div className="space-y-4">
        {/* Primary Actions: Browse Folder + Collapsible Path Input */}
        <div className="flex items-center gap-2">
          {native && (
            <Button
              type="button"
              size="sm"
              disabled={busy || picking}
              onClick={handleBrowse}
              className="h-9 flex-1 gap-2 rounded-xl sm:flex-none sm:px-4"
            >
              <FolderPlus className="h-4 w-4" />
              <span>{picking ? 'Opening…' : 'Browse Folder'}</span>
            </Button>
          )}

          {native && (
            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              aria-expanded={showManual}
              className={cn(
                't-press inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors cursor-pointer',
                showManual
                  ? 'border-primary bg-secondary text-foreground'
                  : 'border-border bg-background/60 text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Path</span>
            </button>
          )}
        </div>

        {/* Manual Path Input (shown when toggled or on non-native web) */}
        {(showManual || !native) && (
          <form onSubmit={handleSubmitPath} className="flex items-center gap-2">
            <Input
              value={manualPath}
              onChange={(e) => {
                setManualPath(e.target.value)
                if (error) setError(null)
              }}
              placeholder="~/Music or /path"
              aria-label="Folder path"
              autoFocus={showManual}
              className="h-9 flex-1 rounded-xl font-mono text-xs"
            />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={busy || !manualPath.trim()}
              className="h-9 rounded-xl px-3.5"
            >
              Add
            </Button>
          </form>
        )}

        {/* Quick-Add Suggestions */}
        {availableSuggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {availableSuggestions.map((dir) => (
              <button
                key={dir}
                type="button"
                disabled={busy}
                title={formatShortFolderPath(dir, homeDir)}
                onClick={() => handleQuickAdd(dir)}
                className="t-press inline-flex h-7 items-center gap-1 rounded-full border border-border bg-secondary/60 px-2.5 text-[11.5px] font-medium text-foreground transition-colors hover:bg-secondary cursor-pointer disabled:opacity-50"
              >
                <Plus className="h-3 w-3 text-primary" />
                <span>{suggestionChipLabel(dir, homeDir)}</span>
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {/* Linked Folders List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
              Linked · {sources.length}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRescan()}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3 w-3', busy && 'animate-spin')} />
              <span>Rescan</span>
            </button>
          </div>

          <div className="max-h-60 divide-y divide-border/70 overflow-y-auto rounded-2xl border border-border bg-background/50">
            {sources.map((src) => (
              <div
                key={src.path}
                className="flex items-center justify-between gap-2.5 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                    {src.is_default ? (
                      <HardDrive className="h-3.5 w-3.5" />
                    ) : (
                      <FolderOpen className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-foreground">
                        {src.label}
                      </span>
                      {src.is_default && (
                        <span className="rounded-full bg-secondary px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground">
                          Default
                        </span>
                      )}
                      {!src.exists && (
                        <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 font-mono text-[9.5px] text-destructive">
                          Offline
                        </span>
                      )}
                    </div>
                    <p className="truncate font-mono text-[10.5px] text-muted-foreground/80">
                      {formatShortFolderPath(src.path, homeDir)}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="tabular-nums font-mono text-[11px] text-muted-foreground">
                    {src.track_count}
                  </span>
                  {!src.is_default && (
                    <Tooltip label="Remove folder" side="top">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onRemoveFolder(src.path)}
                        aria-label={`Remove ${src.label}`}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive cursor-pointer disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
