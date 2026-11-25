import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronUp, MoreHorizontal, Sparkles, X } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { IconSwap, SlidingTabs, TextSwap } from '@/components/ui/motion'
import { Slider } from '@/components/ui/slider'
import { Tooltip } from '@/components/ui/tooltip'
import { ArtworkTile } from '@/components/ArtworkTile'
import { CompactScrollArea } from '@/components/CompactScrollArea'
import { Loader2 } from '@/components/PulseBarsLoader'
import { NowPlayingVisualizer } from '@/components/NowPlayingVisualizer'
import { PulseHeart } from '@/components/PulseHeart'
import { Scrubber } from '@/components/Scrubber'
import { VirtualTrackList } from '@/components/VirtualTrackList'
import { ZunoIcon } from '@/components/ZunoIcon'
import { cn, formatTime } from '@/lib/utils'
import {
  DEFAULT_APPEARANCE,
  type AppearanceSettings,
  type VisualizerStyleId,
} from '@/lib/appearance'
import { isTauriRuntime, type Playlist, type RepeatMode, type Track } from '@/lib/zunoApi'

const VISUALIZER_LABELS: Record<VisualizerStyleId, string> = {
  orb: 'Sound Orb',
  'wave-bars': 'Wave Bars',
  'fluid-wave': 'Waves',
  'radial-ring': 'Bass Ring',
  'aurora-pulse': 'Halo',
  none: 'Off',
}

interface NowPlayingPanelProps {
  track: Track | null
  queueTracks?: Track[]
  queueIndex?: number | null
  playlistLabel: string
  isPlaying: boolean
  isFavorite: boolean
  position: number
  duration: number
  volume: number
  shuffle: boolean
  repeat: RepeatMode
  playlists: Playlist[]
  eqEnabled?: boolean
  eqLabel?: string
  appearance?: AppearanceSettings
  audioEl?: HTMLAudioElement | null
  isMobileSheet?: boolean
  onCloseMobile?: () => void
  onOpenQueue: () => void
  onOpenPlaylist?: (slug: string) => void
  onOpenEqualizer?: () => void
  onCycleVisualizer?: () => void
  onEnsureAudioAttached?: () => void
  onSelectQueueIndex?: (idx: number) => void
  onDeleteTrack?: (track: Track) => void
  onTogglePlay: () => void
  onPrev: () => void
  onNext: () => void
  onSeekChange: (secs: number) => void
  onSeekCommit: (secs: number) => void
  onVolumeChange: (vol: number) => void
  onToggleFavorite: () => void
  onToggleShuffle: () => void
  onCycleRepeat: () => void
  onAddToPlaylist: (slug: string, trackId: string) => void
  onCreatePlaylistWithTrack: (trackId?: string) => void
}

