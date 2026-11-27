// easeui.dev/components/motion/dropdown-menu
// Adapted zero-bloat for Zuno with exact EaseUI timing/easing ([0.23, 1, 0.32, 1],
// portaled fixed positioning (immune to row CSS stacking contexts / contain / blur animations),
// auto-flipping across top/bottom/right/left edges, full keyboard navigation, and Zuno tokens.

import {
  type ButtonHTMLAttributes,
  createContext,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { prefersReducedMotion } from '@/lib/format'
import { cn } from '@/lib/utils'

const EASE_CURVE = 'var(--dropdown-ease, cubic-bezier(0.22, 1, 0.36, 1))'
// Matches transitions.dev Menu dropdown: asymmetric 250ms open (0.97 -> 1), 150ms close (1 -> 0.99).
const OPEN_MS = 250
const CLOSE_MS = 150
const VIEWPORT_PAD = 10
const SIDE_GAP = 6

interface DropdownMenuContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  triggerRef: RefObject<HTMLButtonElement | null>
  listRef: RefObject<HTMLDivElement | null>
  triggerId: string
  listId: string
}

const DropdownMenuContext = createContext<DropdownMenuContextValue | null>(null)

function useDropdownMenu(part: string) {
  const ctx = useContext(DropdownMenuContext)
  if (!ctx) throw new Error(`${part} must be used inside <DropdownMenu>`)
  return ctx
}

function enabledItems(list: HTMLElement | null) {
  return Array.from(
    list?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
  )
}

export interface DropdownMenuProps {
  /** Controlled open state. */
  open?: boolean
  /** Initial open state when uncontrolled. Default false. */
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  children: ReactNode
}

export function DropdownMenu({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  className,
  children,
}: DropdownMenuProps) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [innerOpen, setInnerOpen] = useState(defaultOpen)
  const open = openProp ?? innerOpen

  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setInnerOpen(next)
      onOpenChange?.(next)
    },
    [openProp, onOpenChange],
  )

  // A press anywhere outside the trigger AND portaled menu closes it.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (rootRef.current?.contains(target)) return
      if (listRef.current?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, setOpen])

  const ctx = useMemo<DropdownMenuContextValue>(
    () => ({
      open,
      setOpen,
      triggerRef,
      listRef,
      triggerId: `${id}-trigger`,
      listId: `${id}-menu`,
    }),
    [open, setOpen, id],
  )

  return (
    <DropdownMenuContext.Provider value={ctx}>
      <div ref={rootRef} className={cn('relative inline-flex items-center', className)}>
        {children}
      </div>
    </DropdownMenuContext.Provider>
  )
}

export type DropdownMenuTriggerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'id' | 'onClick' | 'onKeyDown'
> & {
  /** Skip default 36px circular icon-button styling when using a custom pill trigger. */
  unstyled?: boolean
}

