import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Antenna,
  Bookmark,
  Check,
  Compass,
  Globe,
  Link2,
  LoaderCircle,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Signal,
  Square,
  Trash2,
  Wand2,
  WifiOff,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  AccordionChevron,
  AccordionPanel,
  MotionSwitch,
  SlidingTabs,
  TextSwap,
} from '@/components/ui/motion'
import { Tooltip } from '@/components/ui/tooltip'
import { Loader2 } from '@/components/PulseBarsLoader'
import { cn } from '@/lib/utils'
import type { AppearanceSettings } from '@/lib/appearance'
import {
  DISCOVER_PRESETS,
  FM_BANDS,
  RADIO_CATEGORIES,
  type FmBandId,
  type OnlineStation,
  type RadioCategory,
} from '@/lib/radioStations'
import {
  clampFreqToBand,
  discoverStations,
  formatMhz,
  mergeOnlineStations,
  resolveRadioLink,
  type ActiveRadioPlayback,
  type DiscoveredStation,
  type FmHardwareStatus,
  type OfflineSignalStation,
  type RadioStoreData,
} from '@/lib/radioStore'

type RadioTab = 'online' | 'discover' | 'offline' | 'marked'

interface RadioPageProps {
  store: RadioStoreData
  activeRadio: ActiveRadioPlayback | null
  fmHardware: FmHardwareStatus | null
  appearance: AppearanceSettings
  onRefreshHardware: () => void
  onPlayOnlineStation: (station: OnlineStation, pool: OnlineStation[]) => void
  onReconnectRadio: () => void
  onDisconnectRadio: () => void
  onStopRadio: () => void
  onToggleMarkOnline: (stationId: string) => void
  onAddCustomOnline: (
    station: {
      name: string
      url: string
      country: string
      category: string
      tags: string[]
      bitrate: number
      codec: string
    },
    markImmediately: boolean,
  ) => OnlineStation
  onDeleteCustomOnline: (stationId: string) => void
  onSaveDiscoveredStation: (station: DiscoveredStation) => void
  onChangeBand: (band: FmBandId) => void
  onChangeDialFreq: (freqMhz: number) => void
  onTuneOfflineSignal: (freqMhz: number, label?: string, signalId?: string) => void
  onUpsertOfflineSignal: (signal: Omit<OfflineSignalStation, 'id' | 'created_at'>, existingId?: string) => void
  onToggleMarkOffline: (signalId: string) => void
  onDeleteOfflineSignal: (signalId: string) => void
  onExpandNowPlaying: () => void
}

