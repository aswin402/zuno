import { useState } from 'react'
import { FolderOpen, FolderPlus, HardDrive, RefreshCw, Unlink } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/tooltip'
import { formatError, shortenHomePath } from '@/lib/format'
import { cn } from '@/lib/utils'
import { isTauriRuntime, type MusicSource } from '@/lib/zunoApi'

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

/**
 * Zero-copy multi-directory Music Library Manager.
 * Lets users point Zuno to any existing folders (e.g. ~/Music) without copying audio files.
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
  const [error, setError] = useState<string | null>(null)
  const native = isTauriRuntime()

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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Music Folders"
      subtitle="Point Zuno directly to any folder on your system — zero copying, audio stays in place."
    >
      <div className="space-y-4">
        {/* Native Folder Picker + Quick Suggestions */}
        <div className="flex flex-wrap items-center gap-2">
          {native && (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setError(null)
                try {
                  await onPickNativeFolder()
                } catch (err) {
                  setError(formatError(err))
                }
              }}
              className="gap-1.5"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span>Browse Folder…</span>
            </Button>
          )}

          {availableSuggestions.map((dir) => (
            <button
              key={dir}
              type="button"
              disabled={busy}
              onClick={() => handleQuickAdd(dir)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-secondary/70 px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary cursor-pointer disabled:opacity-50"
            >
              <FolderOpen className="h-3.5 w-3.5 text-primary" />
              <span>+ Link {shortenHomePath(dir, homeDir)}</span>
            </button>
          ))}
        </div>

        {/* Manual Path Input (works on Desktop + Headless/Browser) */}
        <form onSubmit={handleSubmitPath} className="flex items-center gap-2">
          <Input
            value={manualPath}
            onChange={(e) => {
              setManualPath(e.target.value)
              if (error) setError(null)
            }}
            placeholder="~/Music or /path/to/songs"
            aria-label="Folder path"
            className="flex-1 font-mono text-xs"
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={busy || !manualPath.trim()}
          >
            Link
          </Button>
        </form>

        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {/* Active Library Sources List */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Connected Folders ({sources.length})
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRescan()}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3 w-3', busy && 'animate-spin')} />
              <span>Rescan</span>
            </button>
          </div>

          <div className="max-h-56 space-y-1.5 overflow-y-auto pr-0.5">
            {sources.map((src) => (
              <div
                key={src.path}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                    {src.is_default ? (
                      <HardDrive className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <FolderOpen className="h-3.5 w-3.5 text-primary" />
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
                    <p className="truncate font-mono text-[10.5px] text-muted-foreground">
                      {shortenHomePath(src.path, homeDir)}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums font-mono text-[11px] text-muted-foreground">
                    {src.track_count} {src.track_count === 1 ? 'song' : 'songs'}
                  </span>
                  {!src.is_default && (
                    <Tooltip label="Unlink folder (keeps all files on disk)" side="top">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onRemoveFolder(src.path)}
                        aria-label={`Unlink ${src.label}`}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive cursor-pointer disabled:opacity-50"
                      >
                        <Unlink className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Unlinking a folder only removes it from Zuno — your audio files and playlists are never deleted.
        </p>
      </div>
    </Dialog>
  )
}
