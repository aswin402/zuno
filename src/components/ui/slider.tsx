import { cn } from '@/lib/utils'

interface SliderProps {
  value: number
  min?: number
  max: number
  step?: number
  onChange: (value: number) => void
  onCommit?: (value: number) => void
  className?: string
  ariaLabel?: string
  alwaysShowThumb?: boolean
}

export function Slider({
  value,
  min = 0,
  max,
  step = 0.01,
  onChange,
  onCommit,
  className,
  ariaLabel,
  alwaysShowThumb = false,
}: SliderProps) {
  const safeMax = max > min ? max : 1
  const clamped = Math.min(Math.max(value, min), safeMax)
  const pct = ((clamped - min) / (safeMax - min)) * 100

  return (
    <div className={cn('relative flex h-5 w-full items-center group', className)}>
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-accent">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-75"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        className={cn(
          'pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow-md transition-transform group-hover:scale-110',
          alwaysShowThumb ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        style={{ left: `${pct}%` }}
      />
      <input
        type="range"
        aria-label={ariaLabel}
        min={min}
        max={safeMax}
        step={step}
        value={clamped}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  )
}
