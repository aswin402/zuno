import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { ZunoLogo } from '@/components/ZunoLogo'
import { UNKNOWN_ARTIST } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  isTauriRuntime,
  zunoWindow,
  type Track,
  type WindowResizeDir,
} from '@/lib/zunoApi'
import type { TitlebarAlignId, TitlebarStyleId } from '@/lib/appearance'

interface WindowTitlebarProps {
  styleVariant: TitlebarStyleId
  align: TitlebarAlignId
  showTrack: boolean
  compact: boolean
  currentTrack: Track | null
  isPlaying: boolean
  /** Preview mode used inside Customize Studio (disables OS window calls & resize borders). */
  preview?: boolean
  /** Notifies parent App shell when window maximizes/restores so rounded outer corners adapt. */
  onMaximizedChange?: (maximized: boolean) => void
  className?: string
}

const RESIZE_HANDLES: { dir: WindowResizeDir; className: string }[] = [
  { dir: 'n', className: 'fixed top-0 left-2 right-2 h-1 z-[70] cursor-n-resize' },
  { dir: 's', className: 'fixed bottom-0 left-2 right-2 h-1 z-[70] cursor-s-resize' },
  { dir: 'w', className: 'fixed top-2 bottom-2 left-0 w-1 z-[70] cursor-w-resize' },
  { dir: 'e', className: 'fixed top-2 bottom-2 right-0 w-1 z-[70] cursor-e-resize' },
  { dir: 'nw', className: 'fixed top-0 left-0 h-2.5 w-2.5 z-[75] cursor-nw-resize' },
  { dir: 'ne', className: 'fixed top-0 right-0 h-2.5 w-2.5 z-[75] cursor-ne-resize' },
  { dir: 'sw', className: 'fixed bottom-0 left-0 h-2.5 w-2.5 z-[75] cursor-sw-resize' },
  { dir: 'se', className: 'fixed bottom-0 right-0 h-2.5 w-2.5 z-[75] cursor-se-resize' },
]

/**
 * Custom theme-matched desktop window titlebar for Tauri v2 (frameless `decorations: false`).
 * Inherits Zuno's active 60/30/10 palette, supports drag-to-move, double-click maximize/restore,
 * edge resize handles, live now-playing center indicator, and 5 customizable control styles.
 */
export function WindowTitlebar({
  styleVariant,
  align,
  showTrack,
  compact,
  currentTrack,
  isPlaying,
  preview = false,
  onMaximizedChange,
  className,
}: WindowTitlebarProps) {
  const native = !preview && isTauriRuntime()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!native) return
    let active = true
    const sync = () => {
      zunoWindow.isMaximized().then((m) => {
        if (active) {
          setMaximized(m)
          onMaximizedChange?.(m)
        }
      })
    }
    sync()
    window.addEventListener('resize', sync)
    return () => {
      active = false
      window.removeEventListener('resize', sync)
    }
  }, [native, onMaximizedChange])

  if (!preview && !native) {
    return null
  }

  const handleDragMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    if (preview || e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (target?.closest('[data-window-control="true"]')) return
    if (e.detail === 2) {
      handleToggleMaximize()
    } else {
      zunoWindow.startDragging()
    }
  }

  const handleMinimize = () => {
    if (preview) return
    zunoWindow.minimize()
  }

  const handleToggleMaximize = () => {
    if (preview) {
      setMaximized((m) => !m)
      return
    }
    zunoWindow.toggleMaximize().then((m) => {
      setMaximized(m)
      onMaximizedChange?.(m)
    })
  }

  const handleClose = () => {
    if (preview) return
    zunoWindow.close()
  }

  const controls = renderControls({
    styleVariant,
    align,
    maximized,
    onMinimize: handleMinimize,
    onToggleMaximize: handleToggleMaximize,
    onClose: handleClose,
  })

  const brand = (
    <div className="pointer-events-none flex items-center gap-2">
      <ZunoLogo className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
      <span
        className={cn(
          'font-semibold tracking-tight text-foreground/90',
          compact ? 'text-[11.5px]' : 'text-xs',
        )}
      >
        Zuno
      </span>
    </div>
  )

  const trackLabel =
    showTrack && currentTrack
      ? currentTrack.artist && currentTrack.artist !== UNKNOWN_ARTIST
        ? `${currentTrack.title} · ${currentTrack.artist}`
        : currentTrack.title
      : null

  return (
    <>
      {/* Frameless edge & corner resize handles on Linux/Desktop when unmaximized */}
      {native &&
        !maximized &&
        RESIZE_HANDLES.map((h) => (
          <div
            key={h.dir}
            onMouseDown={(e) => {
              if (e.button !== 0) return
              e.preventDefault()
              zunoWindow.startResizeDragging(h.dir)
            }}
            className={h.className}
            aria-hidden="true"
          />
        ))}

      <header
        onMouseDown={handleDragMouseDown}
        className={cn(
          'relative z-[60] flex w-full shrink-0 select-none items-center justify-between border-b border-border/80 bg-card px-3 transition-colors',
          compact ? 'h-[30px]' : 'h-9',
          className,
        )}
      >
        {/* Left slot */}
        <div className="flex min-w-0 items-center gap-2">
          {align === 'left' ? controls : brand}
        </div>

        {/* Center live track status (or centered brand on macOS left-aligned controls) */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex max-w-[46%] -translate-x-1/2 -translate-y-1/2 items-center gap-2">
          {trackLabel ? (
            <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-0.5">
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  isPlaying ? 'bg-primary animate-pulse' : 'bg-muted-foreground/50',
                )}
              />
              <span className="truncate text-[11px] font-medium text-muted-foreground">
                {trackLabel}
              </span>
            </div>
          ) : align === 'left' ? (
            brand
          ) : null}
        </div>

        {/* Right slot */}
        <div className="flex min-w-0 items-center gap-2">
          {align === 'right' ? controls : null}
        </div>
      </header>
    </>
  )
}

