import { useState } from 'react'
import { ChevronDown, Maximize2, Menu, Minimize2, RotateCcw, Sparkles, Wand2, X } from 'lucide-react'
import { CompactScrollArea } from '@/components/CompactScrollArea'
import { EaseThemeToggle, runThemeViewTransition } from '@/components/EaseThemeToggle'
import { GradualBlur } from '@/components/GradualBlur'
import { Loader2 } from '@/components/PulseBarsLoader'
import { Scrubber } from '@/components/Scrubber'
import { ScrollProgressOverlay } from '@/components/ScrollProgressOverlay'
import { VinylPlayButton, WaveformPlayButton } from '@/components/WaveformPlayButton'
import { WindowTitlebar } from '@/components/WindowTitlebar'
import { ZunoIcon } from '@/components/ZunoIcon'
import { ZunoLogo } from '@/components/ZunoLogo'
import { cn } from '@/lib/utils'
import {
  resolveEffectivePalette,
  windowRadiusClass,
  type AppearanceSettings,
  type ThemeMode,
  type ThemeToggleStyleId,
  type ThemeTransitionId,
  type ThemeTransitionStartId,
} from '@/lib/appearance'

const SAMPLE_TRACKS = [
  { title: 'midnight_chords', artist: 'AMBIENT', dur: '03:32' },
  { title: 'velvet_horizon', artist: 'SYNTHWAVE', dur: '04:10' },
  { title: 'rain_on_glass', artist: 'LO-FI', dur: '02:48' },
  { title: 'northern_drift', artist: 'ELECTRONIC', dur: '03:54' },
  { title: 'amber_static', artist: 'POST-ROCK', dur: '05:02' },
  { title: 'cobalt_echoes', artist: 'AMBIENT', dur: '03:19' },
  { title: 'quiet_transit', artist: 'DOWNTEMPO', dur: '04:26' },
  { title: 'analog_dusk', artist: 'SYNTHWAVE', dur: '03:45' },
  { title: 'paper_satellites', artist: 'INDIE', dur: '02:58' },
  { title: 'glass_harbor', artist: 'AMBIENT', dur: '04:15' },
  { title: 'slow_aperture', artist: 'ELECTRONIC', dur: '03:37' },
  { title: 'silver_tape', artist: 'LO-FI', dur: '02:41' },
  { title: 'night_ferry', artist: 'DOWNTEMPO', dur: '04:08' },
  { title: 'warm_circuit', artist: 'SYNTHWAVE', dur: '03:22' },
]