export function NowPlayingPanel({
  track,
  queueTracks = [],
  queueIndex = null,
  playlistLabel,
  isPlaying,
  isFavorite,
  position,
  duration,
  volume,
  shuffle,
  repeat,
  playlists,
  eqEnabled = false,
  eqLabel = 'Off',
  appearance = DEFAULT_APPEARANCE,
  audioEl = null,
  onCloseMobile,
  onOpenPlaylist,
  onOpenEqualizer,
  onCycleVisualizer,
  onEnsureAudioAttached,
  onSelectQueueIndex,
  onDeleteTrack,
  onTogglePlay,
  onPrev,
  onNext,
  onSeekChange,
  onSeekCommit,
  onVolumeChange,
  onToggleFavorite,
  onToggleShuffle,
  onCycleRepeat,
  onAddToPlaylist,
  onCreatePlaylistWithTrack,
}: NowPlayingPanelProps) {
  const [sheetTab, setSheetTab] = useState<'none' | 'queue' | 'playlists'>('none')
  const [sheetClosing, setSheetClosing] = useState(false)
  const closeTimerRef = useRef<number | undefined>(undefined)
  const [moreOpen, setMoreOpen] = useState(false)

  const openSheet = useCallback((tab: 'queue' | 'playlists') => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = undefined
    }
    setSheetClosing(false)
    setSheetTab(tab)
  }, [])

  const closeSheet = useCallback(() => {
    if (sheetTab === 'none' || sheetClosing) return
    setSheetClosing(true)
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = undefined
      setSheetTab('none')
      setSheetClosing(false)
    }, 195)
  }, [sheetTab, sheetClosing])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [])

  // In web/mobile browser mode, lazily attach AnalyserNode when Now Playing visualizer is playing
  useEffect(() => {
    if (isPlaying && appearance.visualizerStyle !== 'none' && !isTauriRuntime()) {
      onEnsureAudioAttached?.()
    }
  }, [isPlaying, appearance.visualizerStyle, onEnsureAudioAttached])

  // Swipe-up (to open Queue/Playlists) & horizontal swipe (Prev/Next) on stage
  const gestureStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const [pullUpY, setPullUpY] = useState(0)
  const [swipeX, setSwipeX] = useState(0)

  // Swipe-down on opened sheet grabber to dismiss
  const sheetDragStartRef = useRef<number | null>(null)
  const [sheetDragY, setSheetDragY] = useState(0)

  const effectiveDuration = duration > 0 ? duration : (track?.duration_secs ?? 0)
  const iconPack = appearance.iconPack
  const isLight = appearance.mode === 'light'

  const subtitle = track
    ? track.artist === 'Unknown Artist' && track.folder
      ? track.folder
      : track.artist
    : 'Select a track'

  const orderedPlaylists = useMemo(() => {
    return [...playlists].sort((a, b) => {
      const aFav = a.slug === 'favorites' || a.slug === 'fav' ? 0 : 1
      const bFav = b.slug === 'favorites' || b.slug === 'fav' ? 0 : 1
      if (aFav !== bFav) return aFav - bFav
      return a.title.localeCompare(b.title)
    })
  }, [playlists])

  // Escape closes popover / drawer first, then full-screen player
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (moreOpen) {
        setMoreOpen(false)
      } else if (sheetTab !== 'none') {
        closeSheet()
      } else {
        onCloseMobile?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen, sheetTab, closeSheet, onCloseMobile])

  // ── Page-level swipe-up (Queue/Playlists) & horizontal track swipe ──
  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (moreOpen || sheetTab !== 'none') return
    gestureStartRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId }
  }

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = gestureStartRef.current
    if (!start || start.pointerId !== e.pointerId) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y

    // Clear upward swipe opens Queue / Playlists sheet
    if (dy < -10 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      if (pullUpY === 0) {
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
      setSwipeX(0)
      setPullUpY(Math.max(-96, dy * 0.65))
    } else if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      if (swipeX === 0) {
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
      setPullUpY(0)
      setSwipeX(Math.max(-90, Math.min(90, dx * 0.5)))
    }
  }

  const handleStagePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = gestureStartRef.current
    if (!start || start.pointerId !== e.pointerId) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    gestureStartRef.current = null
    setPullUpY(0)
    setSwipeX(0)

    if (dy <= -46 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      openSheet('queue')
    } else if (dx <= -64 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      onNext()
    } else if (dx >= 64 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      onPrev()
    }
  }

  // ── Sheet swipe-down-to-close handlers ──
  const handleSheetHeaderDown = (e: React.PointerEvent<HTMLDivElement>) => {
    sheetDragStartRef.current = e.clientY
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const handleSheetHeaderMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (sheetDragStartRef.current === null) return
    const dy = e.clientY - sheetDragStartRef.current
    if (dy > 0) setSheetDragY(Math.min(220, dy))
  }

  const handleSheetHeaderEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (sheetDragStartRef.current === null) return
    const dy = e.clientY - sheetDragStartRef.current
    sheetDragStartRef.current = null
    setSheetDragY(0)
    if (dy > 64) closeSheet()
  }

  // Bottom contrasting tray colors (high contrast across all 8 dark + light themes)
  const trayBgClass = isLight ? 'bg-foreground text-background' : 'bg-background text-foreground'
  const traySkipClass = isLight
    ? 'text-background/80 hover:bg-background/12 hover:text-background'
    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
  const trayPlayBtnClass = isLight
    ? 'bg-background text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.35)]'
    : 'bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(0,0,0,0.5)]'

  return (
    <div
      onPointerDown={handleStagePointerDown}
      onPointerMove={handleStagePointerMove}
      onPointerUp={handleStagePointerEnd}
      onPointerCancel={handleStagePointerEnd}
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden select-none touch-none animate-sheet-up',
        trayBgClass,
      )}
    >
      {/* ── Upper Curved Main Stage ── */}
      <div
        style={{
          transform: pullUpY < 0 ? `translateY(${pullUpY * 0.32}px)` : undefined,
        }}
        className={cn(
          'relative flex min-h-0 flex-1 flex-col justify-between overflow-hidden rounded-b-[36px] pb-5 pt-[max(1rem,env(safe-area-inset-top))] md:pb-2',
          pullUpY === 0 && 'transition-transform duration-300 ease-out',
          isLight
            ? 'bg-background shadow-[0_18px_42px_rgba(0,0,0,0.22)]'
            : 'bg-card border-b border-border/80 shadow-[0_20px_48px_rgba(0,0,0,0.6)]',
        )}
      >
        {/* Full-Stage Ambient Bass Halo Visualizer (when Aurora Halo style is active) */}
        {appearance.visualizerStyle === 'aurora-pulse' && (
          <NowPlayingVisualizer
            styleVariant="aurora-pulse"
            colorMode={appearance.visualizerColor}
            intensity={appearance.visualizerIntensity}
            mode={appearance.mode}
            isPlaying={isPlaying}
            audioEl={audioEl}
            className="absolute inset-0 z-0 h-full w-full"
          />
        )}

        {/* Top Bar: Back ←  |  Now playing  |  Heart + clean ··· Menu */}
        <header className="relative z-20 mx-auto flex h-11 w-full max-w-5xl shrink-0 items-center justify-between px-5 lg:h-14 lg:px-10">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onCloseMobile}
            aria-label="Back"
            className="flex h-10 w-10 -ml-2 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary active:scale-95 cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            Now playing
          </span>

          <div
            className="relative -mr-1.5 flex items-center gap-0.5"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <PulseHeart
              liked={isFavorite}
              disabled={!track}
              iconPack={iconPack}
              bare
              onToggle={onToggleFavorite}
              className={cn(
                'h-9 w-9 transition-colors hover:bg-secondary active:scale-92',
                isFavorite ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
              iconClassName="h-[18px] w-[18px]"
            />

            <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
              <DropdownMenuTrigger
                aria-label="Playback options"
                className={cn(
                  'h-9 w-9 text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-95',
                  moreOpen && 'bg-secondary text-foreground',
                )}
              >
                <MoreHorizontal className="h-[19px] w-[19px]" />
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-60 p-1.5">
                <div className="px-2.5 pb-1.5 pt-1">
                  <DropdownMenuLabel className="p-0">Playing from</DropdownMenuLabel>
                  <p className="mt-0.5 truncate text-xs font-medium text-foreground">
                    {playlistLabel}
                  </p>
                </div>

                <DropdownMenuSeparator />

                {/* Shuffle + Repeat toggles */}
                <div className="grid grid-cols-2 gap-1 px-0.5 py-0.5">
                  <DropdownMenuItem
                    keepOpen
                    onSelect={onToggleShuffle}
                    className={cn(
                      'min-h-8 justify-center gap-1.5 px-2',
                      shuffle
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 focus:bg-primary/90'
                        : 'bg-secondary/70',
                    )}
                  >
                    <ZunoIcon name="shuffle" pack={iconPack} className="h-3.5 w-3.5" />
                    Shuffle
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    keepOpen
                    onSelect={onCycleRepeat}
                    className={cn(
                      'min-h-8 justify-center gap-1.5 px-2',
                      repeat !== 'off'
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 focus:bg-primary/90'
                        : 'bg-secondary/70',
                    )}
                  >
                    <ZunoIcon
                      name={repeat === 'one' ? 'repeat1' : 'repeat'}
                      pack={iconPack}
                      className="h-3.5 w-3.5"
                    />
                    {repeat === 'off' ? 'Repeat' : repeat === 'all' ? 'All' : 'One'}
                  </DropdownMenuItem>
                </div>

                {/* Add to playlist */}
                {track && (
                  <DropdownMenuItem
                    onSelect={() => openSheet('playlists')}
                    className="mt-0.5 gap-2.5"
                  >
                    <ZunoIcon
                      name="playlist"
                      pack={iconPack}
                      className="h-3.5 w-3.5 text-muted-foreground"
                    />
                    Add to playlist
                  </DropdownMenuItem>
                )}

                {/* Visualizer Quick Switcher */}
                {onCycleVisualizer && (
                  <DropdownMenuItem
                    keepOpen
                    onSelect={onCycleVisualizer}
                    className="justify-between"
                  >
                    <span className="flex items-center gap-2.5">
                      <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                      Visualizer
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium',
                        appearance.visualizerStyle !== 'none'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {VISUALIZER_LABELS[appearance.visualizerStyle]}
                    </span>
                  </DropdownMenuItem>
                )}

                {/* Equalizer shortcut */}
                {onOpenEqualizer && (
                  <DropdownMenuItem
                    onSelect={onOpenEqualizer}
                    className="justify-between"
                  >
                    <span className="flex items-center gap-2.5">
                      <ZunoIcon
                        name="equalizer"
                        pack={iconPack}
                        className="h-3.5 w-3.5 text-muted-foreground"
                      />
                      Equalizer
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium',
                        eqEnabled
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {eqEnabled ? eqLabel : 'Off'}
                    </span>
                  </DropdownMenuItem>
                )}

                {/* Compact Volume row */}
                <div className="mt-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2">
                  <button
                    type="button"
                    onClick={() => onVolumeChange(volume > 0 ? 0 : 0.8)}
                    aria-label="Mute or unmute"
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <ZunoIcon
                      name={volume <= 0.001 ? 'mute' : 'volume'}
                      pack={iconPack}
                      className="h-3.5 w-3.5"
                    />
                  </button>
                  <Slider
                    value={volume}
                    max={1}
                    step={0.01}
                    onChange={onVolumeChange}
                    ariaLabel="Volume"
                  />
                </div>

                {track && onDeleteTrack && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      destructive
                      onSelect={() => onDeleteTrack(track)}
                      className="gap-2.5"
                    >
                      <ZunoIcon name="trash" pack={iconPack} className="h-3.5 w-3.5" />
                      Delete song
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* ── Hero Centerpiece: Big Responsive Visualizer + Lowered Song Title (Desktop) / Compact Mobile Stage ── */}
        <div
          style={{
            transform: swipeX !== 0 ? `translateX(${swipeX}px)` : undefined,
          }}
          className={cn(
            'relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-6 md:justify-end md:px-10 md:pb-1',
            swipeX === 0 && 'transition-transform duration-300 ease-out',
          )}
        >
          {/* Floating borderless Audio-Reactive Sound Orb / Wave Bars / Harmonic Waves / Bass Ring */}
          {appearance.visualizerStyle !== 'none' &&
            appearance.visualizerStyle !== 'aurora-pulse' && (
              <div className="relative mb-[clamp(0.75rem,2.4dvh,1.75rem)] flex w-full max-w-[min(92vw,560px)] shrink items-center justify-center md:mb-3 md:min-h-0 md:flex-1 md:max-w-[min(92vw,1160px)]">
                <NowPlayingVisualizer
                  styleVariant={appearance.visualizerStyle}
                  colorMode={appearance.visualizerColor}
                  intensity={appearance.visualizerIntensity}
                  mode={appearance.mode}
                  isPlaying={isPlaying}
                  audioEl={audioEl}
                  className={cn(
                    'w-full md:absolute md:inset-0 md:m-auto md:h-full md:max-h-[600px]',
                    appearance.visualizerStyle === 'orb' ||
                      appearance.visualizerStyle === 'radial-ring'
                      ? 'h-[clamp(116px,26dvh,240px)]'
                      : 'h-[clamp(84px,19dvh,176px)]',
                  )}
                />
              </div>
            )}

          {/* Centered Track Title & Artist (anchored low on Desktop below the big visualizer) */}
          <div className="w-full max-w-[min(90vw,740px)] shrink-0 text-center">
            <TextSwap
              as="h2"
              text={track ? track.title : 'Not Playing'}
              className="truncate text-[clamp(24px,4.2vw,44px)] font-bold leading-tight tracking-tight text-foreground md:text-[clamp(22px,2.8vw,34px)]"
            />
            <TextSwap
              as="p"
              text={subtitle}
              className="mt-1 truncate text-[clamp(13px,1.8vw,16px)] font-medium text-muted-foreground md:mt-1 md:text-[clamp(13px,1.2vw,15px)]"
            />
          </div>

          {/* Mobile-Only Scrubber + Split Timestamp (moved into Bottom Dock on Desktop) */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="mt-[clamp(1.25rem,4dvh,2.75rem)] w-full max-w-[min(88vw,540px)] shrink-0 md:hidden"
          >
            <Scrubber
              value={position}
              max={effectiveDuration || 1}
              styleVariant={appearance.scrubberKnob}
              seed={track?.id ?? track?.title ?? 'zuno'}
              onChange={onSeekChange}
              onCommit={onSeekCommit}
            />
          </div>

          <div className="mt-3.5 flex shrink-0 items-center justify-center gap-3 tabular-nums text-[12.5px] md:hidden">
            <span className="font-semibold text-foreground">
              {formatTime(position)}
            </span>
            <span className="h-3 w-[1px] bg-border" aria-hidden="true" />
            <span className="font-medium text-muted-foreground">
              {formatTime(effectiveDuration)}
            </span>
          </div>
        </div>

        {/* Bottom Queue Trigger: Mobile keeps swipe-up pill line; Desktop uses clean borderless Up Arrow button */}
        <div
          className="flex shrink-0 justify-center pt-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span
            className="h-1 w-8 rounded-full bg-border/80 md:hidden"
            aria-hidden="true"
          />
          <Tooltip label="Open queue" side="top">
            <button
              type="button"
              onClick={() => openSheet('queue')}
              aria-label="Open queue and playlists"
              className="group hidden h-9 w-12 items-center justify-center border-0 bg-transparent text-muted-foreground/70 transition-colors hover:text-foreground active:scale-92 cursor-pointer md:inline-flex"
            >
              <ChevronUp className="h-5 w-5 transition-transform duration-200 ease-out group-hover:-translate-y-0.5" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ── Contrasting Bottom Dock: Desktop Scrubber & Split Time + Previous · Play/Pause · Next ── */}
      <footer className="shrink-0 px-8 py-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] md:px-10 md:pt-4 md:pb-5">
        {/* Desktop Scrubber & Split Elapsed | Total Timestamp above transport controls */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="mx-auto mb-3.5 hidden w-full max-w-[min(86vw,640px)] flex-col items-center md:flex"
        >
          <Scrubber
            value={position}
            max={effectiveDuration || 1}
            styleVariant={appearance.scrubberKnob}
            seed={track?.id ?? track?.title ?? 'zuno'}
            tone={isLight ? 'inverted' : 'surface'}
            onChange={onSeekChange}
            onCommit={onSeekCommit}
          />
          <div className="mt-1.5 flex items-center justify-center gap-3 tabular-nums text-[12px] lg:text-[12.5px]">
            <span
              className={cn(
                'font-semibold',
                isLight ? 'text-background' : 'text-foreground',
              )}
            >
              {formatTime(position)}
            </span>
            <span
              className={cn(
                'h-3 w-[1px]',
                isLight ? 'bg-background/25' : 'bg-border',
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                'font-medium',
                isLight ? 'text-background/60' : 'text-muted-foreground',
              )}
            >
              {formatTime(effectiveDuration)}
            </span>
          </div>
        </div>

        <div
          className="mx-auto flex max-w-[280px] items-center justify-between"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Previous */}
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous track"
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full transition-all active:scale-92 cursor-pointer',
              traySkipClass,
            )}
          >
            <ZunoIcon name="prev" pack={iconPack} filled className="h-5 w-5" />
          </button>

          {/* Center Play / Pause */}
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className={cn(
              'relative flex h-14 w-14 items-center justify-center rounded-full transition-transform duration-150 active:scale-92 cursor-pointer',
              trayPlayBtnClass,
            )}
          >
            {appearance.playButtonStyle === 'waveform' && isPlaying ? (
              <span className="flex h-5 items-center gap-[3px]" aria-hidden="true">
                <span className="h-full w-[2.5px] rounded-full bg-current animate-wave-1" />
                <span className="h-full w-[2.5px] rounded-full bg-current animate-wave-2" />
                <span className="h-full w-[2.5px] rounded-full bg-current animate-wave-3" />
                <span className="h-full w-[2.5px] rounded-full bg-current animate-wave-4" />
                <span className="h-full w-[2.5px] rounded-full bg-current animate-wave-5" />
              </span>
            ) : appearance.playButtonStyle === 'vinyl' ? (
              <span className="relative flex h-11 w-11 items-center justify-center">
                <svg
                  viewBox="0 0 36 36"
                  fill="none"
                  className={cn(
                    'h-11 w-11',
                    isPlaying ? 'animate-vinyl-spin' : 'animate-vinyl-paused',
                  )}
                  aria-hidden="true"
                >
                  <circle
                    cx="18"
                    cy="18"
                    r="16"
                    stroke="currentColor"
                    strokeOpacity="0.35"
                    strokeWidth="1.2"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="12"
                    stroke="currentColor"
                    strokeOpacity="0.25"
                    strokeWidth="1"
                    strokeDasharray="14 7"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="8.5"
                    stroke="currentColor"
                    strokeOpacity="0.3"
                    strokeWidth="1"
                    strokeDasharray="9 5"
                  />
                  <circle cx="18" cy="18" r="4" fill="currentColor" fillOpacity="0.85" />
                </svg>
                {!isPlaying && (
                  <ZunoIcon
                    name="play"
                    pack={iconPack}
                    filled
                    className="pointer-events-none absolute h-4 w-4 translate-x-[1px]"
                  />
                )}
              </span>
            ) : (
              <IconSwap
                active={isPlaying ? 'b' : 'a'}
                iconA={
                  <ZunoIcon
                    name="play"
                    pack={iconPack}
                    filled
                    className="h-5 w-5 translate-x-[1.5px]"
                  />
                }
                iconB={
                  <ZunoIcon
                    name="pause"
                    pack={iconPack}
                    filled
                    className="h-5 w-5"
                  />
                }
              />
            )}
          </button>

          {/* Next */}
          <button
            type="button"
            onClick={onNext}
            aria-label="Next track"
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full transition-all active:scale-92 cursor-pointer',
              traySkipClass,
            )}
          >
            <ZunoIcon name="next" pack={iconPack} filled className="h-5 w-5" />
          </button>
        </div>

        {/* Mobile Swipe-Up Queue / Playlists Cue */}
        <button
          type="button"
          onClick={() => openSheet('queue')}
          style={{
            transform: pullUpY < 0 ? `translateY(${pullUpY * 0.25}px)` : undefined,
          }}
          className={cn(
            'mx-auto mt-2.5 flex items-center justify-center gap-1 rounded-full px-3 py-1 text-[10.5px] font-medium tracking-wide transition-opacity cursor-pointer md:hidden',
            isLight
              ? 'text-background/55 hover:text-background/90'
              : 'text-muted-foreground/70 hover:text-foreground',
          )}
        >
          <ChevronUp className="h-3.5 w-3.5" />
          <span>Swipe up for queue &amp; playlists</span>
        </button>
      </footer>

      {/* ── Swipe-Up / Slide-Up Sheet: Queue | Playlists ── */}
      {sheetTab !== 'none' && (
        <div
          onClick={closeSheet}
          className={cn(
            'absolute inset-0 z-50 flex items-end bg-black/55 backdrop-blur-xs',
            sheetClosing ? 'animate-backdrop-out pointer-events-none' : 'animate-backdrop-in',
          )}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              transform: sheetDragY > 0 ? `translateY(${sheetDragY}px)` : undefined,
            }}
            className={cn(
              'mx-auto flex h-[76%] max-h-[680px] w-full max-w-xl flex-col rounded-t-[30px] border-t border-border bg-card text-foreground shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))] lg:border-x',
              sheetClosing ? 'animate-drawer-down' : 'animate-drawer-up',
              sheetDragY === 0 && !sheetClosing && 'transition-transform duration-200 ease-out',
            )}
          >
            {/* Swipe-Down Grabber & Segmented Tab Header */}
            <div
              onPointerDown={handleSheetHeaderDown}
              onPointerMove={handleSheetHeaderMove}
              onPointerUp={handleSheetHeaderEnd}
              onPointerCancel={handleSheetHeaderEnd}
              className="shrink-0 touch-none border-b border-border/70 px-5 pb-3.5 pt-2.5"
            >
              <div className="mb-3 flex justify-center">
                <span className="h-1 w-10 rounded-full bg-border" aria-hidden="true" />
              </div>

              <div className="flex items-center justify-between gap-3">
                {/* Queue / Playlists sliding pill switch (transitions.dev 16 · SlidingTabs) */}
                <SlidingTabs
                  variant="pill"
                  stopPointerDown
                  ariaLabel="Queue and Playlists"
                  value={sheetTab === 'playlists' ? 'playlists' : 'queue'}
                  onChange={(tab) => setSheetTab(tab)}
                  options={[
                    {
                      value: 'queue',
                      label: (
                        <>
                          Queue
                          {queueTracks.length > 0 && (
                            <span className="ml-1.5 tabular-nums opacity-75">
                              {queueTracks.length}
                            </span>
                          )}
                        </>
                      ),
                    },
                    {
                      value: 'playlists',
                      label: (
                        <>
                          Playlists
                          {orderedPlaylists.length > 0 && (
                            <span className="ml-1.5 tabular-nums opacity-75">
                              {orderedPlaylists.length}
                            </span>
                          )}
                        </>
                      ),
                    },
                  ]}
                />

                {/* Right contextual controls */}
                <div
                  className="flex items-center gap-1.5"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {sheetTab === 'queue' && (
                    <>
                      <button
                        type="button"
                        onClick={onToggleShuffle}
                        aria-label="Toggle shuffle"
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer',
                          shuffle
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <ZunoIcon name="shuffle" pack={iconPack} className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={onCycleRepeat}
                        aria-label="Cycle repeat"
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer',
                          repeat !== 'off'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <ZunoIcon
                          name={repeat === 'one' ? 'repeat1' : 'repeat'}
                          pack={iconPack}
                          className="h-3.5 w-3.5"
                        />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={closeSheet}
                    aria-label="Close sheet"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Tab 1: Up Next Queue */}
            {sheetTab === 'queue' && (
              <CompactScrollArea
                key="sheet-queue"
                className="t-page-enter min-h-0 flex-1"
                viewportClassName="p-3"
              >
                <p className="mb-2 px-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Playing from · {playlistLabel}
                </p>
                {queueTracks.length === 0 ? (
                  <p className="py-12 text-center text-xs text-muted-foreground">
                    Queue is empty
                  </p>
                ) : (
                  <VirtualTrackList
                    items={queueTracks}
                    getKey={(item, idx) => `${item.id}-${idx}`}
                    estimateRowHeight={56}
                    renderItem={(item, idx) => {
                      const isCurrent = idx === queueIndex
                      const playingHere = isCurrent && isPlaying
                      const itemArtist =
                        item.artist === 'Unknown Artist' && item.folder
                          ? item.folder
                          : item.artist
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            if (isCurrent) {
                              onTogglePlay()
                            } else {
                              onSelectQueueIndex?.(idx)
                            }
                          }}
                          className={cn(
                            'group flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left transition-colors cursor-pointer',
                            isCurrent
                              ? 'bg-secondary text-foreground'
                              : 'hover:bg-secondary/60 text-foreground',
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-border bg-secondary">
                              <ArtworkTile
                                trackId={item.id}
                                hasCover={item.has_cover}
                                seed={item.title}
                                variant="thumb"
                              />
                            </div>
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  'truncate text-sm leading-tight',
                                  isCurrent
                                    ? 'font-semibold text-primary'
                                    : 'font-medium text-foreground',
                                )}
                              >
                                {item.title}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {itemArtist}
                              </p>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2.5">
                            {/* Play / Pause animation matching user's active playing style */}
                            <span className="relative flex h-7 w-7 items-center justify-center">
                              {playingHere ? (
                                appearance.playingStyle === 'pulse-bars' ? (
                                  <Loader2
                                    barCount={4}
                                    height={14}
                                    width={2.2}
                                    gap={2}
                                    speed={0.95}
                                  />
                                ) : appearance.playingStyle === 'equalizer' ? (
                                  <span className="flex h-4.5 items-end justify-center gap-[2px]">
                                    <span className="zuno-eq-bar" />
                                    <span className="zuno-eq-bar" />
                                    <span className="zuno-eq-bar" />
                                    <span className="zuno-eq-bar" />
                                  </span>
                                ) : appearance.playingStyle === 'pulse' ? (
                                  <>
                                    <span
                                      aria-hidden="true"
                                      className="animate-btn-pulse pointer-events-none absolute inset-0 rounded-full border border-primary"
                                    />
                                    <span className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                      <ZunoIcon
                                        name="pause"
                                        pack={iconPack}
                                        filled
                                        className="h-3 w-3"
                                      />
                                    </span>
                                  </>
                                ) : (
                                  <ZunoIcon
                                    name="pause"
                                    pack={iconPack}
                                    filled
                                    className="h-3.5 w-3.5 text-primary transition-transform duration-200"
                                  />
                                )
                              ) : isCurrent ? (
                                <span
                                  className={cn(
                                    'flex h-6 w-6 items-center justify-center rounded-full transition-transform duration-200',
                                    appearance.playingStyle === 'pulse'
                                      ? 'border border-primary/50 bg-primary/15 text-primary'
                                      : 'text-primary',
                                  )}
                                >
                                  <ZunoIcon
                                    name="play"
                                    pack={iconPack}
                                    filled
                                    className="h-3.5 w-3.5 translate-x-[0.5px]"
                                  />
                                </span>
                              ) : (
                                <ZunoIcon
                                  name="play"
                                  pack={iconPack}
                                  filled
                                  className="h-3.5 w-3.5 translate-x-[0.5px] text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                                />
                              )}
                            </span>

                            <span className="tabular-nums text-[11px] text-muted-foreground">
                              {formatTime(item.duration_secs)}
                            </span>
                          </div>
                        </button>
                      )
                    }}
                  />
                )}
              </CompactScrollArea>
            )}

            {/* Tab 2: Playlists (open any playlist OR quick-add current song) */}
            {sheetTab === 'playlists' && (
              <CompactScrollArea
                key="sheet-playlists"
                className="t-page-enter min-h-0 flex-1"
                viewportClassName="p-3"
              >
                <div className="space-y-1.5">
                  {orderedPlaylists.map((pl) => {
                    const isFav = pl.slug === 'favorites' || pl.slug === 'fav'
                    const alreadyIn = track ? pl.track_ids.includes(track.id) : false
                    return (
                      <div
                        key={pl.slug}
                        className="flex items-center justify-between gap-2 rounded-2xl px-3 py-2 transition-colors hover:bg-secondary/70"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            closeSheet()
                            onOpenPlaylist?.(pl.slug)
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary">
                            <ZunoIcon
                              name={isFav ? 'heart' : 'playlist'}
                              pack={iconPack}
                              filled={isFav}
                              className={cn(
                                'h-4 w-4',
                                isFav ? 'text-primary' : 'text-muted-foreground',
                              )}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {pl.title}
                            </p>
                            <p className="mt-0.5 tabular-nums text-xs text-muted-foreground">
                              {pl.track_ids.length}{' '}
                              {pl.track_ids.length === 1 ? 'song' : 'songs'}
                            </p>
                          </div>
                        </button>

                        {track && (
                          <button
                            type="button"
                            onClick={() => onAddToPlaylist(pl.slug, track.id)}
                            aria-label={
                              alreadyIn
                                ? `Already in ${pl.title}`
                                : `Add to ${pl.title}`
                            }
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border transition-colors cursor-pointer',
                              alreadyIn
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-secondary text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {alreadyIn ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <ZunoIcon name="plus" pack={iconPack} className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    )
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      closeSheet()
                      onCreatePlaylistWithTrack(track?.id)
                    }}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                  >
                    <ZunoIcon name="plus" pack={iconPack} className="h-3.5 w-3.5" />
                    New playlist
                  </button>
                </div>
              </CompactScrollArea>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
