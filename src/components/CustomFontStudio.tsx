import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Search, Type, Upload, X } from 'lucide-react'
import {
  clearSavedCustomFontFile,
  MONO_FONT_PRESETS,
  queryInstalledSystemFonts,
  registerCustomFontFile,
  sanitizeFontFamilyName,
  UI_FONT_PRESETS,
  type FontPreset,
} from '@/lib/fonts'
import { CompactScrollArea } from '@/components/CompactScrollArea'
import { DEFAULT_APPEARANCE, type AppearanceSettings } from '@/lib/appearance'
import { cn } from '@/lib/utils'

interface CustomFontStudioProps {
  settings: AppearanceSettings
  onChange: (patch: Partial<AppearanceSettings>) => void
}

interface FontSlotPanelProps {
  slot: 'ui' | 'mono'
  title: string
  subtitle: string
  presets: readonly FontPreset[]
  activePresetId: string
  customValue: string
  draft: string
  placeholder: string
  monoInput?: boolean
  onDraftChange: (v: string) => void
  onSelectPreset: (id: string) => void
  onApplyCustom: (raw: string) => void
  onUploadFile: (file: File | undefined) => void
  onOpenSystemFonts: () => void
}

function FontSlotPanel({
  slot,
  title,
  subtitle,
  presets,
  activePresetId,
  customValue,
  draft,
  placeholder,
  monoInput = false,
  onDraftChange,
  onSelectPreset,
  onApplyCustom,
  onUploadFile,
  onOpenSystemFonts,
}: FontSlotPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-foreground">{title}</div>
          <div className="text-[11px] text-muted-foreground">{subtitle}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenSystemFonts}
            className="h-7 rounded-lg px-2 font-mono text-[10.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
          >
            OS Fonts
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-card px-2 font-mono text-[10.5px] text-foreground transition-colors hover:bg-secondary cursor-pointer"
          >
            <Upload className="h-3 w-3" /> Upload
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".woff2,.woff,.ttf,.otf"
            className="hidden"
            onChange={(e) => {
              onUploadFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => {
          const active = !customValue && activePresetId === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectPreset(preset.id)}
              style={{ fontFamily: preset.stack }}
              className={cn(
                'cursor-pointer rounded-lg border px-2.5 py-1 text-[11.5px] transition-colors',
                active
                  ? 'border-primary bg-secondary font-medium text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {preset.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onApplyCustom(draft)
          }}
          placeholder={placeholder}
          className={cn(
            'min-w-0 flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none',
            monoInput ? 'font-mono text-[11.5px]' : 'text-xs',
          )}
        />
        {draft && (
          <button
            type="button"
            onClick={() => onApplyCustom('')}
            aria-label={`Clear custom ${slot} font`}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onApplyCustom(draft)}
          className="h-7 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 cursor-pointer"
        >
          Apply
        </button>
      </div>
    </div>
  )
}

/**
 * Zenko-inspired Custom Font Studio:
 * Pick from self-hosted UI + Monospace fonts, enter any OS-installed font,
 * browse local system fonts, or upload `.woff2` / `.ttf` / `.otf` files.
 */
export function CustomFontStudio({ settings, onChange }: CustomFontStudioProps) {
  const [uiInput, setUiInput] = useState(settings.customUiFont || '')
  const [monoInput, setMonoInput] = useState(settings.customMonoFont || '')
  const [fontMessage, setFontMessage] = useState('')
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const [systemFontFilter, setSystemFontFilter] = useState('')
  const [systemPickerTarget, setSystemPickerTarget] = useState<'ui' | 'mono' | null>(null)
  const [loadingSystemFonts, setLoadingSystemFonts] = useState(false)

  // Keep draft inputs synced if parent resets appearance settings externally.
  useEffect(() => {
    setUiInput(settings.customUiFont || '')
  }, [settings.customUiFont])

  useEffect(() => {
    setMonoInput(settings.customMonoFont || '')
  }, [settings.customMonoFont])

  const applyCustomName = (slot: 'ui' | 'mono', raw: string) => {
    const clean = sanitizeFontFamilyName(raw)
    if (slot === 'ui') {
      setUiInput(clean)
      onChange({ customUiFont: clean })
    } else {
      setMonoInput(clean)
      onChange({ customMonoFont: clean })
    }
    setFontMessage(clean ? `Applied custom ${slot.toUpperCase()} font: ${clean}` : '')
  }

  const handleUpload = async (slot: 'ui' | 'mono', file: File | undefined) => {
    if (!file) return
    try {
      const family = await registerCustomFontFile(slot, file)
      applyCustomName(slot, family)
      setFontMessage(`Loaded & saved "${family}" (${file.name})`)
    } catch (err) {
      setFontMessage(err instanceof Error ? err.message : 'Could not load font file')
    }
  }

  const openSystemFonts = async (target: 'ui' | 'mono') => {
    if (systemPickerTarget === target) {
      setSystemPickerTarget(null)
      return
    }
    setSystemPickerTarget(target)
    if (systemFonts.length > 0) return
    setLoadingSystemFonts(true)
    try {
      const list = await queryInstalledSystemFonts()
      setSystemFonts(list)
      if (list.length === 0) {
        setFontMessage(
          'Browser local font picker unavailable — type any installed font name or upload .woff2/.ttf/.otf.',
        )
      }
    } catch {
      setFontMessage(
        'Local font access declined — type any installed font name or upload a font file.',
      )
    } finally {
      setLoadingSystemFonts(false)
    }
  }

  const filteredSystemFonts = useMemo(() => {
    const q = systemFontFilter.trim().toLowerCase()
    if (!q) return systemFonts
    return systemFonts.filter((f) => f.toLowerCase().includes(q))
  }, [systemFonts, systemFontFilter])

  return (
    <div className="z-surface-card flex flex-col gap-5 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Type className="h-4 w-4 text-primary" />
            <span>Custom Font Studio</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose from {UI_FONT_PRESETS.length} curated UI &amp; {MONO_FONT_PRESETS.length} mono typefaces, pick an OS font, or upload .woff2 / .ttf / .otf files.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            clearSavedCustomFontFile('ui')
            clearSavedCustomFontFile('mono')
            setUiInput('')
            setMonoInput('')
            setFontMessage('')
            onChange({
              fontFamily: DEFAULT_APPEARANCE.fontFamily,
              monoFont: DEFAULT_APPEARANCE.monoFont,
              customUiFont: '',
              customMonoFont: '',
            })
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
        >
          <RotateCcw className="h-3 w-3" />
          Restore Fonts
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FontSlotPanel
          slot="ui"
          title="Interface Font"
          subtitle="Song titles, menus, headings & controls"
          presets={UI_FONT_PRESETS}
          activePresetId={settings.fontFamily}
          customValue={settings.customUiFont}
          draft={uiInput}
          placeholder="Custom UI font (e.g. SF Pro, Poppins)..."
          onDraftChange={setUiInput}
          onSelectPreset={(id) => {
            setUiInput('')
            onChange({ fontFamily: id, customUiFont: '' })
          }}
          onApplyCustom={(raw) => applyCustomName('ui', raw)}
          onUploadFile={(f) => handleUpload('ui', f)}
          onOpenSystemFonts={() => openSystemFonts('ui')}
        />

        <FontSlotPanel
          slot="mono"
          title="Timestamps & Mono Font"
          subtitle="Durations, EQ readouts, dB values & hex codes"
          presets={MONO_FONT_PRESETS}
          activePresetId={settings.monoFont}
          customValue={settings.customMonoFont}
          draft={monoInput}
          placeholder="Custom mono font (e.g. Iosevka, Hack)..."
          monoInput
          onDraftChange={setMonoInput}
          onSelectPreset={(id) => {
            setMonoInput('')
            onChange({ monoFont: id, customMonoFont: '' })
          }}
          onApplyCustom={(raw) => applyCustomName('mono', raw)}
          onUploadFile={(f) => handleUpload('mono', f)}
          onOpenSystemFonts={() => openSystemFonts('mono')}
        />
      </div>

      {/* Local OS Font Picker Drawer */}
      {systemPickerTarget && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={systemFontFilter}
                onChange={(e) => setSystemFontFilter(e.target.value)}
                placeholder={`Filter installed OS fonts for ${systemPickerTarget.toUpperCase()}...`}
                className="w-full rounded-lg border border-border bg-card py-1 pl-8 pr-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setSystemPickerTarget(null)}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {loadingSystemFonts ? (
            <div className="py-2 font-mono text-[11px] text-muted-foreground">
              Reading installed system fonts...
            </div>
          ) : filteredSystemFonts.length === 0 ? (
            <div className="py-2 font-mono text-[11px] text-muted-foreground">
              No local system fonts listed — type a font name above or upload a .woff2 / .ttf / .otf file.
            </div>
          ) : (
            <CompactScrollArea autoHeight viewportClassName="max-h-36 pr-2.5">
              <div className="flex flex-wrap gap-1.5">
                {filteredSystemFonts.slice(0, 80).map((fam) => (
                  <button
                    key={fam}
                    type="button"
                    onClick={() => {
                      applyCustomName(systemPickerTarget, fam)
                      setSystemPickerTarget(null)
                    }}
                    style={{ fontFamily: `'${fam}', sans-serif` }}
                    className="cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground hover:border-primary"
                  >
                    {fam}
                  </button>
                ))}
              </div>
              {filteredSystemFonts.length > 80 && (
                <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                  Showing 80 of {filteredSystemFonts.length} fonts — type above to narrow down.
                </p>
              )}
            </CompactScrollArea>
          )}
        </div>
      )}

      {/* Live Specimen Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-background px-3.5 py-2.5">
        <div className="text-[13px] text-foreground">
          Midnight Chords · Ultra-lightweight local music player
        </div>
        <code className="font-mono text-[11px] text-primary">
          {settings.customUiFont || settings.fontFamily} · {settings.customMonoFont || settings.monoFont}
        </code>
      </div>

      {fontMessage && (
        <div className="font-mono text-[11px] text-muted-foreground">{fontMessage}</div>
      )}
    </div>
  )
}
