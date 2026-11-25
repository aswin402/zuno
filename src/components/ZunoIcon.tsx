import {
  Clock,
  Folder,
  Heart,
  ListMusic,
  Moon,
  Music,
  Palette,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersVertical,
  Sun,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { IconPackId } from '@/lib/appearance'

export type ZunoIconName =
  | 'music'
  | 'search'
  | 'heart'
  | 'clock'
  | 'equalizer'
  | 'customize'
  | 'playlist'
  | 'play'
  | 'pause'
  | 'prev'
  | 'next'
  | 'shuffle'
  | 'repeat'
  | 'repeat1'
  | 'volume'
  | 'mute'
  | 'refresh'
  | 'plus'
  | 'sun'
  | 'moon'
  | 'folder'
  | 'trash'
  | 'radio'

interface ZunoIconProps {
  name: ZunoIconName
  pack?: IconPackId
  className?: string
  filled?: boolean
}

const LUCIDE_MAP: Record<ZunoIconName, typeof Music> = {
  music: Music,
  search: Search,
  heart: Heart,
  clock: Clock,
  equalizer: SlidersVertical,
  customize: Palette,
  playlist: ListMusic,
  play: Play,
  pause: Pause,
  prev: SkipBack,
  next: SkipForward,
  shuffle: Shuffle,
  repeat: Repeat,
  repeat1: Repeat1,
  volume: Volume2,
  mute: VolumeX,
  refresh: RefreshCw,
  plus: Plus,
  sun: Sun,
  moon: Moon,
  folder: Folder,
  trash: Trash2,
  radio: Radio,
}

/**
 * Multi-pack icon renderer supporting Lucide, Tabler, Iconsax, Hugeicons Animated,
 * and ItsHover Animated with zero heavy third-party icon bundle overhead.
 */
export function ZunoIcon({
  name,
  pack = 'lucide',
  className,
  filled = false,
}: ZunoIconProps) {
  const animClass =
    pack === 'skiper99'
      ? 'zuno-pack-skiper99'
      : pack === 'hugeicons'
        ? 'zuno-pack-hugeicons'
        : pack === 'itshover'
          ? 'zuno-pack-itshover'
          : pack === 'pulsoicon'
            ? 'zuno-pack-pulso'
            : ''

  if (pack === 'skiper99') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn('zuno-icon', animClass, className)}
        aria-hidden="true"
      >
        {renderSkiper99Path(name, filled)}
      </svg>
    )
  }

  if (pack === 'lucide' || pack === 'itshover' || pack === 'pulsoicon') {
    const Icon = LUCIDE_MAP[name]
    return (
      <Icon
        className={cn(
          'zuno-icon',
          animClass,
          filled && 'fill-current',
          className,
        )}
      />
    )
  }

  // Tabler, Iconsax (duotone), Hugeicons Animated, Humbleicons (crisp minimal), Majesticons (confident bold)
  const duotone = pack === 'iconsax'
  const boldMajestic = pack === 'majesticons'
  const roundedCap =
    pack === 'tabler' ||
    pack === 'iconsax' ||
    pack === 'hugeicons' ||
    pack === 'humbleicons' ||
    pack === 'majesticons'

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap={roundedCap ? 'round' : 'butt'}
      strokeLinejoin="round"
      style={
        boldMajestic
          ? { strokeWidth: 'calc(var(--zuno-icon-stroke, 1.75) * 1.2)' }
          : pack === 'humbleicons'
            ? { strokeWidth: 'calc(var(--zuno-icon-stroke, 1.75) * 0.92)' }
            : undefined
      }
      className={cn('zuno-icon', animClass, className)}
      aria-hidden="true"
    >
      {renderCustomPath(name, pack === 'humbleicons' || pack === 'majesticons' ? 'tabler' : pack, duotone, filled)}
    </svg>
  )
}

