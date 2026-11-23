import { useState } from 'react'
import {
  Check,
  LayoutGrid,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Type,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ACCENT_PRESETS,
  DEFAULT_APPEARANCE,
  FONT_PRESETS,
  THEME_PRESETS,
  type AppearanceSettings,
  type BorderStyleId,
  type DensityId,
  type FontSizeId,
  type IconStrokeId,
  type PlayerBarStyleId,
  type RadiusStyleId,
  type ScrubberKnobStyleId,
  type TrackIconStyleId,
} from '@/lib/appearance'

type CustomizeTab = 'themes' | 'styles' | 'fonts' | 'icons' | 'components'

interface CustomizePageProps {
  settings: AppearanceSettings
  onChange: (patch: Partial<AppearanceSettings>) => void
  onReset: () => void
}

export function CustomizePage({ settings, onChange, onReset }: CustomizePageProps) {
  const [section, setSection] = useState<CustomizeTab>('themes')

  const tabs: { id: CustomizeTab; label: string; icon: typeof Palette }[] = [
    { id: 'themes', label: 'Themes', icon: Palette },
    { id: 'styles', label: 'Styles', icon: SlidersHorizontal },
    { id: 'fonts', label: 'Fonts', icon: Type },
    { id: 'icons', label: 'Icons', icon: Sparkles },
    { id: 'components', label: 'Components', icon: LayoutGrid },
  ]

  const isModified =
    JSON.stringify(settings) !== JSON.stringify(DEFAULT_APPEARANCE)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 pb-10 pt-6 sm:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            APPEARANCE
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
            Customize
          </h1>
        </div>

        {isModified && (
          <button
            type="button"
            onClick={onReset}
            className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset default
          </button>
        )}
      </div>

      {/* Category Pill Bar */}
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => {
          const Icon = t.icon
          const active = section === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSection(t.id)}
              className={cn(
                'flex h-9 items-center gap-2 rounded-full px-4 text-xs font-medium transition-colors cursor-pointer',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* THEMES */}
      {section === 'themes' && (
        <div className="space-y-6">
          <Group
            title="Base Theme (60 / 30)"
            description="Choose the primary canvas and surface tone."
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {THEME_PRESETS.map((theme) => {
                const active = settings.theme === theme.id
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => onChange({ theme: theme.id })}
                    className={cn(
                      'flex flex-col gap-2.5 rounded-2xl border p-3 text-left transition-colors cursor-pointer',
                      active
                        ? 'border-primary bg-secondary'
                        : 'border-border bg-card hover:bg-secondary/60',
                    )}
                  >
                    {/* Mini 60/30/10 swatch preview */}
                    <div
                      className="flex h-12 w-full overflow-hidden rounded-xl border border-black/20"
                      style={{ backgroundColor: theme.background }}
                    >
                      <div
                        className="h-full w-1/3"
                        style={{ backgroundColor: theme.card }}
                      />
                      <div className="flex flex-1 items-end justify-end p-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: theme.primary }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">
                        {theme.label}
                      </span>
                      {active && <Check className="h-3.5 w-3.5 text-primary" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </Group>

          <Group
            title="Accent Color (10%)"
            description="Applies only to active indicators, play controls, and progress fill."
          >
            <div className="flex flex-wrap gap-2.5">
              {ACCENT_PRESETS.map((acc) => {
                const active = settings.accent === acc.id
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => onChange({ accent: acc.id })}
                    className={cn(
                      'flex items-center gap-2.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer',
                      active
                        ? 'border-primary bg-secondary text-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                    )}
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-white/20"
                      style={{ backgroundColor: acc.swatch }}
                    />
                    <span>{acc.label}</span>
                  </button>
                )
              })}
            </div>
          </Group>
        </div>
      )}

      {/* STYLES */}
      {section === 'styles' && (
        <div className="space-y-6">
          <Group
            title="Corner Radius"
            description="Controls roundness across rows, cards, and modals."
          >
            <Segmented<RadiusStyleId>
              value={settings.radius}
              onChange={(radius) => onChange({ radius })}
              options={[
                { value: 'sharp', label: 'Sharp' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'round', label: 'Round' },
              ]}
            />
          </Group>

          <Group
            title="List Density"
            description="Adjust spacing between songs in lists."
          >
            <Segmented<DensityId>
              value={settings.density}
              onChange={(density) => onChange({ density })}
              options={[
                { value: 'compact', label: 'Compact' },
                { value: 'comfortable', label: 'Comfortable' },
                { value: 'spacious', label: 'Spacious' },
              ]}
            />
          </Group>

          <Group
            title="Borders & Dividers"
            description="Set hairline contrast across sidebars, cards, and player bar."
          >
            <Segmented<BorderStyleId>
              value={settings.borders}
              onChange={(borders) => onChange({ borders })}
              options={[
                { value: 'borderless', label: 'Borderless' },
                { value: 'subtle', label: 'Subtle' },
                { value: 'crisp', label: 'Crisp' },
              ]}
            />
          </Group>
        </div>
      )}

      {/* FONTS */}
      {section === 'fonts' && (
        <div className="space-y-6">
          <Group
            title="Font Family"
            description="Switch typography instantly across every screen."
          >
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {FONT_PRESETS.map((f) => {
                const active = settings.fontFamily === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onChange({ fontFamily: f.id })}
                    style={{ fontFamily: f.stack }}
                    className={cn(
                      'flex flex-col justify-between rounded-2xl border p-4 text-left transition-colors cursor-pointer',
                      active
                        ? 'border-primary bg-secondary'
                        : 'border-border bg-card hover:bg-secondary/60',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">
                        {f.label}
                      </span>
                      {active && <Check className="h-3.5 w-3.5 text-primary" />}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{f.sample}</p>
                  </button>
                )
              })}
            </div>
          </Group>

          <Group
            title="Text Size"
            description="Scale UI typography for desktop or mobile readability."
          >
            <Segmented<FontSizeId>
              value={settings.fontSize}
              onChange={(fontSize) => onChange({ fontSize })}
              options={[
                { value: 'sm', label: 'Small' },
                { value: 'md', label: 'Default' },
                { value: 'lg', label: 'Large' },
              ]}
            />
          </Group>
        </div>
      )}

      {/* ICONS */}
      {section === 'icons' && (
        <div className="space-y-6">
          <Group
            title="Icon Stroke Weight"
            description="Changes line weight of every icon across the app."
          >
            <Segmented<IconStrokeId>
              value={settings.iconStroke}
              onChange={(iconStroke) => onChange({ iconStroke })}
              options={[
                { value: 'thin', label: 'Thin' },
                { value: 'regular', label: 'Regular' },
                { value: 'bold', label: 'Bold' },
              ]}
            />
          </Group>

          <Group
            title="Track Leading Icon"
            description="Choose how play indicators appear on each song row."
          >
            <Segmented<TrackIconStyleId>
              value={settings.trackIconStyle}
              onChange={(trackIconStyle) => onChange({ trackIconStyle })}
              options={[
                { value: 'ring', label: 'Circle Ring' },
                { value: 'filled', label: 'Filled Circle' },
                { value: 'minimal', label: 'Minimal' },
                { value: 'number', label: 'Track Number' },
              ]}
            />
          </Group>
        </div>
      )}

      {/* COMPONENTS */}
      {section === 'components' && (
        <div className="space-y-6">
          <Group
            title="Desktop Player Bar"
            description="Style of the bottom horizontal playback bar on desktop."
          >
            <Segmented<PlayerBarStyleId>
              value={settings.playerBarStyle}
              onChange={(playerBarStyle) => onChange({ playerBarStyle })}
              options={[
                { value: 'docked', label: 'Docked Full-Width' },
                { value: 'floating', label: 'Floating Capsule' },
              ]}
            />
          </Group>

          <Group
            title="Scrubber Knob"
            description="Control the look of the progress scrubber handle."
          >
            <Segmented<ScrubberKnobStyleId>
              value={settings.scrubberKnob}
              onChange={(scrubberKnob) => onChange({ scrubberKnob })}
              options={[
                { value: 'ring', label: 'Hollow Ring' },
                { value: 'solid', label: 'Solid Dot' },
                { value: 'line', label: 'Minimal Line' },
              ]}
            />
          </Group>

          <Group
            title="Visible Elements"
            description="Show or hide UI components to keep your player as minimal as you like."
          >
            <div className="divide-y divide-border rounded-2xl border border-border bg-card">
              <ToggleRow
                label="Last Played section"
                description="Show recently played songs at the top of the Songs home page."
                checked={settings.showLastPlayed}
                onChange={(showLastPlayed) => onChange({ showLastPlayed })}
              />
              <ToggleRow
                label="Inline row progress bar"
                description="Display a mini progress bar inside the currently playing song row."
                checked={settings.showInlineProgress}
                onChange={(showInlineProgress) => onChange({ showInlineProgress })}
              />
              <ToggleRow
                label="Artist / folder overline"
                description="Show the uppercase artist or folder label above each song title."
                checked={settings.showTrackOverline}
                onChange={(showTrackOverline) => onChange({ showTrackOverline })}
              />
              <ToggleRow
                label="Track duration"
                description="Show song lengths on the right side of track rows."
                checked={settings.showTrackDuration}
                onChange={(showTrackDuration) => onChange({ showTrackDuration })}
              />
            </div>
          </Group>
        </div>
      )}
    </div>
  )
}

function Group({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex flex-wrap gap-1.5 rounded-2xl border border-border bg-card p-1.5">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-xl px-4 py-2 text-xs font-medium transition-colors cursor-pointer',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-secondary/40 cursor-pointer"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <span
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-accent',
        )}
      >
        <span
          className={cn(
            'inline-block h-3.5 w-3.5 rounded-full transition-transform',
            checked
              ? 'translate-x-[18px] bg-primary-foreground'
              : 'translate-x-[3px] bg-muted-foreground',
          )}
        />
      </span>
    </button>
  )
}