export function LivePreviewStage({
  title,
  hint,
  mode,
  transition,
  transitionStart,
  toggleStyle,
  onToggleMode,
  actions,
  className,
  children,
}: {
  title: string
  hint?: string
  mode: ThemeMode
  transition: ThemeTransitionId
  transitionStart?: ThemeTransitionStartId
  toggleStyle?: ThemeToggleStyleId
  onToggleMode: () => void
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background/70">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-2 font-mono text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>{title}</span>
          {hint && <span className="hidden text-[10px] opacity-65 sm:inline">· {hint}</span>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <EaseThemeToggle
            mode={mode}
            transition={transition}
            transitionStart={transitionStart}
            toggleStyle={toggleStyle}
            onToggle={onToggleMode}
            size="sm"
          />
        </div>
      </div>
      <div className={cn('flex min-h-[148px] items-center justify-center p-5 sm:p-6', className)}>
        {children}
      </div>
    </div>
  )
}

/** 1. Theme Presets live miniature full-workspace preview */
export function ThemePresetPreview({ settings }: { settings: AppearanceSettings }) {
  const pal = resolveEffectivePalette(settings)
  return (
    <div
      className={cn(
        'w-full max-w-xl overflow-hidden border border-border bg-background shadow-md transition-all',
        windowRadiusClass(settings.windowRadius),
      )}
    >
      <div className="flex h-8 items-center justify-between border-b border-border bg-card px-3">
        <div className="flex items-center gap-1.5">
          <ZunoLogo className="h-3.5 w-3.5" />
          <span className="text-[11px] font-semibold text-foreground">Zuno</span>
        </div>
        <span className="rounded-full border border-border bg-secondary px-2 py-0.5 font-mono text-[9.5px] text-muted-foreground">
          {settings.mode === 'dark' ? 'Dark Mode' : 'Light Mode'}
        </span>
      </div>
      <div className="grid grid-cols-[120px_1fr] min-h-[126px]">
        <div className="flex flex-col justify-between border-r border-border bg-card/70 p-2.5">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 rounded-lg bg-secondary px-2 py-1 text-[11px] font-medium text-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>Songs</span>
            </div>
            <div className="px-2 py-1 text-[11px] text-muted-foreground">Recent</div>
            <div className="px-2 py-1 text-[11px] text-muted-foreground">Playlists</div>
          </div>
          <div className="flex items-center gap-1 px-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-border" style={{ background: pal.background }} />
            <span className="h-2.5 w-2.5 rounded-full border border-border" style={{ background: pal.secondary }} />
            <span className="h-2.5 w-2.5 rounded-full border border-border" style={{ background: pal.primary }} />
          </div>
        </div>
        <div className="flex flex-col justify-between p-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded-xl bg-secondary px-2.5 py-1.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <ZunoIcon name="pause" pack={settings.iconPack} filled className="h-2.5 w-2.5" />
                </span>
                <div>
                  <p className="text-[11px] font-medium text-primary">midnight_chords</p>
                  <p className="text-[9.5px] text-muted-foreground">Ambient</p>
                </div>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">01:24</span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1 text-[11px] text-muted-foreground">
              <span>velvet_horizon</span>
              <span className="font-mono text-[10px]">04:10</span>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <span className="block h-full w-2/5 rounded-full bg-primary" />
            </span>
            <span className="font-mono text-[9.5px] text-muted-foreground">03:32</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 2. Custom Palette 60/30/10 Live Balance Preview */
export function PaletteBalancePreview({ settings }: { settings: AppearanceSettings }) {
  const pal = resolveEffectivePalette(settings)
  return (
    <div className="w-full max-w-xl space-y-3">
      {/* 60 / 30 / 10 Visual Ratio Bar */}
      <div className="flex h-7 w-full overflow-hidden rounded-xl border border-border font-mono text-[10px] font-medium">
        <div
          className="flex w-[60%] items-center justify-center border-r border-border/70"
          style={{ backgroundColor: pal.background, color: pal.foreground }}
        >
          60% Canvas · {pal.background}
        </div>
        <div
          className="flex w-[30%] items-center justify-center border-r border-border/70"
          style={{ backgroundColor: pal.secondary, color: pal.foreground }}
        >
          30% Surface
        </div>
        <div
          className="flex w-[10%] items-center justify-center"
          style={{ backgroundColor: pal.primary, color: pal.primaryForeground }}
        >
          10%
        </div>
      </div>

      {/* Live Token Composition Card */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary text-primary">
            <ZunoIcon name="music" pack={settings.iconPack} className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">Primary Text &amp; Card</p>
            <p className="text-[11px] text-muted-foreground">
              Muted caption · 1px hairline border ({pal.border})
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground">
            Secondary
          </span>
          <span className="rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground">
            Play all
          </span>
        </div>
      </div>
    </div>
  )
}

/** 3. Typography & Fonts Live Preview */
export function TypographyPreview({ settings }: { settings: AppearanceSettings }) {
  return (
    <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3 border-b border-border/70 pb-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            LIBRARY · {settings.customUiFont || settings.fontFamily}
          </p>
          <p className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">
            Midnight Sessions
          </p>
        </div>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {settings.customMonoFont || settings.monoFont} · 03:32
        </span>
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between rounded-xl bg-secondary px-3 py-2">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              AMBIENT
            </p>
            <p className="text-sm font-medium text-primary">midnight_chords — Alan Walker</p>
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">01:42 / 03:32</span>
        </div>
        <div className="flex items-center justify-between px-3 py-1 text-xs text-muted-foreground">
          <span>The quick brown fox jumps over 128 kHz stereo tracks.</span>
          <span className="font-mono tabular-nums">482</span>
        </div>
      </div>
    </div>
  )
}

/** 4. Window Corners Live Interactive Preview (supports toggling Restored vs Maximized) */
export function WindowCornersPreview({ settings }: { settings: AppearanceSettings }) {
  const [simMax, setSimMax] = useState(false)
  return (
    <div className="w-full max-w-xl space-y-3">
      <div className="relative flex min-h-[156px] items-center justify-center rounded-2xl border border-dashed border-border/80 bg-secondary/35 p-4">
        <div
          className={cn(
            'w-full overflow-hidden border bg-background shadow-2xl transition-all duration-300',
            simMax
              ? 'max-w-full rounded-none border-border/50'
              : cn('max-w-md border-border', windowRadiusClass(settings.windowRadius)),
          )}
        >
          <WindowTitlebar
            preview
            styleVariant={settings.titlebarStyle}
            align={settings.titlebarAlign}
            showTrack={settings.titlebarShowTrack}
            compact={settings.titlebarCompact}
            currentTrack={{
              id: 'preview',
              rel_path: 'preview.mp3',
              title: 'midnight_chords',
              artist: 'Ambient',
              album: '',
              genre: null,
              duration_secs: 212,
              file_size: 0,
              modified_secs: 0,
              folder: '',
              has_cover: false,
            }}
            isPlaying
          />
          <div className="flex h-20 flex-col items-center justify-center gap-1 bg-background px-4 text-center">
            <span className="font-mono text-[11px] font-medium text-foreground">
              {simMax
                ? 'Maximized · 0px flush corners'
                : `Window Corner · ${settings.windowRadius}`}
            </span>
            <span className="text-[11px] text-muted-foreground">
              Transparent GTK3 outer edges keep curves crisp on Linux desktops
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSimMax((v) => !v)}
          className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground shadow-sm transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
        >
          {simMax ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          <span>{simMax ? 'Restore' : 'Test Maximize'}</span>
        </button>
      </div>
    </div>
  )
}

/** 5. Desktop Navigation Live Interactive Preview (Classic Sidebar / SmoothUI Navbar / Great UI Dock & Capsule) */
export function DesktopNavPreview({ settings }: { settings: AppearanceSettings }) {
  const [activeTab, setActiveTab] = useState<'songs' | 'recent' | 'playlists' | 'eq'>('songs')
  const [dockOpen, setDockOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const tabs: { id: 'songs' | 'recent' | 'playlists' | 'eq'; label: string; icon: 'music' | 'clock' | 'playlist' | 'equalizer' }[] = [
    { id: 'songs', label: 'Songs', icon: 'music' },
    { id: 'recent', label: 'Recent', icon: 'clock' },
    { id: 'playlists', label: 'Playlists', icon: 'playlist' },
    { id: 'eq', label: 'EQ', icon: 'equalizer' },
  ]

  return (
    <div className="relative h-[220px] w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-background shadow-md">
      {settings.navStyle === 'sidebar' && (
        <div className="flex h-full w-full">
          <div className="flex w-[148px] shrink-0 flex-col justify-between border-r border-border bg-card/80 p-2.5">
            <div className="space-y-1">
              <div className="mb-2 flex items-center gap-1.5 px-2 py-1">
                <ZunoLogo className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold text-foreground">Zuno</span>
              </div>
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors cursor-pointer',
                    activeTab === t.id
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                  )}
                >
                  <ZunoIcon name={t.icon} pack={settings.iconPack} className="h-3.5 w-3.5" />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
            <p className="px-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/70">
              Playlists · 4
            </p>
          </div>
          <div className="flex flex-1 flex-col justify-between p-4">
            <MiniPreviewSongCanvas activeTab={activeTab} />
          </div>
        </div>
      )}

      {settings.navStyle === 'floating-navbar' && (
        <div className="relative flex h-full w-full flex-col">
          <div className="flex justify-center px-3 pt-3">
            <div className="flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1 shadow-lg">
              <span className="flex items-center gap-1.5 px-2 text-[11px] font-semibold text-foreground">
                <ZunoLogo className="h-3.5 w-3.5" />
                <span>Zuno</span>
              </span>
              <span className="h-3.5 w-px bg-border" />
              {tabs.map((t) => {
                const active = activeTab === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={cn(
                      'relative flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer',
                      active
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                    )}
                  >
                    <ZunoIcon name={t.icon} pack={settings.iconPack} className="h-3 w-3" />
                    <span>{t.label}</span>
                    {active && (
                      <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-end p-4">
            <MiniPreviewSongCanvas activeTab={activeTab} />
          </div>
        </div>
      )}

      {settings.navStyle === 'floating-dock' && (
        <div className="relative flex h-full w-full flex-col">
          <div className="relative z-10 flex flex-col items-center px-3 pt-3">
            <div className="flex items-center gap-1 rounded-2xl border border-border bg-card p-1 shadow-lg">
              {tabs.map((t) => {
                const active = activeTab === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(t.id)
                      setDockOpen(false)
                    }}
                    className={cn(
                      'flex h-7 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-medium transition-all cursor-pointer',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    <ZunoIcon name={t.icon} pack={settings.iconPack} className="h-3.5 w-3.5" />
                    {active && <span>{t.label}</span>}
                  </button>
                )
              })}
              <span className="mx-0.5 h-3.5 w-px bg-border" />
              <button
                type="button"
                onClick={() => setDockOpen((v) => !v)}
                className={cn(
                  'flex h-7 items-center gap-1 rounded-xl px-2 text-[11px] font-medium transition-colors cursor-pointer',
                  dockOpen ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary',
                )}
              >
                <span>Studio</span>
                <ChevronDown className={cn('h-3 w-3 transition-transform', dockOpen && 'rotate-180')} />
              </button>
            </div>
            {dockOpen && (
              <div className="mt-1.5 w-60 rounded-xl border border-border bg-card p-2.5 shadow-xl animate-dock-pop">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Quick Actions &amp; Playlists
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[11px]">
                  <span className="rounded-lg border border-border bg-background/60 px-2 py-1 text-foreground">
                    Customize
                  </span>
                  <span className="rounded-lg border border-border bg-background/60 px-2 py-1 text-foreground">
                    Folders (2)
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col justify-end p-4">
            <MiniPreviewSongCanvas activeTab={activeTab} />
          </div>
        </div>
      )}

      {settings.navStyle === 'floating-menu' && (
        <div className="relative flex h-full w-full flex-col">
          <div className="flex items-center justify-between px-4 pt-3">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-card px-3 text-[11px] font-semibold text-foreground shadow-md transition-colors hover:bg-secondary cursor-pointer"
            >
              <ZunoLogo className="h-3.5 w-3.5" />
              <span>Zuno</span>
              <span className="h-3 w-px bg-border" />
              <Menu className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <span className="font-mono text-[10px] text-muted-foreground">
              Click capsule to expand
            </span>
          </div>
          <div className="flex flex-1 flex-col justify-end p-4">
            <MiniPreviewSongCanvas activeTab={activeTab} />
          </div>
          {menuOpen && (
            <div className="absolute inset-0 z-20 flex flex-col justify-between bg-background/95 p-4 animate-dock-pop">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Navigation Menu
                </span>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close preview menu"
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-foreground cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(t.id)
                      setMenuOpen(false)
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium cursor-pointer',
                      activeTab === t.id
                        ? 'border-primary bg-secondary text-foreground'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <ZunoIcon name={t.icon} pack={settings.iconPack} className="h-3.5 w-3.5" />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
              <div className="font-mono text-[10px] text-muted-foreground">
                Playlists · Music Folders · Customize Studio
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MiniPreviewSongCanvas({ activeTab }: { activeTab: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {activeTab}
        </span>
        <span className="rounded-full bg-primary px-2 py-0.5 text-[9.5px] font-semibold text-primary-foreground">
          Play all
        </span>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-secondary px-2.5 py-1.5 text-[11px]">
        <span className="font-medium text-primary">midnight_chords</span>
        <span className="font-mono text-[10px] text-muted-foreground">03:32</span>
      </div>
      <div className="flex items-center justify-between rounded-xl px-2.5 py-1 text-[11px] text-muted-foreground">
        <span>velvet_horizon</span>
        <span className="font-mono text-[10px]">04:10</span>
      </div>
    </div>
  )
}

/** 6. Surface Materials Live Preview */
export function SurfaceMaterialPreview({ settings }: { settings: AppearanceSettings }) {
  return (
    <div
      data-surface={settings.surfaceStyle}
      className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2"
    >
      <div className="z-surface-card space-y-2 rounded-2xl border border-border bg-card p-4 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">Studio Panel</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-primary">
            {settings.surfaceStyle}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Elevated containers, cards, and equalizer panels inherit this physical finish.
        </p>
      </div>
      <div className="z-surface-card flex flex-col justify-between gap-2 rounded-2xl border border-border bg-card p-4 transition-all">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-primary">
            <ZunoIcon name="equalizer" pack={settings.iconPack} className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">10-Band EQ</p>
            <p className="text-[10.5px] text-muted-foreground">Borders · {settings.borders}</p>
          </div>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-3/5 rounded-full bg-primary" />
        </div>
      </div>
    </div>
  )
}

/** 7. Canvas Background Pattern Live Preview */
export function CanvasPatternPreview({ settings }: { settings: AppearanceSettings }) {
  return (
    <div data-bg-pattern={settings.bgPattern} className="w-full max-w-xl">
      <div className="zuno-canvas relative flex h-40 w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-border bg-background p-5">
        <div className="flex w-full max-w-sm items-center justify-between rounded-xl border border-border bg-card/90 px-3.5 py-2.5 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ZunoIcon name="play" pack={settings.iconPack} filled className="h-3 w-3 translate-x-[0.5px]" />
            </span>
            <div>
              <p className="text-xs font-medium text-foreground">midnight_chords</p>
              <p className="font-mono text-[10px] text-muted-foreground">
                Pattern · {settings.bgPattern.replace('_', ' ')}
              </p>
            </div>
          </div>
          <span className="font-mono text-[10.5px] text-muted-foreground">03:32</span>
        </div>
      </div>
    </div>
  )
}

/** 8. Scroll Progress Interactive Mini Library Preview (real live scrolling!) */
export function ScrollProgressLivePreview({ settings }: { settings: AppearanceSettings }) {
  return (
    <div className="relative h-[224px] w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-background">
      <CompactScrollArea
        className="h-full w-full"
        viewportClassName="px-3.5 py-3"
        overlay={<ScrollProgressOverlay styleVariant={settings.scrollProgressStyle} />}
      >
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Scroll here to test · {settings.scrollProgressStyle}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {SAMPLE_TRACKS.length} tracks
          </span>
        </div>
        <div className="space-y-1">
          {SAMPLE_TRACKS.map((t, i) => (
            <div
              key={t.title}
              className={cn(
                'flex items-center justify-between rounded-xl px-3 py-2 text-xs',
                i === 0 ? 'bg-secondary text-foreground' : 'text-muted-foreground',
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-4 font-mono text-[10px] opacity-60">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className={cn('truncate font-medium', i === 0 && 'text-primary')}>
                  {t.title}
                </span>
              </div>
              <span className="font-mono text-[10.5px] opacity-70">{t.dur}</span>
            </div>
          ))}
        </div>
      </CompactScrollArea>
    </div>
  )
}

/** 9. Scroll Row Reveal Interactive Replay Preview */
export function ScrollRevealLivePreview({ settings }: { settings: AppearanceSettings }) {
  const [replayKey, setReplayKey] = useState(0)
  const revealClass =
    settings.scrollRevealStyle === 'blur-reveal'
      ? 'zuno-reveal-blur'
      : settings.scrollRevealStyle === 'slide-fade'
        ? 'zuno-reveal-slide'
        : ''

  return (
    <div className="w-full max-w-xl space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10.5px] text-muted-foreground">
          Active effect: <strong className="text-foreground">{settings.scrollRevealStyle}</strong>
        </span>
        <button
          type="button"
          onClick={() => setReplayKey((k) => k + 1)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary cursor-pointer"
        >
          <RotateCcw className="h-3 w-3 text-primary" />
          <span>Replay Entrance</span>
        </button>
      </div>
      <div key={`${settings.scrollRevealStyle}-${replayKey}`} className="space-y-1.5">
        {SAMPLE_TRACKS.slice(0, 4).map((t, idx) => (
          <div
            key={t.title}
            style={{ animationDelay: `${idx * 55}ms` }}
            className={cn(
              'flex items-center justify-between rounded-xl border border-border/70 bg-card px-3.5 py-2.5',
              revealClass,
            )}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary font-mono text-[10px] text-primary">
                0{idx + 1}
              </span>
              <div>
                <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
                  {t.artist}
                </p>
                <p className="text-xs font-medium text-foreground">{t.title}</p>
              </div>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">{t.dur}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 10. Theme Toggle Button Live Interactive Showcase */
export function ThemeToggleLivePreview({
  settings,
  onToggleMode,
}: {
  settings: AppearanceSettings
  onToggleMode: () => void
}) {
  return (
    <div className="flex w-full max-w-xl flex-wrap items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
          <div className="scale-125">
            <EaseThemeToggle
              mode={settings.mode}
              transition={settings.themeTransition}
              transitionStart={settings.themeTransitionStart}
              toggleStyle={settings.themeToggleStyle}
              onToggle={onToggleMode}
              size="md"
            />
          </div>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">Click to test live</span>
      </div>

      <div className="flex items-center gap-2.5 rounded-full border border-border bg-card px-3.5 py-2 shadow-sm">
        <ZunoLogo className="h-4 w-4" />
        <span className="text-xs font-semibold text-foreground">Zuno Header</span>
        <span className="h-3.5 w-px bg-border" />
        <EaseThemeToggle
          mode={settings.mode}
          transition={settings.themeTransition}
          transitionStart={settings.themeTransitionStart}
          toggleStyle={settings.themeToggleStyle}
          onToggle={onToggleMode}
          size="sm"
        />
      </div>
    </div>
  )
}

/** 11. Theme Transition Live Origin & Trigger Preview */
export function ThemeTransitionLivePreview({
  settings,
  onToggleMode,
}: {
  settings: AppearanceSettings
  onToggleMode: () => void
}) {
  const originPos: Record<ThemeTransitionStartId, string> = {
    trigger: 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
    center: 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
    'top-left': 'left-3 top-3',
    'top-right': 'right-3 top-3',
    'bottom-left': 'left-3 bottom-3',
    'bottom-right': 'right-3 bottom-3',
  }

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
      <div className="relative h-28 w-full max-w-[240px] overflow-hidden rounded-2xl border border-border bg-card">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-16 w-16 rounded-full border border-dashed border-primary/40" />
        </div>
        <span
          className={cn(
            'absolute flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary shadow-sm',
            originPos[settings.themeTransitionStart],
          )}
        >
          <span className="animate-btn-pulse absolute inset-0 rounded-full border border-primary" />
        </span>
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border bg-background/90 px-2 py-0.5 font-mono text-[9.5px] text-muted-foreground">
          {settings.themeTransition} · {settings.themeTransitionStart}
        </span>
      </div>

      <div className="flex flex-col items-center gap-2 sm:items-start">
        <p className="text-xs font-medium text-foreground">
          Live View Transition Test
        </p>
        <p className="max-w-xs text-center text-[11px] text-muted-foreground sm:text-left">
          Triggers a real Dark / Light mode switch using your selected animation and starting origin.
        </p>
        <button
          type="button"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            runThemeViewTransition(onToggleMode, {
              variant: settings.themeTransition,
              start: settings.themeTransitionStart,
              origin: {
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2),
              },
            })
          }}
          className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 cursor-pointer"
        >
          <Wand2 className="h-3.5 w-3.5" />
          <span>Run {settings.themeTransition}</span>
        </button>
      </div>
    </div>
  )
}

/** 12. Layout & Geometry Live Song-List Spacing & Radius Preview */
export function LayoutGeometryPreview({ settings }: { settings: AppearanceSettings }) {
  const radCls =
    settings.radius === 'sharp'
      ? 'rounded-sm'
      : settings.radius === 'round'
        ? 'rounded-3xl'
        : 'rounded-xl'
  const padCls =
    settings.density === 'compact'
      ? 'py-1.5 px-3'
      : settings.density === 'spacious'
        ? 'py-3.5 px-4'
        : 'py-2.5 px-3.5'
  const gapCls =
    settings.density === 'compact'
      ? 'space-y-1'
      : settings.density === 'spacious'
        ? 'space-y-2.5'
        : 'space-y-1.5'

  return (
    <div className={cn('w-full max-w-md', gapCls)}>
      {SAMPLE_TRACKS.slice(0, 3).map((t, i) => (
        <div
          key={t.title}
          className={cn(
            'flex items-center justify-between border transition-all',
            radCls,
            padCls,
            i === 0
              ? 'border-primary/40 bg-secondary text-foreground'
              : 'border-border bg-card text-muted-foreground',
          )}
        >
          <div className="flex items-center gap-2.5">
            <span className={cn('h-6 w-6 bg-background border border-border', radCls)} />
            <span className={cn('text-xs font-medium', i === 0 && 'text-primary')}>{t.title}</span>
          </div>
          <span className="font-mono text-[11px]">{t.dur}</span>
        </div>
      ))}
    </div>
  )
}

/** 13. Play Button Style Live Interactive Preview */
export function PlayButtonLivePreview({
  settings,
  isPlaying,
  onTogglePlay,
}: {
  settings: AppearanceSettings
  isPlaying: boolean
  onTogglePlay: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-2">
        {settings.playButtonStyle === 'waveform' ? (
          <WaveformPlayButton isPlaying={isPlaying} onClick={onTogglePlay} />
        ) : settings.playButtonStyle === 'vinyl' ? (
          <VinylPlayButton isPlaying={isPlaying} onClick={onTogglePlay} />
        ) : (
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform active:scale-95 cursor-pointer"
          >
            <ZunoIcon
              name={isPlaying ? 'pause' : 'play'}
              pack={settings.iconPack}
              filled
              className={cn('h-4.5 w-4.5', !isPlaying && 'translate-x-[1px]')}
            />
          </button>
        )}
        <span className="font-mono text-[10px] text-muted-foreground">
          {isPlaying ? 'Playing · click to pause' : 'Paused · click to play'}
        </span>
      </div>

      {/* Mini Player Bar Context */}
      <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2">
        <ZunoIcon name="prev" pack={settings.iconPack} className="h-3.5 w-3.5 text-muted-foreground" />
        {settings.playButtonStyle === 'waveform' ? (
          <WaveformPlayButton isPlaying={isPlaying} onClick={onTogglePlay} />
        ) : settings.playButtonStyle === 'vinyl' ? (
          <VinylPlayButton isPlaying={isPlaying} onClick={onTogglePlay} />
        ) : (
          <button
            type="button"
            onClick={onTogglePlay}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground cursor-pointer"
          >
            <ZunoIcon
              name={isPlaying ? 'pause' : 'play'}
              pack={settings.iconPack}
              filled
              className="h-3.5 w-3.5"
            />
          </button>
        )}
        <ZunoIcon name="next" pack={settings.iconPack} className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="pl-1">
          <p className="text-xs font-medium text-foreground">midnight_chords</p>
          <p className="font-mono text-[10px] text-muted-foreground">01:24 / 03:32</p>
        </div>
      </div>
    </div>
  )
}

/** 14. Player Bar & Track Rows Live Preview */
export function PlayerBarAndRowsPreview({
  settings,
  isPlaying,
  onTogglePlay,
}: {
  settings: AppearanceSettings
  isPlaying: boolean
  onTogglePlay: () => void
}) {
  return (
    <div className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-background">
      {/* Sample Track Rows reflecting showTrackOverline & showTrackDuration */}
      <div className={cn('space-y-1.5 p-4', settings.playerBarStyle === 'floating' && 'pb-16')}>
        <div className="flex items-center justify-between rounded-xl bg-secondary px-3 py-2">
          <div className="flex items-center gap-3">
            <div className="relative flex h-8 w-8 items-center justify-center">
              {isPlaying && settings.showPlayPulse && (
                <span className="animate-btn-pulse pointer-events-none absolute inset-0 rounded-full border border-primary" />
              )}
              <button
                type="button"
                onClick={onTogglePlay}
                className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground cursor-pointer"
              >
                <ZunoIcon
                  name={isPlaying ? 'pause' : 'play'}
                  pack={settings.iconPack}
                  filled
                  className="h-3 w-3"
                />
              </button>
            </div>
            <div>
              {settings.showTrackOverline && (
                <p className="text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  AMBIENT
                </p>
              )}
              <p className="text-xs font-medium text-primary">midnight_chords</p>
            </div>
          </div>
          {settings.showTrackDuration && (
            <span className="font-mono text-[11px] text-muted-foreground">03:32</span>
          )}
        </div>

        <div className="flex items-center justify-between rounded-xl px-3 py-1.5 text-muted-foreground">
          <div>
            {settings.showTrackOverline && (
              <p className="text-[9.5px] font-medium uppercase tracking-[0.12em] opacity-70">
                SYNTHWAVE
              </p>
            )}
            <p className="text-xs font-medium text-foreground/85">velvet_horizon</p>
          </div>
          {settings.showTrackDuration && (
            <span className="font-mono text-[11px]">04:10</span>
          )}
        </div>
      </div>

      {/* Bottom-Only GradualBlur behind floating dock */}
      {settings.dockGradualBlur && settings.playerBarStyle === 'floating' && (
        <GradualBlur
          position="bottom"
          height="5rem"
          strength={1.5}
          divCount={5}
          curve="bezier"
          exponential
          zIndex={10}
        />
      )}

      {/* Desktop Player Bar Layout Preview (Floating Sticky vs Docked Full-Width) */}
      <div
        className={cn(
          settings.playerBarStyle === 'floating'
            ? 'pointer-events-none absolute inset-x-0 bottom-3 z-20 px-4'
            : 'relative z-20 pt-1',
        )}
      >
        <div
          className={cn(
            'pointer-events-auto flex items-center justify-between gap-3 border-border bg-card px-3.5 py-2.5',
            settings.playerBarStyle === 'floating'
              ? 'rounded-2xl border shadow-lg'
              : 'border-t',
          )}
        >
          <div className="flex items-center gap-2">
            <ZunoIcon name="prev" pack={settings.iconPack} className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ZunoIcon name={isPlaying ? 'pause' : 'play'} pack={settings.iconPack} filled className="h-3 w-3" />
            </span>
            <ZunoIcon name="next" pack={settings.iconPack} className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="flex flex-1 items-center gap-2.5">
            <span className="truncate text-[11px] font-medium text-foreground">midnight_chords</span>
            <Scrubber
              value={44}
              max={100}
              styleVariant={settings.scrubberKnob}
              seed="bar-preview"
              compact
              interactive={false}
              className="flex-1"
            />
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">
            {settings.playerBarStyle === 'floating' ? 'Floating' : 'Docked'}
          </span>
        </div>
      </div>
    </div>
  )
}

/** 15. Active Playing Track + Idle Row Leading Icon Live Preview */
export function PlayingTrackLivePreview({
  settings,
  isPlaying,
  onTogglePlay,
}: {
  settings: AppearanceSettings
  isPlaying: boolean
  onTogglePlay: () => void
}) {
  return (
    <div className="w-full max-w-md space-y-2">
      {/* Active Playing Row */}
      <div
        onClick={onTogglePlay}
        className="flex w-full cursor-pointer items-center justify-between gap-3.5 rounded-2xl bg-secondary px-3.5 py-3 transition-colors"
      >
        <div className="flex items-center gap-3.5">
          {settings.playingStyle === 'equalizer' || settings.playingStyle === 'pulse-bars' ? (
            <div className="h-10 w-10 rounded-lg border border-border bg-card" />
          ) : settings.playingStyle === 'pulse' ? (
            <div className="relative flex h-9 w-9 items-center justify-center">
              {isPlaying && settings.showPlayPulse && (
                <span className="animate-btn-pulse pointer-events-none absolute inset-0 rounded-full border border-primary" />
              )}
              <div className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <ZunoIcon
                  name={isPlaying ? 'pause' : 'play'}
                  pack={settings.iconPack}
                  filled
                  className="h-3.5 w-3.5"
                />
              </div>
            </div>
          ) : (
            <ZunoIcon
              name={isPlaying ? 'pause' : 'play'}
              pack={settings.iconPack}
              filled
              className="h-4 w-4 text-primary"
            />
          )}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              AMBIENT
            </p>
            <p className="text-sm font-medium text-primary">midnight_chords</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {settings.playingStyle === 'equalizer' && isPlaying && (
            <span className="flex h-5 items-end gap-[2.5px]">
              <span className="zuno-eq-bar" />
              <span className="zuno-eq-bar" />
              <span className="zuno-eq-bar" />
              <span className="zuno-eq-bar" />
            </span>
          )}
          {settings.playingStyle === 'pulse-bars' && isPlaying && (
            <Loader2 barCount={5} height={16} width={2.5} gap={2} speed={0.95} />
          )}
          <span className="font-mono text-xs text-muted-foreground">01:24</span>
        </div>
      </div>

      {/* Idle Row Preview showing trackIconStyle */}
      <div className="flex w-full items-center justify-between gap-3.5 rounded-2xl border border-border/60 bg-card/60 px-3.5 py-2.5">
        <div className="flex items-center gap-3.5">
          {settings.trackIconStyle === 'number' ? (
            <span className="flex h-9 w-9 items-center justify-center font-mono text-xs text-muted-foreground">
              02
            </span>
          ) : settings.trackIconStyle === 'filled' ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground">
              <ZunoIcon name="play" pack={settings.iconPack} filled className="h-3.5 w-3.5 translate-x-[0.5px]" />
            </span>
          ) : settings.trackIconStyle === 'minimal' ? (
            <span className="flex h-9 w-9 items-center justify-center text-muted-foreground">
              <ZunoIcon name="play" pack={settings.iconPack} className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground">
              <ZunoIcon name="play" pack={settings.iconPack} className="h-3.5 w-3.5 translate-x-[0.5px]" />
            </span>
          )}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              SYNTHWAVE
            </p>
            <p className="text-sm font-medium text-foreground">velvet_horizon</p>
          </div>
        </div>
        <span className="font-mono text-xs text-muted-foreground">04:10</span>
      </div>
    </div>
  )
}

/** 16. Audio Crossfade Live Curve Stage */
export function AudioCrossfadeLivePreview({ crossfadeSecs }: { crossfadeSecs: number }) {
  const fmt = crossfadeSecs > 0 ? `${crossfadeSecs.toFixed(crossfadeSecs % 1 === 0 ? 0 : 1)}s` : 'Off'
  return (
    <div className="w-full max-w-xl space-y-2.5">
      <div className="flex items-center justify-between font-mono text-[10.5px] text-muted-foreground">
        <span>Track A (Fade Out)</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-foreground">
          <Sparkles className="h-3 w-3 text-primary" />
          Overlap · {fmt}
        </span>
        <span className="text-primary">Track B (Fade In)</span>
      </div>
      <div className="relative h-20 w-full overflow-hidden rounded-xl border border-border bg-card px-3 py-2.5">
        <svg
          viewBox="0 0 320 52"
          preserveAspectRatio="none"
          className="h-full w-full"
          aria-hidden="true"
        >
          {crossfadeSecs > 0 ? (
            <>
              <rect
                x={Math.max(30, 160 - crossfadeSecs * 10)}
                y="4"
                width={Math.min(260, crossfadeSecs * 20)}
                height="44"
                rx="6"
                fill="var(--primary)"
                fillOpacity="0.08"
              />
              <path
                d={`M 0 10 L ${Math.max(70, 160 - crossfadeSecs * 8)} 10 C ${Math.max(100, 160 - crossfadeSecs * 2)} 10, ${Math.min(250, 160 + crossfadeSecs * 4)} 44, ${Math.min(290, 160 + crossfadeSecs * 10)} 44`}
                fill="none"
                stroke="var(--muted-foreground)"
                strokeOpacity="0.55"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <path
                d={`M ${Math.max(30, 160 - crossfadeSecs * 10)} 44 C ${Math.max(70, 160 - crossfadeSecs * 4)} 44, ${Math.min(220, 160 + crossfadeSecs * 2)} 10, ${Math.min(250, 160 + crossfadeSecs * 8)} 10 L 320 10`}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              <path
                d="M 0 12 L 158 12 L 158 44"
                fill="none"
                stroke="var(--muted-foreground)"
                strokeOpacity="0.5"
                strokeWidth="2.2"
              />
              <path
                d="M 162 44 L 162 12 L 320 12"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2.2"
              />
            </>
          )}
        </svg>
      </div>
    </div>
  )
}