function renderCustomPath(
  name: ZunoIconName,
  pack: IconPackId,
  duotone: boolean,
  filled: boolean,
) {
  switch (name) {
    case 'music':
      return pack === 'tabler' ? (
        <>
          <circle cx="6" cy="17" r="3" />
          <circle cx="16" cy="17" r="3" />
          <path d="M9 17V4l10-1v14" />
          <path d="M9 8h10" />
        </>
      ) : (
        <>
          <circle
            cx="6.5"
            cy="17.5"
            r="3"
            fill={duotone ? 'currentColor' : 'none'}
            fillOpacity={duotone ? 0.16 : 0}
          />
          <circle
            cx="17.5"
            cy="15.5"
            r="3"
            fill={duotone ? 'currentColor' : 'none'}
            fillOpacity={duotone ? 0.16 : 0}
          />
          <path d="M9.5 17.5V6.6c0-1.2.8-2.2 2-2.5l6.8-1.5c1.2-.3 2.2.6 2.2 1.8v11.1" />
          <path d="M9.5 10.2l11-2.4" />
        </>
      )

    case 'search':
      return pack === 'tabler' ? (
        <>
          <circle cx="10" cy="10" r="7" />
          <path d="M21 21l-6-6" />
        </>
      ) : (
        <>
          <circle
            cx="11"
            cy="11"
            r="7.5"
            fill={duotone ? 'currentColor' : 'none'}
            fillOpacity={duotone ? 0.12 : 0}
          />
          <path d="M20.5 20.5l-3.8-3.8" />
        </>
      )

    case 'heart':
      return (
        <path
          d="M12 20.4c-.4 0-.8-.1-1.1-.3C6.2 17.1 3 13.8 3 9.4 3 6.2 5.4 4 8.3 4c1.6 0 3 .8 3.7 2 .7-1.2 2.1-2 3.7-2 2.9 0 5.3 2.2 5.3 5.4 0 4.4-3.2 7.7-7.9 10.7-.3.2-.7.3-1.1.3z"
          fill={filled ? 'currentColor' : duotone ? 'currentColor' : 'none'}
          fillOpacity={filled ? 1 : duotone ? 0.14 : 0}
        />
      )

    case 'clock':
      return (
        <>
          <circle
            cx="12"
            cy="12"
            r="8.5"
            fill={duotone ? 'currentColor' : 'none'}
            fillOpacity={duotone ? 0.14 : 0}
          />
          <path d="M12 7.5V12l3 2" />
        </>
      )

    case 'equalizer':
      return pack === 'tabler' ? (
        <>
          <circle cx="6" cy="14" r="2" />
          <path d="M6 4v8M6 16v4" />
          <circle cx="12" cy="8" r="2" />
          <path d="M12 4v2M12 10v10" />
          <circle cx="18" cy="15" r="2" />
          <path d="M18 4v9M18 17v3" />
        </>
      ) : (
        <>
          <path d="M6 4v7.5M6 16.5V20M12 4v2.5M12 11.5V20M18 4v8.5M18 17.5V20" />
          <circle
            cx="6"
            cy="14"
            r="2.2"
            fill={duotone ? 'currentColor' : 'none'}
            fillOpacity={duotone ? 0.2 : 0}
          />
          <circle
            cx="12"
            cy="9"
            r="2.2"
            fill={duotone ? 'currentColor' : 'none'}
            fillOpacity={duotone ? 0.2 : 0}
          />
          <circle
            cx="18"
            cy="15"
            r="2.2"
            fill={duotone ? 'currentColor' : 'none'}
            fillOpacity={duotone ? 0.2 : 0}
          />
        </>
      )

    case 'customize':
      return pack === 'tabler' ? (
        <>
          <path d="M12 21a9 9 0 0 1 0-18c4.97 0 9 3.58 9 8 0 1.06-.47 2.08-1.32 2.83S17.69 15 16.5 15H14a2 2 0 0 0-1 3.75A1.3 1.3 0 0 1 12 21Z" />
          <circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="16.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
        </>
      ) : (
        <>
          <path
            d="M12 21a9 9 0 0 1 0-18c4.97 0 9 3.58 9 8 0 1.06-.47 2.08-1.32 2.83S17.69 15 16.5 15H14a2 2 0 0 0-1 3.75A1.3 1.3 0 0 1 12 21Z"
            fill={duotone ? 'currentColor' : 'none'}
            fillOpacity={duotone ? 0.14 : 0}
          />
          <circle cx="7.5" cy="10.5" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="12" cy="7.5" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="16.5" cy="10.5" r="1.15" fill="currentColor" stroke="none" />
        </>
      )

    case 'playlist':
      return (
        <>
          <path d="M4 6h12M4 11h10M4 16h7" />
          <circle
            cx="17.5"
            cy="16.5"
            r="2.5"
            fill={duotone ? 'currentColor' : 'none'}
            fillOpacity={duotone ? 0.18 : 0}
          />
          <path d="M20 16.5V9.5l-3 1" />
        </>
      )

    case 'play':
      return (
        <path
          d="M7 5.6c0-1.1 1.2-1.8 2.1-1.2l10.2 6.4c.9.5.9 1.9 0 2.4L9.1 19.6c-.9.6-2.1-.1-2.1-1.2V5.6z"
          fill={filled || duotone ? 'currentColor' : 'none'}
          fillOpacity={filled ? 1 : duotone ? 0.22 : 0}
        />
      )

    case 'pause':
      return (
        <>
          <rect
            x="6"
            y="5"
            width="4.2"
            height="14"
            rx="1.6"
            fill={filled || duotone ? 'currentColor' : 'none'}
            fillOpacity={filled ? 1 : duotone ? 0.22 : 0}
          />
          <rect
            x="13.8"
            y="5"
            width="4.2"
            height="14"
            rx="1.6"
            fill={filled || duotone ? 'currentColor' : 'none'}
            fillOpacity={filled ? 1 : duotone ? 0.22 : 0}
          />
        </>
      )

    case 'prev':
      return (
        <>
          <path d="M6 6v12" />
          <path
            d="M18 6.5L10.5 12l7.5 5.5V6.5z"
            fill={filled || duotone ? 'currentColor' : 'none'}
            fillOpacity={filled ? 1 : duotone ? 0.2 : 0}
          />
        </>
      )

    case 'next':
      return (
        <>
          <path d="M18 6v12" />
          <path
            d="M6 6.5L13.5 12 6 17.5V6.5z"
            fill={filled || duotone ? 'currentColor' : 'none'}
            fillOpacity={filled ? 1 : duotone ? 0.2 : 0}
          />
        </>
      )

    case 'shuffle':
      return (
        <>
          <path d="M3 17h3.2c1.2 0 2.3-.6 3-1.6l4.6-6.8c.7-1 1.8-1.6 3-1.6H21" />
          <path d="M18 4l3 3-3 3" />
          <path d="M3 7h3.2c1 0 2 .4 2.7 1.2M13.5 15.2c.8 1.1 2 1.8 3.3 1.8H21" />
          <path d="M18 14l3 3-3 3" />
        </>
      )

    case 'repeat':
      return (
        <>
          <path d="M17 3l3 3-3 3" />
          <path d="M4 11V9a3 3 0 013-3h13" />
          <path d="M7 21l-3-3 3-3" />
          <path d="M20 13v2a3 3 0 01-3 3H4" />
        </>
      )

    case 'repeat1':
      return (
        <>
          <path d="M17 3l3 3-3 3" />
          <path d="M4 11V9a3 3 0 013-3h13" />
          <path d="M7 21l-3-3 3-3" />
          <path d="M20 13v2a3 3 0 01-3 3H4" />
          <path d="M12 9.5v5M10.8 10.7L12 9.5" />
        </>
      )

    case 'volume':
      return (
        <>
          <path
            d="M5 9.5h3.5l4.5-4v13l-4.5-4H5a1.5 1.5 0 01-1.5-1.5v-2A1.5 1.5 0 015 9.5z"
            fill={duotone ? 'currentColor' : 'none'}
            fillOpacity={duotone ? 0.16 : 0}
          />
          <path d="M16.5 9a4.2 4.2 0 010 6" />
          <path d="M19.2 6.5a7.8 7.8 0 010 11" />
        </>
      )

    case 'mute':
      return (
        <>
          <path
            d="M5 9.5h3.5l4.5-4v13l-4.5-4H5a1.5 1.5 0 01-1.5-1.5v-2A1.5 1.5 0 015 9.5z"
            fill={duotone ? 'currentColor' : 'none'}
            fillOpacity={duotone ? 0.16 : 0}
          />
          <path d="M16.5 9.5l4 5M20.5 9.5l-4 5" />
        </>
      )

    case 'refresh':
      return (
        <>
          <path d="M20 11a8 8 0 00-14.2-4.8L4 8" />
          <path d="M4 4v4h4" />
          <path d="M4 13a8 8 0 0014.2 4.8L20 16" />
          <path d="M20 20v-4h-4" />
        </>
      )

    case 'plus':
      return <path d="M12 5v14M5 12h14" />

    case 'sun':
      return (
        <>
          <circle
            cx="12"
            cy="12"
            r="4"
            fill={duotone ? 'currentColor' : 'none'}
            fillOpacity={duotone ? 0.2 : 0}
          />
          <path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
        </>
      )

    case 'moon':
      return (
        <path
          d="M20 14.5A8 8 0 019.5 4a8.2 8.2 0 1010.5 10.5z"
          fill={duotone ? 'currentColor' : 'none'}
          fillOpacity={duotone ? 0.18 : 0}
        />
      )

    case 'folder':
      return (
        <path
          d="M3.5 7.5A2.5 2.5 0 016 5h3.5l2 2.2H18A2.5 2.5 0 0120.5 9.7v7.8A2.5 2.5 0 0118 20H6a2.5 2.5 0 01-2.5-2.5v-10z"
          fill={duotone ? 'currentColor' : 'none'}
          fillOpacity={duotone ? 0.14 : 0}
        />
      )

    case 'trash':
      return (
        <>
          <path d="M4.5 7h15" />
          <path d="M9.5 7V5a1.5 1.5 0 011.5-1.5h2A1.5 1.5 0 0114.5 5v2" />
          <path
            d="M6.5 7l1 12.2a2 2 0 002 1.8h5a2 2 0 002-1.8L17.5 7"
            fill={duotone ? 'currentColor' : 'none'}
            fillOpacity={duotone ? 0.14 : 0}
          />
        </>
      )

    case 'radio':
      return (
        <>
          <circle
            cx="12"
            cy="12"
            r="2"
            fill={duotone || filled ? 'currentColor' : 'none'}
            fillOpacity={duotone && !filled ? 0.25 : 1}
          />
          <path d="M16.2 7.8a6 6 0 010 8.4" />
          <path d="M7.8 16.2a6 6 0 010-8.4" />
          <path d="M19.1 4.9a10 10 0 010 14.2" />
          <path d="M4.9 19.1a10 10 0 010-14.2" />
        </>
      )
  }
}

