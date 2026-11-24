import { cn } from '@/lib/utils'

interface ZunoLogoProps {
  className?: string
}

/**
 * Minimalist monochrome Zuno emblem: four stepped acoustic bars forming a
 * Play silhouette inside a precision squircle tile.
 */
export function ZunoLogo({ className }: ZunoLogoProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={cn('h-5 w-5 shrink-0', className)}
    >
      <rect
        x="16"
        y="16"
        width="480"
        height="480"
        rx="116"
        fill="#09090b"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="12"
      />
      <g fill="#fafafa">
        <rect x="148" y="140" width="38" height="232" rx="19" />
        <rect x="214" y="170" width="38" height="172" rx="19" />
        <rect x="280" y="201" width="38" height="110" rx="19" />
        <rect x="346" y="232" width="38" height="48" rx="19" />
      </g>
    </svg>
  )
}