export function DropdownMenuTrigger({
  className,
  unstyled = false,
  children,
  ...props
}: DropdownMenuTriggerProps) {
  const m = useDropdownMenu('DropdownMenuTrigger')

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      m.setOpen(true)
    }
  }

  return (
    <button
      ref={m.triggerRef}
      type="button"
      id={m.triggerId}
      aria-haspopup="menu"
      aria-expanded={m.open}
      aria-controls={m.listId}
      onClick={(e) => {
        e.stopPropagation()
        m.setOpen(!m.open)
      }}
      onKeyDown={onKeyDown}
      className={cn(
        !unstyled &&
          'relative inline-flex h-9 w-9 touch-manipulation items-center justify-center rounded-full text-muted-foreground outline-none after:absolute after:-inset-1 transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export interface DropdownMenuContentProps {
  /** Which trigger edge the menu hangs from (for top/bottom placement). Default "start". */
  align?: 'start' | 'end'
  /** Preferred side relative to trigger: auto (top/bottom), top, bottom, right, or left. */
  side?: 'auto' | 'top' | 'bottom' | 'right' | 'left'
  /** Skip auto-focusing the first menu item (useful for non-item controls). */
  autoFocusFirst?: boolean
  className?: string
  children: ReactNode
}

interface FloatingPos {
  top: number
  left: number
  origin: string
}

function clamp(n: number, min: number, max: number) {
  if (max < min) return min
  return Math.max(min, Math.min(max, n))
}

export function DropdownMenuContent({
  align = 'start',
  side = 'auto',
  autoFocusFirst = true,
  className,
  children,
}: DropdownMenuContentProps) {
  const m = useDropdownMenu('DropdownMenuContent')
  const { open, setOpen, triggerRef, listRef } = m
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(open)
  const [pos, setPos] = useState<FloatingPos | null>(null)

  // Mount on open, keep mounted during the exit transition, then clean up.
  useEffect(() => {
    if (open) {
      setMounted(true)
      const raf = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(raf)
    }
    setShown(false)
    if (!mounted) return
    const timer = window.setTimeout(
      () => {
        setMounted(false)
        setPos(null)
      },
      prefersReducedMotion() ? 0 : CLOSE_MS + 20,
    )
    return () => window.clearTimeout(timer)
  }, [open, mounted])

  const computePosition = useCallback(() => {
    const trigger = triggerRef.current
    const list = listRef.current
    if (!trigger || !list) return

    const rect = trigger.getBoundingClientRect()
    const menuW = list.offsetWidth || 208
    const menuH = list.offsetHeight || 96
    const vw = window.innerWidth
    const vh = window.innerHeight

    let left = VIEWPORT_PAD
    let top = VIEWPORT_PAD
    let origin = 'top left'

    if (side === 'right' || side === 'left') {
      const fitsRight = rect.right + SIDE_GAP + menuW <= vw - VIEWPORT_PAD
      const fitsLeft = rect.left - SIDE_GAP - menuW >= VIEWPORT_PAD

      if (side === 'right' && fitsRight) {
        left = rect.right + SIDE_GAP
        top = clamp(rect.top - 4, VIEWPORT_PAD, vh - menuH - VIEWPORT_PAD)
        origin = 'top left'
      } else if ((side === 'left' && fitsLeft) || (side === 'right' && fitsLeft)) {
        // When near the right viewport edge, open beside the trigger on its left so it stays
        // on the right side of the row without covering tracks underneath or clipping off-screen.
        left = rect.left - SIDE_GAP - menuW
        top = clamp(rect.top - 4, VIEWPORT_PAD, vh - menuH - VIEWPORT_PAD)
        origin = 'top right'
      } else if (fitsRight) {
        left = rect.right + SIDE_GAP
        top = clamp(rect.top - 4, VIEWPORT_PAD, vh - menuH - VIEWPORT_PAD)
        origin = 'top left'
      } else {
        // Narrow screen fallback: right-aligned above or below the trigger.
        const below = vh - rect.bottom
        const placeTop = below < menuH + SIDE_GAP + VIEWPORT_PAD && rect.top > below
        left = clamp(rect.right - menuW, VIEWPORT_PAD, vw - menuW - VIEWPORT_PAD)
        top = placeTop
          ? Math.max(VIEWPORT_PAD, rect.top - SIDE_GAP - menuH)
          : Math.min(vh - menuH - VIEWPORT_PAD, rect.bottom + SIDE_GAP)
        origin = `${placeTop ? 'bottom' : 'top'} right`
      }
    } else {
      const below = vh - rect.bottom
      const placeTop =
        side === 'top'
          ? true
          : side === 'bottom'
            ? false
            : below < menuH + SIDE_GAP + VIEWPORT_PAD && rect.top > below
      const rawLeft = align === 'end' ? rect.right - menuW : rect.left
      left = clamp(rawLeft, VIEWPORT_PAD, vw - menuW - VIEWPORT_PAD)
      top = placeTop
        ? Math.max(VIEWPORT_PAD, rect.top - SIDE_GAP - menuH)
        : Math.min(vh - menuH - VIEWPORT_PAD, rect.bottom + SIDE_GAP)
      origin = `${placeTop ? 'bottom' : 'top'} ${align === 'end' ? 'right' : 'left'}`
    }

    setPos((prev) =>
      prev &&
      Math.abs(prev.top - top) < 0.5 &&
      Math.abs(prev.left - left) < 0.5 &&
      prev.origin === origin
        ? prev
        : { top, left, origin },
    )
  }, [align, side, triggerRef, listRef])

  useLayoutEffect(() => {
    if (!open || !mounted) return
    computePosition()

    const list = listRef.current
    const ro =
      typeof ResizeObserver !== 'undefined' && list
        ? new ResizeObserver(() => computePosition())
        : null
    if (list && ro) ro.observe(list)

    const onResize = () => computePosition()
    const onScroll = (event: Event) => {
      const target = event.target as Node | null
      // Allow scrolling inside a long playlist submenu without closing the menu.
      if (target && listRef.current?.contains(target)) return
      setOpen(false)
    }

    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, mounted, computePosition, listRef, setOpen])

  useEffect(() => {
    if (!open || !mounted || !autoFocusFirst) return
    const raf = requestAnimationFrame(() => {
      enabledItems(listRef.current)[0]?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(raf)
  }, [open, mounted, autoFocusFirst, listRef])

  if (!mounted || typeof document === 'undefined') return null

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    const items = enabledItems(listRef.current)
    if (items.length === 0) return
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      event.key === 'ArrowDown'
        ? index + 1
        : event.key === 'ArrowUp'
          ? index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : null
    if (next === null) return
    event.preventDefault()
    items[(next + items.length) % items.length].focus()
  }

  const reduce = prefersReducedMotion()
  const durationMs = reduce ? 0 : open ? OPEN_MS : CLOSE_MS
  const ready = pos !== null

  return createPortal(
    <div
      ref={listRef}
      id={m.listId}
      role="menu"
      aria-labelledby={m.triggerId}
      aria-hidden={!open}
      inert={!open}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
      style={{
        position: 'fixed',
        top: pos ? `${pos.top}px` : '-9999px',
        left: pos ? `${pos.left}px` : '-9999px',
        zIndex: 9999,
        transformOrigin: pos?.origin ?? 'top right',
        pointerEvents: open && ready ? 'auto' : 'none',
        opacity: shown && ready ? 1 : 0,
        transform: reduce
          ? 'none'
          : shown && ready
            ? 'scale(1)'
            : open
              ? 'scale(var(--dropdown-pre-scale, 0.97))'
              : 'scale(var(--dropdown-closing-scale, 0.99))',
        transition: ready
          ? `opacity ${durationMs}ms ${EASE_CURVE}, transform ${durationMs}ms ${EASE_CURVE}`
          : 'none',
      }}
      className={cn(
        'flex min-w-44 max-w-[calc(100vw-1.5rem)] flex-col gap-0.5 rounded-xl bg-popover p-1 text-popover-foreground',
        'shadow-[0_0_0_1px_var(--border),0_14px_28px_-12px_rgb(0_0_0/0.55)]',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  )
}

export interface DropdownMenuItemProps {
  onSelect?: () => void
  disabled?: boolean
  /** Styles the item for a destructive action, such as Delete. Default false. */
  destructive?: boolean
  /** Keep the dropdown open after selecting (e.g., opening a sub-view or toggling a state). */
  keepOpen?: boolean
  className?: string
  children: ReactNode
}

export function DropdownMenuItem({
  onSelect,
  disabled = false,
  destructive = false,
  keepOpen = false,
  className,
  children,
}: DropdownMenuItemProps) {
  const m = useDropdownMenu('DropdownMenuItem')

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      tabIndex={-1}
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.()
        if (!keepOpen) {
          m.setOpen(false)
          m.triggerRef.current?.focus()
        }
      }}
      className={cn(
        't-press flex min-h-9 w-full touch-manipulation items-center gap-2 rounded-lg px-2.5 text-left text-xs font-medium outline-none cursor-pointer',
        destructive
          ? 'text-destructive hover:bg-destructive/10 focus:bg-destructive/10'
          : 'text-popover-foreground hover:bg-secondary focus:bg-secondary',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function DropdownMenuLabel({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <hr className={cn('-mx-1 my-1 border-0 border-t border-border/80', className)} />
}
