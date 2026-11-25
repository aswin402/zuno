// easeui.dev/components/motion/dropdown-menu
// Adapted zero-bloat for Zuno with exact EaseUI timing/easing ([0.23, 1, 0.32, 1],
// 150ms open / 100ms close), auto-flipping upward when room below is limited,
// full keyboard navigation, and theme-mapped Zuno popover & destructive tokens.

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
import { cn } from '@/lib/utils'

const EASE_CURVE = 'var(--dropdown-ease, cubic-bezier(0.22, 1, 0.36, 1))'
// Matches transitions.dev Menu dropdown: asymmetric 250ms open (0.97 -> 1), 150ms close (1 -> 0.99).
const OPEN_MS = 250
const CLOSE_MS = 150

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

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
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

  // A press anywhere outside the menu closes it.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
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
      onClick={() => m.setOpen(!m.open)}
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
  /** Which trigger edge the menu hangs from. Default "start". */
  align?: 'start' | 'end'
  /** Force opening above or below, or "auto" to flip upward when room below is limited. */
  side?: 'auto' | 'top' | 'bottom'
  /** Skip auto-focusing the first menu item (useful for non-item controls like volume slider). */
  autoFocusFirst?: boolean
  className?: string
  children: ReactNode
}

export function DropdownMenuContent({
  align = 'start',
  side = 'auto',
  autoFocusFirst = true,
  className,
  children,
}: DropdownMenuContentProps) {
  const m = useDropdownMenu('DropdownMenuContent')
  const { open, triggerRef, listRef } = m
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(open)
  const [placement, setPlacement] = useState<'top' | 'bottom'>(
    side === 'top' ? 'top' : 'bottom',
  )

  // Mount on open, keep mounted during the 100ms EaseUI exit transition, then clean up.
  useEffect(() => {
    if (open) {
      setMounted(true)
      const raf = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(raf)
    }
    setShown(false)
    if (!mounted) return
    const timer = window.setTimeout(
      () => setMounted(false),
      prefersReducedMotion() ? 0 : CLOSE_MS + 20,
    )
    return () => window.clearTimeout(timer)
  }, [open, mounted])

  // Open upward when there is not enough room below the trigger.
  useLayoutEffect(() => {
    if (!open || !mounted) return
    if (side === 'top' || side === 'bottom') {
      setPlacement(side)
      return
    }
    const trigger = triggerRef.current
    const list = listRef.current
    if (!trigger || !list) return
    const rect = trigger.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom
    setPlacement(
      below < list.offsetHeight + 16 && rect.top > below ? 'top' : 'bottom',
    )
  }, [open, mounted, side, triggerRef, listRef])

  useEffect(() => {
    if (!open || !mounted || !autoFocusFirst) return
    const raf = requestAnimationFrame(() => {
      enabledItems(listRef.current)[0]?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(raf)
  }, [open, mounted, autoFocusFirst, listRef])

  if (!mounted) return null

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      m.setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (event.key === 'Tab') {
      m.setOpen(false)
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

  const isTop = placement === 'top'
  const reduce = prefersReducedMotion()
  const durationMs = reduce ? 0 : open ? OPEN_MS : CLOSE_MS

  return (
    <div
      ref={listRef}
      id={m.listId}
      role="menu"
      aria-labelledby={m.triggerId}
      aria-hidden={!open}
      inert={!open}
      onKeyDown={onKeyDown}
      style={{
        transformOrigin: `${isTop ? 'bottom' : 'top'} ${align === 'end' ? 'right' : 'left'}`,
        pointerEvents: open ? 'auto' : 'none',
        opacity: shown ? 1 : 0,
        transform: reduce
          ? 'none'
          : shown
            ? 'scale(1)'
            : open
              ? 'scale(var(--dropdown-pre-scale, 0.97))'
              : 'scale(var(--dropdown-closing-scale, 0.99))',
        transition: `opacity ${durationMs}ms ${EASE_CURVE}, transform ${durationMs}ms ${EASE_CURVE}`,
      }}
      className={cn(
        'absolute z-40 flex min-w-44 max-w-[calc(100vw-2rem)] flex-col gap-0.5 rounded-xl bg-popover p-1 text-popover-foreground',
        'shadow-[0_0_0_1px_var(--border),0_14px_28px_-12px_rgb(0_0_0/0.42)]',
        isTop ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
        align === 'end' ? 'right-0' : 'left-0',
        className,
      )}
    >
      {children}
    </div>
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
      onClick={() => {
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