type ControlKind = 'min' | 'max' | 'close'

const CONTROL_ORDER: Record<TitlebarAlignId, readonly ControlKind[]> = {
  left: ['close', 'min', 'max'],
  right: ['min', 'max', 'close'],
}

const ICON_CONTAINER_STYLES: Record<
  Exclude<TitlebarStyleId, 'macos' | 'dots'>,
  { wrapper: string; btn: string }
> = {
  geometric: {
    wrapper: 'flex items-center overflow-hidden rounded-md border border-border bg-background/70 divide-x divide-border',
    btn: 'h-6 w-7 rounded-none',
  },
  pill: {
    wrapper: 'flex items-center gap-0.5 rounded-full border border-border bg-background/75 px-1 py-0.5',
    btn: 'h-5 w-6 rounded-full',
  },
  minimal: {
    wrapper: 'flex items-center gap-1',
    btn: 'h-6 w-6 rounded-full',
  },
}

function renderControls({
  styleVariant,
  align,
  maximized,
  onMinimize,
  onToggleMaximize,
  onClose,
}: {
  styleVariant: TitlebarStyleId
  align: TitlebarAlignId
  maximized: boolean
  onMinimize: () => void
  onToggleMaximize: () => void
  onClose: () => void
}) {
  const order = CONTROL_ORDER[align]
  const handlers: Record<ControlKind, () => void> = {
    min: onMinimize,
    max: onToggleMaximize,
    close: onClose,
  }
  const labels: Record<ControlKind, string> = {
    min: 'Minimize',
    max: maximized ? 'Restore' : 'Maximize',
    close: 'Close',
  }

  // macOS Traffic Lights or Monochrome Dots
  if (styleVariant === 'macos' || styleVariant === 'dots') {
    const isColor = styleVariant === 'macos'
    const dotStyle: Record<ControlKind, { cls: string; glyph: string }> = {
      close: {
        cls: isColor
          ? 'bg-muted-foreground/35 group-hover/lights:bg-[#ff5f57] hover:brightness-95'
          : 'bg-muted-foreground/40 hover:bg-destructive',
        glyph: '×',
      },
      min: {
        cls: isColor
          ? 'bg-muted-foreground/35 group-hover/lights:bg-[#febc2e] hover:brightness-95'
          : 'bg-muted-foreground/40 hover:bg-foreground',
        glyph: '−',
      },
      max: {
        cls: isColor
          ? 'bg-muted-foreground/35 group-hover/lights:bg-[#28c840] hover:brightness-95'
          : 'bg-muted-foreground/40 hover:bg-primary',
        glyph: maximized ? '⤢' : '+',
      },
    }

    return (
      <div
        data-window-control="true"
        className="group/lights flex items-center gap-2 px-0.5"
      >
        {order.map((kind) => (
          <Tooltip key={kind} label={labels[kind]} side="bottom">
            <button
              type="button"
              data-window-control="true"
              onClick={handlers[kind]}
              aria-label={labels[kind]}
              className={cn(
                'flex h-3 w-3 items-center justify-center rounded-full text-[9px] font-bold leading-none text-transparent transition-all duration-150 group-hover/lights:text-black/75 cursor-pointer',
                dotStyle[kind].cls,
              )}
            >
              <span className="translate-y-[-0.5px]">{dotStyle[kind].glyph}</span>
            </button>
          </Tooltip>
        ))}
      </div>
    )
  }

  const style = ICON_CONTAINER_STYLES[styleVariant] ?? ICON_CONTAINER_STYLES.minimal
  const icons: Record<ControlKind, React.ReactNode> = {
    min: <Minus className="h-3 w-3" />,
    max: maximized ? <Copy className="h-2.5 w-2.5" /> : <Square className="h-2.5 w-2.5" />,
    close: <X className="h-3.5 w-3.5" />,
  }

  return (
    <div data-window-control="true" className={style.wrapper}>
      {order.map((kind) => (
        <Tooltip key={kind} label={labels[kind]} side="bottom">
          <button
            type="button"
            data-window-control="true"
            onClick={handlers[kind]}
            aria-label={labels[kind]}
            className={cn(
              'flex items-center justify-center text-muted-foreground transition-colors cursor-pointer',
              kind === 'close'
                ? 'hover:bg-destructive/15 hover:text-destructive'
                : 'hover:bg-secondary hover:text-foreground',
              style.btn,
            )}
          >
            {icons[kind]}
          </button>
        </Tooltip>
      ))}
    </div>
  )
}