/**
 * Kinetic animated icon set inspired by @skiper-ui/skiper99 (Animated Icons 002):
 * Staggered audio waves, kinetic arrows, and morphing menu/playlist bars.
 */
function renderSkiper99Path(name: ZunoIconName, filled: boolean) {
  switch (name) {
    case 'volume':
      return (
        <>
          <path
            d="M4.5 9.5h3.5l4.8-4.2v13.4L8 14.5H4.5A1.5 1.5 0 013 13v-2a1.5 1.5 0 011.5-1.5z"
            fill="currentColor"
            fillOpacity="0.14"
          />
          <path className="zuno-skiper99-wave-1" d="M16 9.2a4.1 4.1 0 010 5.6" />
          <path className="zuno-skiper99-wave-2" d="M18.8 6.4a7.9 7.9 0 010 11.2" />
        </>
      )
    case 'mute':
      return (
        <>
          <path d="M4.5 9.5h3.5l4.8-4.2v13.4L8 14.5H4.5A1.5 1.5 0 013 13v-2a1.5 1.5 0 011.5-1.5z" />
          <path className="zuno-skiper99-arrow" d="M16.5 9.2l4.5 5.6M21 9.2l-4.5 5.6" />
        </>
      )
    case 'playlist':
      return (
        <>
          <path className="zuno-skiper99-bar zuno-skiper99-bar-1" d="M3.5 6.5h13" />
          <path className="zuno-skiper99-bar zuno-skiper99-bar-2" d="M3.5 11.5h10.5" />
          <path className="zuno-skiper99-bar zuno-skiper99-bar-3" d="M3.5 16.5h7.5" />
          <circle cx="17.5" cy="16.5" r="2.4" fill="currentColor" fillOpacity="0.18" />
          <path d="M19.9 16.5V9.5l-2.8.9" />
        </>
      )
    case 'play':
      return (
        <path
          className="zuno-skiper99-arrow"
          d="M7 5.5c0-1 1.1-1.7 2-1.1l10.3 6.5c.8.5.8 1.7 0 2.2L9 19.6c-.9.6-2-.1-2-1.1v-13z"
          fill={filled ? 'currentColor' : 'none'}
        />
      )
    case 'next':
      return (
        <g className="zuno-skiper99-arrow">
          <path d="M18.5 6v12" />
          <path
            d="M6 6.2L13.8 12 6 17.8V6.2z"
            fill={filled ? 'currentColor' : 'none'}
          />
        </g>
      )
    case 'prev':
      return (
        <g className="zuno-skiper99-arrow">
          <path d="M5.5 6v12" />
          <path
            d="M18 6.2L10.2 12l7.8 5.8V6.2z"
            fill={filled ? 'currentColor' : 'none'}
          />
        </g>
      )
    case 'equalizer':
      return (
        <>
          <path className="zuno-skiper99-wave-1" d="M6 5v14" />
          <path className="zuno-skiper99-wave-2" d="M12 3.5v17" />
          <path className="zuno-skiper99-wave-1" d="M18 6.5v11" />
          <circle cx="6" cy="14" r="1.9" fill="currentColor" />
          <circle cx="12" cy="9" r="1.9" fill="currentColor" />
          <circle cx="18" cy="14.5" r="1.9" fill="currentColor" />
        </>
      )
    default:
      return renderCustomPath(name, 'tabler', true, filled)
  }
}