export function RadioPage({
  store,
  activeRadio,
  fmHardware,
  appearance,
  onRefreshHardware,
  onPlayOnlineStation,
  onReconnectRadio,
  onDisconnectRadio,
  onStopRadio,
  onToggleMarkOnline,
  onAddCustomOnline,
  onDeleteCustomOnline,
  onSaveDiscoveredStation,
  onChangeBand,
  onChangeDialFreq,
  onTuneOfflineSignal,
  onUpsertOfflineSignal,
  onToggleMarkOffline,
  onDeleteOfflineSignal,
  onExpandNowPlaying,
}: RadioPageProps) {
  const playingStyle = appearance.playingStyle
  const [tab, setTab] = useState<RadioTab>('online')

  /** High-contrast playing indicator matching Zuno's active playingStyle (never white-on-white). */
  const renderFmRowBadge = (isActive: boolean, isPlayingThis: boolean, isBufferingThis: boolean) => {
    if (isBufferingThis) {
      return <LoaderCircle className="h-4 w-4 animate-spin" />
    }
    if (isPlayingThis) {
      if (playingStyle === 'equalizer') {
        return (
          <span className="flex h-4 items-end justify-center gap-[2px]" aria-label="Playing">
            <span className="zuno-eq-bar" style={{ backgroundColor: 'currentColor' }} />
            <span className="zuno-eq-bar" style={{ backgroundColor: 'currentColor' }} />
            <span className="zuno-eq-bar" style={{ backgroundColor: 'currentColor' }} />
            <span className="zuno-eq-bar" style={{ backgroundColor: 'currentColor' }} />
          </span>
        )
      }
      return (
        <Loader2
          barCount={4}
          height={14}
          width={2.2}
          gap={2}
          speed={0.92}
          color="currentColor"
        />
      )
    }
    if (isActive) {
      return <RefreshCw className="h-3.5 w-3.5" />
    }
    return <Radio className="h-4 w-4" />
  }

  // ── Online FM filters ──
  const [onlineSearch, setOnlineSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<RadioCategory | 'All' | 'My Links'>('All')

  // ── Discover state ──
  const [discoverQuery, setDiscoverQuery] = useState('')
  const [discoverPresetId, setDiscoverPresetId] = useState<string | null>(null)
  const [discoverResults, setDiscoverResults] = useState<DiscoveredStation[]>([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const [discoverTouched, setDiscoverTouched] = useState(false)

  // ── Offline FM tuner UI state ──
  const [hwGuideOpen, setHwGuideOpen] = useState(false)
  const dialRef = useRef<HTMLDivElement | null>(null)
  const draggingDialRef = useRef(false)

  // ── Marked filter ──
  const [markedFilter, setMarkedFilter] = useState<'all' | 'offline' | 'online'>('all')

  // ── Paste Link Dialog state ──
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkName, setLinkName] = useState('')
  const [linkCountry, setLinkCountry] = useState('')
  const [linkGenre, setLinkGenre] = useState('')
  const [linkBitrate, setLinkBitrate] = useState(0)
  const [linkCodec, setLinkCodec] = useState('STREAM')
  const [linkMarkOnAdd, setLinkMarkOnAdd] = useState(true)
  const [linkProbing, setLinkProbing] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  // ── Mark / Add Offline Signal Dialog state ──
  const [signalModalOpen, setSignalModalOpen] = useState(false)
  const [editingSignalId, setEditingSignalId] = useState<string | undefined>(undefined)
  const [sigFreq, setSigFreq] = useState('98.3')
  const [sigName, setSigName] = useState('')
  const [sigRegion, setSigRegion] = useState('')
  const [sigGenre, setSigGenre] = useState('')
  const [sigNotes, setSigNotes] = useState('')
  const [sigMarked, setSigMarked] = useState(true)
  const [sigError, setSigError] = useState<string | null>(null)

  const allOnlineStations = useMemo(() => mergeOnlineStations(store), [store])
  const markedOnlineSet = useMemo(() => new Set(store.marked_online_ids), [store.marked_online_ids])
  const savedUrlSet = useMemo(
    () => new Set(allOnlineStations.map((s) => s.url.trim().toLowerCase())),
    [allOnlineStations],
  )

  const markedOnlineStations = useMemo(
    () => allOnlineStations.filter((s) => markedOnlineSet.has(s.id)),
    [allOnlineStations, markedOnlineSet],
  )

  const sortedOfflineSignals = useMemo(
    () => [...store.offline_signals].sort((a, b) => a.freq_mhz - b.freq_mhz),
    [store.offline_signals],
  )

  const markedOfflineSignals = useMemo(
    () => sortedOfflineSignals.filter((s) => s.marked),
    [sortedOfflineSignals],
  )

  const totalMarkedCount = markedOnlineStations.length + markedOfflineSignals.length

  const filteredOnline = useMemo(() => {
    const q = onlineSearch.trim().toLowerCase()
    return allOnlineStations.filter((s) => {
      if (selectedCategory === 'My Links' && !s.isCustom) return false
      if (
        selectedCategory !== 'All' &&
        selectedCategory !== 'My Links' &&
        s.category !== selectedCategory
      ) {
        return false
      }
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        s.country.toLowerCase().includes(q) ||
        s.language.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [allOnlineStations, onlineSearch, selectedCategory])

  // ── Discover fetcher ──
  const runDiscover = useCallback(
    async (opts: { query?: string; tag?: string; country?: string; language?: string }) => {
      setDiscoverTouched(true)
      setDiscoverLoading(true)
      setDiscoverError(null)
      try {
        const res = await discoverStations({ ...opts, limit: 40 })
        setDiscoverResults(res)
      } catch (err) {
        setDiscoverResults([])
        setDiscoverError(
          String(err).replace(/^Error:\s*/i, '') ||
            'Unable to reach the online station directory. Check your internet connection.',
        )
      } finally {
        setDiscoverLoading(false)
      }
    },
    [],
  )

  // Auto-load popular global stations the first time user opens Discover
  useEffect(() => {
    if (tab === 'discover' && !discoverTouched && !discoverLoading) {
      runDiscover({ tag: 'music' })
    }
  }, [tab, discoverTouched, discoverLoading, runDiscover])

  // ── Paste Link modal helpers ──
  const openPasteLinkModal = () => {
    setLinkUrl('')
    setLinkName('')
    setLinkCountry('')
    setLinkGenre('')
    setLinkBitrate(0)
    setLinkCodec('STREAM')
    setLinkMarkOnAdd(true)
    setLinkError(null)
    setLinkModalOpen(true)
  }

  const handleProbeLink = async () => {
    const trimmed = linkUrl.trim()
    if (!trimmed) {
      setLinkError('Paste a stream URL first (e.g. https://... .mp3, .aac, .m3u8, .pls).')
      return
    }
    setLinkProbing(true)
    setLinkError(null)
    try {
      const info = await resolveRadioLink(trimmed)
      setLinkUrl(info.resolved_url)
      if (info.name && !linkName.trim()) setLinkName(info.name)
      if (info.genre && !linkGenre.trim()) setLinkGenre(info.genre)
      if (info.bitrate) setLinkBitrate(info.bitrate)
      if (info.is_hls) {
        setLinkCodec('HLS')
      } else if (info.content_type) {
        const ct = info.content_type.toLowerCase()
        if (ct.includes('aac')) setLinkCodec('AAC')
        else if (ct.includes('ogg')) setLinkCodec('OGG')
        else if (ct.includes('mpeg') || ct.includes('mp3')) setLinkCodec('MP3')
      }
    } catch (err) {
      setLinkError(String(err).replace(/^Error:\s*/i, ''))
    } finally {
      setLinkProbing(false)
    }
  }

  const deriveNameFromUrl = (raw: string): string => {
    try {
      const u = new URL(raw)
      const tail = u.pathname
        .split('/')
        .filter(Boolean)
        .pop()
        ?.replace(/\.(mp3|aac|ogg|m3u8?|pls)$/i, '')
      return tail ? `${u.hostname.replace(/^www\./, '')} · ${tail}` : u.hostname
    } catch {
      return 'Custom Radio Stream'
    }
  }

  const handleTestPlayLink = async () => {
    const trimmed = linkUrl.trim()
    if (!/^https?:\/\/\S+\.\S+/i.test(trimmed)) {
      setLinkError('Please enter a valid http:// or https:// stream URL.')
      return
    }
    setLinkError(null)
    let playUrl = trimmed
    let detectedName = linkName.trim()
    if (/\.(pls|m3u)(\?|$)/i.test(trimmed)) {
      setLinkProbing(true)
      try {
        const info = await resolveRadioLink(trimmed)
        playUrl = info.resolved_url
        setLinkUrl(playUrl)
        if (!detectedName && info.name) {
          detectedName = info.name
          setLinkName(info.name)
        }
      } catch {
        /* try direct url */
      } finally {
        setLinkProbing(false)
      }
    }
    const tempStation: OnlineStation = {
      id: `preview-${Date.now()}`,
      name: detectedName || deriveNameFromUrl(playUrl),
      url: playUrl,
      category: 'Custom',
      country: linkCountry.trim() || 'Custom Link',
      language: '',
      tags: linkGenre.trim() ? [linkGenre.trim()] : [],
      bitrate: linkBitrate,
      codec: linkCodec,
      isCustom: true,
    }
    onPlayOnlineStation(tempStation, [tempStation])
  }

  const handleSaveCustomLink = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = linkUrl.trim()
    if (!/^https?:\/\/\S+\.\S+/i.test(trimmed)) {
      setLinkError('Please paste a valid http:// or https:// stream link.')
      return
    }
    setLinkError(null)
    let finalUrl = trimmed
    let finalName = linkName.trim()
    let finalGenre = linkGenre.trim()
    let finalBitrate = linkBitrate
    let finalCodec = linkCodec

    if (/\.(pls|m3u)(\?|$)/i.test(trimmed)) {
      setLinkProbing(true)
      try {
        const info = await resolveRadioLink(trimmed)
        finalUrl = info.resolved_url
        if (!finalName && info.name) finalName = info.name
        if (!finalGenre && info.genre) finalGenre = info.genre
        if (!finalBitrate && info.bitrate) finalBitrate = info.bitrate
        if (info.is_hls) finalCodec = 'HLS'
      } catch {
        /* save raw url */
      } finally {
        setLinkProbing(false)
      }
    }

    const created = onAddCustomOnline(
      {
        name: finalName || deriveNameFromUrl(finalUrl),
        url: finalUrl,
        country: linkCountry.trim() || 'Custom Link',
        category: 'Custom',
        tags: finalGenre ? finalGenre.split(',').map((t) => t.trim()).filter(Boolean) : [],
        bitrate: finalBitrate,
        codec: finalCodec,
      },
      linkMarkOnAdd,
    )
    setLinkModalOpen(false)
    onPlayOnlineStation(created, [created, ...allOnlineStations])
  }

  // ── Offline FM Dial & Signal Modal helpers ──
  const bandSpec = FM_BANDS[store.band]
  const currentFreq = clampFreqToBand(store.last_freq_mhz, store.band)
  const matchedOfflineSignal = useMemo(
    () =>
      store.offline_signals.find(
        (s) => Math.abs(s.freq_mhz - currentFreq) < 0.051,
      ) ?? null,
    [store.offline_signals, currentFreq],
  )

  const bandSignals = useMemo(
    () =>
      sortedOfflineSignals.filter(
        (s) => s.freq_mhz >= bandSpec.minMhz - 0.05 && s.freq_mhz <= bandSpec.maxMhz + 0.05,
      ),
    [sortedOfflineSignals, bandSpec],
  )

  const freqToPct = (f: number) =>
    Math.max(0, Math.min(100, ((f - bandSpec.minMhz) / (bandSpec.maxMhz - bandSpec.minMhz)) * 100))

  const updateFreqFromClientX = (clientX: number) => {
    const el = dialRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const raw = bandSpec.minMhz + ratio * (bandSpec.maxMhz - bandSpec.minMhz)
    onChangeDialFreq(clampFreqToBand(raw, store.band))
  }

  const handleStepFreq = (delta: number) => {
    const next = clampFreqToBand(currentFreq + delta, store.band)
    onChangeDialFreq(next)
    if (activeRadio?.kind === 'offline' && activeRadio.isPlaying && fmHardware?.available) {
      const hit = store.offline_signals.find((s) => Math.abs(s.freq_mhz - next) < 0.051)
      onTuneOfflineSignal(next, hit?.name, hit?.id)
    }
  }

  const openSignalModal = (existing?: OfflineSignalStation, presetFreq?: number) => {
    if (existing) {
      setEditingSignalId(existing.id)
      setSigFreq(existing.freq_mhz.toFixed(1))
      setSigName(existing.name)
      setSigRegion(existing.region)
      setSigGenre(existing.genre)
      setSigNotes(existing.notes)
      setSigMarked(existing.marked)
    } else {
      setEditingSignalId(undefined)
      setSigFreq((presetFreq ?? currentFreq).toFixed(1))
      setSigName('')
      setSigRegion('')
      setSigGenre('')
      setSigNotes('')
      setSigMarked(true)
    }
    setSigError(null)
    setSignalModalOpen(true)
  }

  const handleSaveOfflineSignal = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = Number.parseFloat(sigFreq)
    if (!Number.isFinite(parsed) || parsed < 64.0 || parsed > 108.0) {
      setSigError('Enter a valid FM frequency between 64.0 and 108.0 MHz.')
      return
    }
    const cleanFreq = Math.round(parsed * 10) / 10
    const cleanName = sigName.trim() || `FM ${cleanFreq.toFixed(1)} MHz`
    onUpsertOfflineSignal(
      {
        freq_mhz: cleanFreq,
        name: cleanName,
        region: sigRegion.trim(),
        genre: sigGenre.trim(),
        notes: sigNotes.trim(),
        band: store.band,
        marked: sigMarked,
      },
      editingSignalId,
    )
    onChangeDialFreq(clampFreqToBand(cleanFreq, store.band))
    setSignalModalOpen(false)
  }

  // Major dial tick marks
  const dialTicks = useMemo(() => {
    const ticks: Array<{ freq: number; pct: number; major: boolean }> = []
    const startInt = Math.ceil(bandSpec.minMhz * 2) / 2
    for (let f = startInt; f <= bandSpec.maxMhz + 0.001; f += 0.5) {
      const rounded = Math.round(f * 10) / 10
      const major = Math.abs(rounded % 2) < 0.01
      ticks.push({ freq: rounded, pct: freqToPct(rounded), major })
    }
    return ticks
  }, [bandSpec])

  const isOfflinePlayingThisFreq =
    activeRadio?.kind === 'offline' &&
    activeRadio.isPlaying &&
    activeRadio.freqMhz !== undefined &&
    Math.abs(activeRadio.freqMhz - currentFreq) < 0.051

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-5 pb-8 pt-6 sm:px-8">
      {/* ── Page Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            FM TUNER · OFFLINE SIGNAL &amp; ONLINE STREAM
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
            FM Radio
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeRadio && (
            <div className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card pl-3 pr-1.5 text-xs">
              {activeRadio.isBuffering ? (
                <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
              ) : activeRadio.isPlaying ? (
                <Loader2
                  barCount={3}
                  height={12}
                  width={2}
                  gap={1.5}
                  speed={0.9}
                  color="var(--primary)"
                  className="shrink-0"
                />
              ) : (
                <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/60" />
              )}
              <button
                type="button"
                onClick={onExpandNowPlaying}
                className="max-w-[150px] truncate font-medium text-foreground hover:text-primary cursor-pointer"
              >
                {activeRadio.name}
              </button>
              <span className="hidden rounded-full bg-secondary px-1.5 py-0.5 font-mono text-[9.5px] uppercase text-muted-foreground sm:inline">
                {activeRadio.isBuffering
                  ? 'CONNECTING'
                  : !activeRadio.isPlaying
                    ? 'OFFLINE'
                    : activeRadio.kind === 'offline'
                      ? formatMhz(activeRadio.freqMhz ?? currentFreq)
                      : 'LIVE'}
              </span>
              <Tooltip
                label={activeRadio.isPlaying ? 'Reconnect FM' : 'Connect FM'}
                side="bottom"
              >
                <button
                  type="button"
                  onClick={onReconnectRadio}
                  aria-label={activeRadio.isPlaying ? 'Reconnect FM' : 'Connect FM'}
                  className="t-press flex h-6 w-6 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary cursor-pointer"
                >
                  <RefreshCw
                    className={cn('h-3 w-3', activeRadio.isBuffering && 'animate-spin')}
                  />
                </button>
              </Tooltip>
              {(activeRadio.isPlaying || activeRadio.isBuffering) && (
                <Tooltip label="Disconnect FM" side="bottom">
                  <button
                    type="button"
                    onClick={onDisconnectRadio}
                    aria-label="Disconnect FM"
                    className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                  >
                    <Square className="h-2.5 w-2.5 fill-current" />
                  </button>
                </Tooltip>
              )}
              <Tooltip label="Close FM banner" side="bottom">
                <button
                  type="button"
                  onClick={onStopRadio}
                  aria-label="Close FM"
                  className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </Tooltip>
            </div>
          )}

          <button
            type="button"
            onClick={openPasteLinkModal}
            className="t-press inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 cursor-pointer"
          >
            <Link2 className="h-3.5 w-3.5" />
            <span>Paste Link</span>
          </button>
        </div>
      </div>

      {/* ── Primary Mode Tabs: Online FM | Discover | Offline FM (Signal) | Marked ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SlidingTabs
          variant="pill"
          ariaLabel="FM Radio Modes"
          value={tab}
          onChange={setTab}
          options={[
            {
              value: 'online',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  <span>Online FM</span>
                  <span className="tabular-nums opacity-70">{allOnlineStations.length}</span>
                </span>
              ),
            },
            {
              value: 'discover',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Compass className="h-3.5 w-3.5" />
                  <span>Discover</span>
                </span>
              ),
            },
            {
              value: 'offline',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Antenna className="h-3.5 w-3.5" />
                  <span>Offline FM</span>
                  {store.offline_signals.length > 0 && (
                    <span className="tabular-nums opacity-70">
                      {store.offline_signals.length}
                    </span>
                  )}
                </span>
              ),
            },
            {
              value: 'marked',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Bookmark className="h-3.5 w-3.5" />
                  <span>Marked</span>
                  {totalMarkedCount > 0 && (
                    <span className="tabular-nums opacity-70">{totalMarkedCount}</span>
                  )}
                </span>
              ),
            },
          ]}
        />
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB 1: ONLINE FM (127+ Curated Stable Stations + Custom Links)
         ══════════════════════════════════════════════════════════════════ */}
      {tab === 'online' && (
        <div key="tab-online" className="t-page-enter space-y-4">
          {/* Search + Category Filter Bar */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={onlineSearch}
                onChange={(e) => setOnlineSearch(e.target.value)}
                placeholder={`Filter ${allOnlineStations.length} stable stations by name, country, language, or genre...`}
                className="pl-10 pr-9"
              />
              {onlineSearch && (
                <button
                  type="button"
                  onClick={() => setOnlineSearch('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  'All',
                  ...(store.custom_online.length > 0 ? (['My Links'] as const) : []),
                  ...RADIO_CATEGORIES,
                ] as Array<RadioCategory | 'All' | 'My Links'>
              ).map((cat) => {
                const active = selectedCategory === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors cursor-pointer',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    {cat}
                    {cat === 'My Links' && (
                      <span className="ml-1 tabular-nums opacity-75">
                        {store.custom_online.length}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Station List */}
          {filteredOnline.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
              <p className="text-sm font-medium text-foreground">No matching stations</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try another keyword, search 45,000+ global stations in Discover, or paste a custom stream link.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDiscoverQuery(onlineSearch)
                    setTab('discover')
                    if (onlineSearch.trim()) runDiscover({ query: onlineSearch.trim() })
                  }}
                >
                  Search in Discover
                </Button>
                <Button type="button" size="sm" onClick={openPasteLinkModal}>
                  Paste Stream Link
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredOnline.map((station) => {
                const isActive = activeRadio?.kind === 'online' && activeRadio.id === station.id
                const isPlayingThis = isActive && activeRadio.isPlaying
                const isBufferingThis = isActive && activeRadio.isBuffering
                const isMarked = markedOnlineSet.has(station.id)

                return (
                  <div
                    key={station.id}
                    onClick={() =>
                      isActive && (isPlayingThis || isBufferingThis)
                        ? onReconnectRadio()
                        : onPlayOnlineStation(station, filteredOnline)
                    }
                    className={cn(
                      'group flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 transition-colors cursor-pointer',
                      isActive
                        ? 'border-primary/40 bg-secondary text-foreground'
                        : 'border-border/60 bg-card/70 hover:border-border hover:bg-secondary/60',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
                        {isPlayingThis && appearance.showPlayPulse && (
                          <span
                            aria-hidden="true"
                            className="animate-btn-pulse pointer-events-none absolute inset-0 rounded-full border border-primary"
                          />
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (isActive && (isPlayingThis || isBufferingThis)) {
                              onReconnectRadio()
                            } else {
                              onPlayOnlineStation(station, filteredOnline)
                            }
                          }}
                          aria-label={
                            isActive
                              ? isPlayingThis
                                ? `Reconnect ${station.name}`
                                : `Connect ${station.name}`
                              : `Connect ${station.name}`
                          }
                          className={cn(
                            'relative z-10 flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-95 cursor-pointer',
                            isPlayingThis || isBufferingThis
                              ? 'bg-primary text-primary-foreground'
                              : isActive
                                ? 'border border-primary/50 bg-background text-primary'
                                : 'border border-border bg-background text-foreground group-hover:border-primary/50',
                          )}
                        >
                          {renderFmRowBadge(isActive, isPlayingThis, isBufferingThis)}
                        </button>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p
                            className={cn(
                              'truncate text-sm leading-tight',
                              isActive
                                ? 'font-semibold text-primary'
                                : 'font-medium text-foreground',
                            )}
                          >
                            {station.name}
                          </p>
                          {station.isCustom && (
                            <span className="shrink-0 rounded-full border border-border bg-background px-1.5 py-0.5 font-mono text-[9.5px] uppercase text-muted-foreground">
                              LINK
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {[
                            station.category,
                            station.country,
                            station.bitrate > 0 ? `${station.bitrate}k` : null,
                            station.codec,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                    </div>

                    <div
                      className="flex shrink-0 items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isActive && (
                        <>
                          <Tooltip
                            label={isPlayingThis ? 'Reconnect stream' : 'Connect stream'}
                            side="top"
                          >
                            <button
                              type="button"
                              onClick={onReconnectRadio}
                              className="t-press inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-[11px] font-medium text-foreground hover:bg-secondary cursor-pointer"
                            >
                              <RefreshCw
                                className={cn('h-3 w-3', isBufferingThis && 'animate-spin')}
                              />
                              <span className="hidden sm:inline">
                                {isPlayingThis ? 'Reconnect' : 'Connect'}
                              </span>
                            </button>
                          </Tooltip>
                          {(isPlayingThis || isBufferingThis) && (
                            <Tooltip label="Disconnect" side="top">
                              <button
                                type="button"
                                onClick={onDisconnectRadio}
                                aria-label={`Disconnect ${station.name}`}
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                              >
                                <Square className="h-3 w-3 fill-current" />
                              </button>
                            </Tooltip>
                          )}
                        </>
                      )}

                      <Tooltip
                        label={isMarked ? 'Unmark online station' : 'Mark online station'}
                        side="top"
                      >
                        <button
                          type="button"
                          onClick={() => onToggleMarkOnline(station.id)}
                          aria-label={isMarked ? 'Unmark station' : 'Mark station'}
                          className={cn(
                            't-press flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer',
                            isMarked
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-background hover:text-foreground',
                          )}
                        >
                          <Bookmark className={cn('h-3.5 w-3.5', isMarked && 'fill-current')} />
                        </button>
                      </Tooltip>

                      {station.isCustom && (
                        <Tooltip label="Remove custom link" side="top">
                          <button
                            type="button"
                            onClick={() => onDeleteCustomOnline(station.id)}
                            aria-label={`Remove ${station.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-destructive cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 2: DISCOVER (Live Search across 45,000+ Free Public Stations)
         ══════════════════════════════════════════════════════════════════ */}
      {tab === 'discover' && (
        <div key="tab-discover" className="t-page-enter space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setDiscoverPresetId(null)
              runDiscover({ query: discoverQuery.trim() || undefined })
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={discoverQuery}
                onChange={(e) => setDiscoverQuery(e.target.value)}
                placeholder="Search 45,000+ free radio stations worldwide (e.g. Mirchi, Kerala, BBC, Lo-Fi)..."
                className="pl-10"
              />
            </div>
            <Button type="submit" disabled={discoverLoading}>
              {discoverLoading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                'Search'
              )}
            </Button>
          </form>

          {/* Quick Region / Language / Genre Discovery Chips */}
          <div className="flex flex-wrap gap-1.5">
            {DISCOVER_PRESETS.map((preset) => {
              const active = discoverPresetId === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setDiscoverPresetId(preset.id)
                    setDiscoverQuery('')
                    runDiscover({
                      query: preset.query,
                      tag: preset.tag,
                      country: preset.country,
                      language: preset.language,
                    })
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors cursor-pointer',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          {discoverError && (
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 text-xs">
                <p className="font-medium text-foreground">Unable to load online directory</p>
                <p className="mt-0.5 text-muted-foreground">{discoverError}</p>
                <p className="mt-1.5 text-muted-foreground/80">
                  Tip: You can still paste a direct link using <strong>Paste Link</strong> or switch to{' '}
                  <strong>Offline FM</strong> while offline.
                </p>
              </div>
            </div>
          )}

          {discoverLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 bg-card/40 py-14">
              <Loader2 barCount={5} height={22} width={3} gap={3} speed={0.9} />
              <p className="text-xs text-muted-foreground">Searching live public radio stations...</p>
            </div>
          ) : discoverResults.length === 0 && !discoverError ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center text-xs text-muted-foreground">
              No stations matched that query. Try a broader genre, language, or country chip above.
            </div>
          ) : (
            <div className="space-y-1.5">
              {discoverResults.map((st) => {
                const asOnline: OnlineStation = {
                  id: st.id,
                  name: st.name,
                  url: st.url,
                  category: 'Custom',
                  country: st.country || 'Global',
                  language: st.language,
                  tags: st.tags,
                  bitrate: st.bitrate,
                  codec: st.codec || 'STREAM',
                  homepage: st.homepage,
                  isCustom: true,
                }
                const isActive =
                  activeRadio?.kind === 'online' &&
                  (activeRadio.id === st.id || activeRadio.url === st.url)
                const isPlayingThis = isActive && activeRadio.isPlaying
                const isBufferingThis = isActive && activeRadio.isBuffering
                const alreadySaved = savedUrlSet.has(st.url.trim().toLowerCase())

                return (
                  <div
                    key={st.id}
                    onClick={() =>
                      isActive && (isPlayingThis || isBufferingThis)
                        ? onReconnectRadio()
                        : onPlayOnlineStation(asOnline, [asOnline])
                    }
                    className={cn(
                      'group flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 transition-colors cursor-pointer',
                      isActive
                        ? 'border-primary/40 bg-secondary text-foreground'
                        : 'border-border/60 bg-card/70 hover:border-border hover:bg-secondary/60',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
                        {isPlayingThis && appearance.showPlayPulse && (
                          <span
                            aria-hidden="true"
                            className="animate-btn-pulse pointer-events-none absolute inset-0 rounded-full border border-primary"
                          />
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (isActive && (isPlayingThis || isBufferingThis)) {
                              onReconnectRadio()
                            } else {
                              onPlayOnlineStation(asOnline, [asOnline])
                            }
                          }}
                          aria-label={
                            isPlayingThis ? `Reconnect ${st.name}` : `Connect ${st.name}`
                          }
                          className={cn(
                            'relative z-10 flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-95 cursor-pointer',
                            isPlayingThis || isBufferingThis
                              ? 'bg-primary text-primary-foreground'
                              : isActive
                                ? 'border border-primary/50 bg-background text-primary'
                                : 'border border-border bg-background text-foreground',
                          )}
                        >
                          {renderFmRowBadge(isActive, isPlayingThis, isBufferingThis)}
                        </button>
                      </div>

                      <div className="min-w-0">
                        <p
                          className={cn(
                            'truncate text-sm leading-tight',
                            isActive ? 'font-semibold text-primary' : 'font-medium text-foreground',
                          )}
                        >
                          {st.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {[
                            st.country || null,
                            st.language || null,
                            st.bitrate > 0 ? `${st.bitrate}k` : null,
                            st.codec || null,
                            st.tags.slice(0, 2).join(', ') || null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                    </div>

                    <div
                      className="flex shrink-0 items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isActive && (
                        <>
                          <Tooltip
                            label={isPlayingThis ? 'Reconnect stream' : 'Connect stream'}
                            side="top"
                          >
                            <button
                              type="button"
                              onClick={onReconnectRadio}
                              className="t-press inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-[11px] font-medium text-foreground hover:bg-secondary cursor-pointer"
                            >
                              <RefreshCw
                                className={cn('h-3 w-3', isBufferingThis && 'animate-spin')}
                              />
                              <span className="hidden sm:inline">
                                {isPlayingThis ? 'Reconnect' : 'Connect'}
                              </span>
                            </button>
                          </Tooltip>
                          {(isPlayingThis || isBufferingThis) && (
                            <Tooltip label="Disconnect" side="top">
                              <button
                                type="button"
                                onClick={onDisconnectRadio}
                                aria-label={`Disconnect ${st.name}`}
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
                              >
                                <Square className="h-3 w-3 fill-current" />
                              </button>
                            </Tooltip>
                          )}
                        </>
                      )}

                      <button
                        type="button"
                        disabled={alreadySaved}
                        onClick={() => onSaveDiscoveredStation(st)}
                        className={cn(
                          't-press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-medium transition-colors',
                          alreadySaved
                            ? 'border-border bg-secondary text-muted-foreground cursor-default'
                            : 'border-border bg-background text-foreground hover:border-primary hover:bg-primary hover:text-primary-foreground cursor-pointer',
                        )}
                      >
                        {alreadySaved ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Saved</span>
                          </>
                        ) : (
                          <>
                            <Bookmark className="h-3.5 w-3.5" />
                            <span>Save &amp; Mark</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 3: OFFLINE FM (REAL SIGNAL TUNER + BOOKMARKED FREQUENCIES)
         ══════════════════════════════════════════════════════════════════ */}
      {tab === 'offline' && (
        <div key="tab-offline" className="t-page-enter space-y-5">
          {/* Hardware Receiver Status Strip */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className={cn(
                    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
                    fmHardware?.available
                      ? 'border-primary/40 bg-primary text-primary-foreground'
                      : 'border-border bg-secondary text-muted-foreground',
                  )}
                >
                  <Signal className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {fmHardware?.available
                        ? `Offline FM Tuner Ready (${fmHardware.backend === 'rtl_fm' ? 'RTL-SDR' : 'V4L2'})`
                        : 'Offline FM Signal Receiver'}
                    </p>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 font-mono text-[10px] uppercase',
                        fmHardware?.available
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground',
                      )}
                    >
                      {fmHardware?.available ? 'Hardware Connected' : 'No Hardware Detected'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {fmHardware?.message ??
                      'Checking for RTL-SDR USB receiver or Linux V4L2 FM tuner (/dev/radio0)...'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onRefreshHardware}
                  className="t-press inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-secondary cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Scan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHwGuideOpen((v) => !v)}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                >
                  <span>Setup</span>
                  <AccordionChevron open={hwGuideOpen} />
                </button>
              </div>
            </div>

            <AccordionPanel open={hwGuideOpen}>
              <div className="mt-3.5 space-y-2 border-t border-border/70 pt-3.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  How real zero-internet Offline FM works on desktop:
                </p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>
                    <strong>RTL-SDR USB Dongle (Recommended)</strong>: Plug in any RTL2832U / RTL2838 USB tuner and install{' '}
                    <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                      rtl-sdr
                    </code>{' '}
                    (<code className="font-mono text-[11px]">rtl_fm</code>). Zuno streams live WBFM audio directly into the Rust Equalizer &amp; Visualizer with zero internet.
                  </li>
                  <li>
                    <strong>Linux V4L2 FM Tuner</strong>: USB/PCI FM cards exposing{' '}
                    <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                      /dev/radio0
                    </code>{' '}
                    with{' '}
                    <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                      v4l-utils
                    </code>{' '}
                    are tuned automatically.
                  </li>
                  <li>
                    <strong>No tuner plugged in right now?</strong> You can still dial and mark all your local FM frequencies below — they are stored offline in{' '}
                    <code className="font-mono text-[11px]">~/zuno/.zuno/radio.json</code> and ready whenever you connect hardware.
                  </li>
                </ul>
              </div>
            </AccordionPanel>
          </div>

          {/* Tactile Analog FM Frequency Tuner Deck */}
          <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
            {/* Band Selector & Live Badge */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                {(Object.keys(FM_BANDS) as FmBandId[]).map((bid) => {
                  const spec = FM_BANDS[bid]
                  const active = store.band === bid
                  return (
                    <button
                      key={bid}
                      type="button"
                      onClick={() => onChangeBand(bid)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 font-mono text-[10.5px] font-medium transition-colors cursor-pointer',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {spec.shortLabel}
                    </button>
                  )
                })}
              </div>

              <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                <Radio className="h-3.5 w-3.5" />
                {isOfflinePlayingThisFreq ? 'ON AIR · SIGNAL' : 'ANALOG FM DIAL'}
              </span>
            </div>

            {/* Big Frequency Readout */}
            <div className="mt-5 flex flex-col items-center text-center">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-5xl font-bold tracking-tight tabular-nums text-foreground sm:text-6xl">
                  {currentFreq.toFixed(1)}
                </span>
                <span className="font-mono text-sm font-medium uppercase tracking-widest text-muted-foreground">
                  MHz
                </span>
              </div>
              <TextSwap
                as="p"
                text={
                  matchedOfflineSignal
                    ? [
                        matchedOfflineSignal.name,
                        matchedOfflineSignal.region || matchedOfflineSignal.genre || null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : 'Unmarked frequency — tap Mark to bookmark this signal'
                }
                className="mt-1.5 text-xs font-medium text-muted-foreground"
              />
            </div>

            {/* Interactive Frequency Ruler Scale */}
            <div className="mt-6 select-none">
              <div
                ref={dialRef}
                role="slider"
                tabIndex={0}
                aria-label="FM frequency tuner dial"
                aria-valuemin={bandSpec.minMhz}
                aria-valuemax={bandSpec.maxMhz}
                aria-valuenow={currentFreq}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                    e.preventDefault()
                    handleStepFreq(bandSpec.stepMhz)
                  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                    e.preventDefault()
                    handleStepFreq(-bandSpec.stepMhz)
                  }
                }}
                onPointerDown={(e) => {
                  draggingDialRef.current = true
                  e.currentTarget.setPointerCapture(e.pointerId)
                  updateFreqFromClientX(e.clientX)
                }}
                onPointerMove={(e) => {
                  if (!draggingDialRef.current) return
                  updateFreqFromClientX(e.clientX)
                }}
                onPointerUp={() => {
                  draggingDialRef.current = false
                }}
                onPointerCancel={() => {
                  draggingDialRef.current = false
                }}
                className="relative h-20 w-full cursor-ew-resize overflow-hidden rounded-2xl border border-border bg-background/80 px-2"
              >
                {/* Marked Offline Signal Pins along the scale */}
                {bandSignals.map((sig) => (
                  <button
                    key={sig.id}
                    type="button"
                    title={`${sig.freq_mhz.toFixed(1)} MHz · ${sig.name}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onChangeDialFreq(clampFreqToBand(sig.freq_mhz, store.band))}
                    style={{ left: `${freqToPct(sig.freq_mhz)}%` }}
                    className={cn(
                      'absolute top-2 z-20 -translate-x-1/2 rounded-full transition-transform hover:scale-125 cursor-pointer',
                      sig.marked
                        ? 'h-2.5 w-2.5 bg-primary shadow-sm'
                        : 'h-2 w-2 bg-muted-foreground/60',
                    )}
                  />
                ))}

                {/* Scale Ticks */}
                <div className="pointer-events-none relative h-full w-full">
                  {dialTicks.map((tk) => (
                    <div
                      key={tk.freq}
                      style={{ left: `${tk.pct}%` }}
                      className="absolute bottom-2 flex -translate-x-1/2 flex-col items-center"
                    >
                      <span
                        className={cn(
                          'w-[1px] rounded-full',
                          tk.major ? 'h-6 bg-muted-foreground/65' : 'h-3 bg-border',
                        )}
                      />
                      {tk.major && (
                        <span className="mt-1 font-mono text-[9.5px] tabular-nums text-muted-foreground/80">
                          {tk.freq.toFixed(0)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Glowing Vertical Tuning Needle */}
                <div
                  style={{ left: `${freqToPct(currentFreq)}%` }}
                  className="pointer-events-none absolute inset-y-0 z-10 -translate-x-1/2"
                >
                  <div className="h-full w-[2px] bg-primary shadow-[0_0_12px_var(--primary)]" />
                  <div className="absolute -top-0.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-primary" />
                </div>
              </div>
            </div>

            {/* Precision Tuning + Tune Signal + Mark Controls */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleStepFreq(-1.0)}
                  className="t-press h-9 rounded-full border border-border bg-background px-3 font-mono text-xs text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                >
                  -1.0
                </button>
                <button
                  type="button"
                  onClick={() => handleStepFreq(-bandSpec.stepMhz)}
                  className="t-press h-9 rounded-full border border-border bg-background px-3 font-mono text-xs text-foreground hover:bg-secondary cursor-pointer"
                >
                  -{bandSpec.stepMhz.toFixed(1)}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onTuneOfflineSignal(
                      currentFreq,
                      matchedOfflineSignal?.name,
                      matchedOfflineSignal?.id,
                    )
                  }
                  className="t-press mx-1 inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 cursor-pointer"
                >
                  {isOfflinePlayingThisFreq ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Reconnect {currentFreq.toFixed(1)}</span>
                    </>
                  ) : (
                    <>
                      <Radio className="h-3.5 w-3.5" />
                      <span>Connect {currentFreq.toFixed(1)}</span>
                    </>
                  )}
                </button>

                {isOfflinePlayingThisFreq && (
                  <Tooltip label="Disconnect offline FM" side="top">
                    <button
                      type="button"
                      onClick={onDisconnectRadio}
                      aria-label="Disconnect offline FM"
                      className="t-press flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground hover:bg-secondary cursor-pointer"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                    </button>
                  </Tooltip>
                )}

                <button
                  type="button"
                  onClick={() => handleStepFreq(bandSpec.stepMhz)}
                  className="t-press h-9 rounded-full border border-border bg-background px-3 font-mono text-xs text-foreground hover:bg-secondary cursor-pointer"
                >
                  +{bandSpec.stepMhz.toFixed(1)}
                </button>
                <button
                  type="button"
                  onClick={() => handleStepFreq(1.0)}
                  className="t-press h-9 rounded-full border border-border bg-background px-3 font-mono text-xs text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                >
                  +1.0
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  matchedOfflineSignal
                    ? openSignalModal(matchedOfflineSignal)
                    : openSignalModal(undefined, currentFreq)
                }
                className={cn(
                  't-press inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors cursor-pointer',
                  matchedOfflineSignal?.marked
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-secondary',
                )}
              >
                <Bookmark
                  className={cn('h-3.5 w-3.5', matchedOfflineSignal?.marked && 'fill-current')}
                />
                <span>
                  {matchedOfflineSignal
                    ? `Edit ${currentFreq.toFixed(1)} MHz`
                    : `Mark ${currentFreq.toFixed(1)} MHz`}
                </span>
              </button>
            </div>
          </div>

          {/* Saved Offline FM Signal Stations List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  OFFLINE SIGNAL BOOKMARKS
                </p>
                <p className="text-xs text-muted-foreground">
                  {sortedOfflineSignals.length}{' '}
                  {sortedOfflineSignals.length === 1 ? 'frequency' : 'frequencies'} saved ·{' '}
                  {markedOfflineSignals.length} marked
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => openSignalModal(undefined, currentFreq)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Frequency
              </Button>
            </div>

            {sortedOfflineSignals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
                <p className="text-sm font-medium text-foreground">No offline FM frequencies saved yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Dial any frequency above (e.g. 93.5, 98.3, 101.9 MHz) and click{' '}
                  <strong>Mark Frequency</strong> to save your local FM stations offline.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {sortedOfflineSignals.map((sig) => {
                  const isActive =
                    activeRadio?.kind === 'offline' &&
                    activeRadio.freqMhz !== undefined &&
                    Math.abs(activeRadio.freqMhz - sig.freq_mhz) < 0.051
                  const isPlayingThis = isActive && activeRadio.isPlaying
                  const isDialOnThis = Math.abs(currentFreq - sig.freq_mhz) < 0.051

                  return (
                    <div
                      key={sig.id}
                      onClick={() => {
                        onChangeDialFreq(clampFreqToBand(sig.freq_mhz, store.band))
                        if (fmHardware?.available) {
                          if (isPlayingThis) onStopRadio()
                          else onTuneOfflineSignal(sig.freq_mhz, sig.name, sig.id)
                        }
                      }}
                      className={cn(
                        'group flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 transition-colors cursor-pointer',
                        isActive || isDialOnThis
                          ? 'border-primary/40 bg-secondary text-foreground'
                          : 'border-border/60 bg-card/70 hover:border-border hover:bg-secondary/60',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={cn(
                            'flex h-10 min-w-[68px] shrink-0 flex-col items-center justify-center rounded-xl border px-2 font-mono',
                            isPlayingThis
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-background text-foreground',
                          )}
                        >
                          <span className="text-xs font-bold leading-none tabular-nums">
                            {sig.freq_mhz.toFixed(1)}
                          </span>
                          <span className="mt-0.5 text-[8.5px] uppercase opacity-75">MHz</span>
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p
                              className={cn(
                                'truncate text-sm leading-tight',
                                isActive
                                  ? 'font-semibold text-primary'
                                  : 'font-medium text-foreground',
                              )}
                            >
                              {sig.name}
                            </p>
                            <span className="shrink-0 rounded-full border border-border bg-background px-1.5 py-0.5 font-mono text-[9.5px] uppercase text-muted-foreground">
                              SIGNAL
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {[sig.region, sig.genre, sig.notes].filter(Boolean).join(' · ') ||
                              'Offline FM signal station'}
                          </p>
                        </div>
                      </div>

                      <div
                        className="flex shrink-0 items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Tooltip
                          label={sig.marked ? 'Unmark signal station' : 'Mark signal station'}
                          side="top"
                        >
                          <button
                            type="button"
                            onClick={() => onToggleMarkOffline(sig.id)}
                            aria-label={sig.marked ? 'Unmark signal' : 'Mark signal'}
                            className={cn(
                              't-press flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer',
                              sig.marked
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-background hover:text-foreground',
                            )}
                          >
                            <Bookmark className={cn('h-3.5 w-3.5', sig.marked && 'fill-current')} />
                          </button>
                        </Tooltip>

                        <Tooltip label="Edit signal station" side="top">
                          <button
                            type="button"
                            onClick={() => openSignalModal(sig)}
                            aria-label={`Edit ${sig.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </Tooltip>

                        <Tooltip label="Delete signal station" side="top">
                          <button
                            type="button"
                            onClick={() => onDeleteOfflineSignal(sig.id)}
                            aria-label={`Delete ${sig.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-destructive cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 4: MARKED (Unified Offline Signal + Online Link Bookmarks)
         ══════════════════════════════════════════════════════════════════ */}
      {tab === 'marked' && (
        <div key="tab-marked" className="t-page-enter space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'all', label: `All Marked (${totalMarkedCount})` },
                  { id: 'offline', label: `Offline Signals (${markedOfflineSignals.length})` },
                  { id: 'online', label: `Online Links (${markedOnlineStations.length})` },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMarkedFilter(item.id)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors cursor-pointer',
                    markedFilter === item.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {totalMarkedCount === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
              <Bookmark className="mx-auto h-6 w-6 text-muted-foreground/60" />
              <p className="mt-2.5 text-sm font-medium text-foreground">No marked FM stations yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Bookmark your favorite <strong>Online FM links</strong> or{' '}
                <strong>Offline FM signal frequencies</strong> to access them together right here.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setTab('online')}>
                  Browse Online FM
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setTab('offline')}>
                  Open Offline Dial
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Marked Offline Signal Stations */}
              {(markedFilter === 'all' || markedFilter === 'offline') &&
                markedOfflineSignals.length > 0 && (
                  <div className="space-y-2">
                    <p className="px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      OFFLINE FM SIGNALS · {markedOfflineSignals.length}
                    </p>
                    <div className="space-y-1.5">
                      {markedOfflineSignals.map((sig) => {
                        const isActive =
                          activeRadio?.kind === 'offline' &&
                          activeRadio.freqMhz !== undefined &&
                          Math.abs(activeRadio.freqMhz - sig.freq_mhz) < 0.051
                        return (
                          <div
                            key={sig.id}
                            onClick={() => {
                              onChangeDialFreq(clampFreqToBand(sig.freq_mhz, store.band))
                              if (fmHardware?.available) {
                                onTuneOfflineSignal(sig.freq_mhz, sig.name, sig.id)
                              } else {
                                setTab('offline')
                              }
                            }}
                            className={cn(
                              'flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 transition-colors cursor-pointer',
                              isActive
                                ? 'border-primary/40 bg-secondary'
                                : 'border-border/60 bg-card/70 hover:bg-secondary/60',
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-9 min-w-[66px] shrink-0 items-center justify-center rounded-xl border border-border bg-background px-2 font-mono text-xs font-bold tabular-nums text-foreground">
                                {sig.freq_mhz.toFixed(1)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-sm font-medium text-foreground">
                                    {sig.name}
                                  </p>
                                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 font-mono text-[9.5px] uppercase text-foreground">
                                    SIGNAL · MHz
                                  </span>
                                </div>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                  {[sig.region, sig.genre, sig.notes].filter(Boolean).join(' · ') ||
                                    'Offline FM frequency'}
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                onToggleMarkOffline(sig.id)
                              }}
                              aria-label={`Unmark ${sig.name}`}
                              className="t-press flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground cursor-pointer"
                            >
                              <Bookmark className="h-3.5 w-3.5 fill-current" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

              {/* Marked Online Link Stations */}
              {(markedFilter === 'all' || markedFilter === 'online') &&
                markedOnlineStations.length > 0 && (
                  <div className="space-y-2">
                    <p className="px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      ONLINE FM LINKS · {markedOnlineStations.length}
                    </p>
                    <div className="space-y-1.5">
                      {markedOnlineStations.map((station) => {
                        const isActive =
                          activeRadio?.kind === 'online' && activeRadio.id === station.id
                        const isPlayingThis = isActive && activeRadio.isPlaying
                        const isBufferingThis = isActive && activeRadio.isBuffering

                        return (
                          <div
                            key={station.id}
                            onClick={() =>
                              isActive && (isPlayingThis || isBufferingThis)
                                ? onReconnectRadio()
                                : onPlayOnlineStation(station, markedOnlineStations)
                            }
                            className={cn(
                              'flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 transition-colors cursor-pointer',
                              isActive
                                ? 'border-primary/40 bg-secondary'
                                : 'border-border/60 bg-card/70 hover:bg-secondary/60',
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
                                {isPlayingThis && appearance.showPlayPulse && (
                                  <span
                                    aria-hidden="true"
                                    className="animate-btn-pulse pointer-events-none absolute inset-0 rounded-full border border-primary"
                                  />
                                )}
                                <span
                                  className={cn(
                                    'relative z-10 flex h-9 w-9 items-center justify-center rounded-full',
                                    isPlayingThis || isBufferingThis
                                      ? 'bg-primary text-primary-foreground'
                                      : isActive
                                        ? 'border border-primary/50 bg-background text-primary'
                                        : 'border border-border bg-background text-foreground',
                                  )}
                                >
                                  {renderFmRowBadge(isActive, isPlayingThis, isBufferingThis)}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p
                                    className={cn(
                                      'truncate text-sm',
                                      isActive
                                        ? 'font-semibold text-primary'
                                        : 'font-medium text-foreground',
                                    )}
                                  >
                                    {station.name}
                                  </p>
                                  <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[9.5px] uppercase text-muted-foreground">
                                    ONLINE LINK
                                  </span>
                                </div>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                  {[
                                    station.category,
                                    station.country,
                                    station.bitrate > 0 ? `${station.bitrate}k` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              </div>
                            </div>

                            <div
                              className="flex shrink-0 items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {isActive && (
                                <>
                                  <Tooltip
                                    label={isPlayingThis ? 'Reconnect' : 'Connect'}
                                    side="top"
                                  >
                                    <button
                                      type="button"
                                      onClick={onReconnectRadio}
                                      className="t-press inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background px-2.5 text-[11px] font-medium text-foreground hover:bg-secondary cursor-pointer"
                                    >
                                      <RefreshCw
                                        className={cn(
                                          'h-3 w-3',
                                          isBufferingThis && 'animate-spin',
                                        )}
                                      />
                                      <span className="hidden sm:inline">
                                        {isPlayingThis ? 'Reconnect' : 'Connect'}
                                      </span>
                                    </button>
                                  </Tooltip>
                                  {(isPlayingThis || isBufferingThis) && (
                                    <Tooltip label="Disconnect" side="top">
                                      <button
                                        type="button"
                                        onClick={onDisconnectRadio}
                                        aria-label={`Disconnect ${station.name}`}
                                        className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                                      >
                                        <Square className="h-3 w-3 fill-current" />
                                      </button>
                                    </Tooltip>
                                  )}
                                </>
                              )}

                              <button
                                type="button"
                                onClick={() => onToggleMarkOnline(station.id)}
                                aria-label={`Unmark ${station.name}`}
                                className="t-press flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground cursor-pointer"
                              >
                                <Bookmark className="h-3.5 w-3.5 fill-current" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          DIALOG 1: PASTE & ADD ONLINE STREAM LINK
         ══════════════════════════════════════════════════════════════════ */}
      <Dialog
        open={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        title="Add Online FM Stream Link"
        subtitle="Paste any direct MP3, AAC, OGG, HLS (.m3u8), or playlist (.m3u / .pls) radio URL."
      >
        <form onSubmit={handleSaveCustomLink} className="space-y-3.5">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Stream URL
            </label>
            <div className="flex gap-2">
              <Input
                autoFocus
                value={linkUrl}
                onChange={(e) => {
                  setLinkUrl(e.target.value)
                  if (linkError) setLinkError(null)
                }}
                placeholder="https://stream.example.com/live.mp3"
                className="flex-1 font-mono text-xs"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={linkProbing || !linkUrl.trim()}
                onClick={handleProbeLink}
              >
                {linkProbing ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Wand2 className="mr-1 h-3.5 w-3.5" />
                    Detect
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Station Name
            </label>
            <Input
              value={linkName}
              onChange={(e) => setLinkName(e.target.value)}
              placeholder="e.g. Kochi Chill FM (optional — auto-detected)"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Country / City
              </label>
              <Input
                value={linkCountry}
                onChange={(e) => setLinkCountry(e.target.value)}
                placeholder="India"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Genre / Tag
              </label>
              <Input
                value={linkGenre}
                onChange={(e) => setLinkGenre(e.target.value)}
                placeholder="Chill, Lo-Fi, Hits"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/50 px-3 py-2.5">
            <div>
              <p className="text-xs font-medium text-foreground">Mark this online station</p>
              <p className="text-[11px] text-muted-foreground">
                Pin into your Marked tab for 1-click playback
              </p>
            </div>
            <MotionSwitch
              checked={linkMarkOnAdd}
              onChange={setLinkMarkOnAdd}
              ariaLabel="Mark online station"
            />
          </div>

          {linkError && <p className="text-xs text-destructive">{linkError}</p>}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={linkProbing || !linkUrl.trim()}
              onClick={handleTestPlayLink}
            >
              Test Play
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLinkModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={linkProbing || !linkUrl.trim()}>
                Save &amp; Play
              </Button>
            </div>
          </div>
        </form>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════
          DIALOG 2: MARK / EDIT OFFLINE FM SIGNAL FREQUENCY
         ══════════════════════════════════════════════════════════════════ */}
      <Dialog
        open={signalModalOpen}
        onClose={() => setSignalModalOpen(false)}
        title={editingSignalId ? 'Edit Offline FM Signal' : 'Mark Offline FM Signal'}
        subtitle="Save a local over-the-air FM frequency (MHz) offline in your Zuno radio book."
      >
        <form onSubmit={handleSaveOfflineSignal} className="space-y-3.5">
          <div className="grid grid-cols-[120px_1fr] gap-2.5">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Freq (MHz)
              </label>
              <Input
                value={sigFreq}
                onChange={(e) => {
                  setSigFreq(e.target.value)
                  if (sigError) setSigError(null)
                }}
                placeholder="98.3"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Station Name
              </label>
              <Input
                autoFocus
                value={sigName}
                onChange={(e) => setSigName(e.target.value)}
                placeholder="e.g. Radio Mirchi / Club FM / AIR"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                City / Region
              </label>
              <Input
                value={sigRegion}
                onChange={(e) => setSigRegion(e.target.value)}
                placeholder="e.g. Kochi"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Genre
              </label>
              <Input
                value={sigGenre}
                onChange={(e) => setSigGenre(e.target.value)}
                placeholder="e.g. Hits, Classic, News"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Signal Notes (optional)
            </label>
            <Input
              value={sigNotes}
              onChange={(e) => setSigNotes(e.target.value)}
              placeholder="e.g. Clear stereo indoors"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/50 px-3 py-2.5">
            <div>
              <p className="text-xs font-medium text-foreground">Mark as favorite signal</p>
              <p className="text-[11px] text-muted-foreground">
                Highlights pin on the analog dial and appears in Marked
              </p>
            </div>
            <MotionSwitch
              checked={sigMarked}
              onChange={setSigMarked}
              ariaLabel="Mark offline signal station"
            />
          </div>

          {sigError && <p className="text-xs text-destructive">{sigError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSignalModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm">
              {editingSignalId ? 'Save Changes' : 'Mark Signal'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
