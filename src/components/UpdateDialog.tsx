import { useEffect, useRef, useState } from 'react'
import {
  Archive,
  ArrowUpCircle,
  Check,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
  RotateCw,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { MotionSwitch } from '@/components/ui/motion'
import { formatError, shortenHomePath } from '@/lib/format'
import { cn, formatBytes } from '@/lib/utils'
import {
  hasAndroidApkInstaller,
  isMobilePlatform,
  isTauriRuntime,
  openExternalUrl,
  zunoApi,
  type BackupReport,
  type UpdateInfo,
  type UpdateInstallResult,
  type UpdateProgress,
} from '@/lib/zunoApi'

interface UpdateDialogProps {
  open: boolean
  appVersion: string
  homeDir?: string | null
  updateInfo: UpdateInfo | null
  checking: boolean
  checkError: string | null
  autoCheck: boolean
  onToggleAutoCheck: (next: boolean) => void
  onCheckNow: () => Promise<void>
  onSkipVersion: (version: string) => void
  onCollectUiSettings: () => string
  onBackupDone?: (report: BackupReport) => void
  onClose: () => void
}

function formatReleaseSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return ''
  return formatBytes(bytes)
}

function formatReleaseDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const CLI_INSTALL_CMD =
  'curl -fsSL https://raw.githubusercontent.com/aswin402/zuno/main/install.sh | bash'

const DESKTOP_STAGES: { id: UpdateProgress['stage']; label: string }[] = [
  { id: 'backup', label: 'Back up playlists & settings' },
  { id: 'downloading', label: 'Download release archive' },
  { id: 'verifying', label: 'Verify SHA-256 checksum' },
  { id: 'installing', label: 'Install updated binary' },
]

const ANDROID_STAGES: { id: UpdateProgress['stage']; label: string }[] = [
  { id: 'backup', label: 'Back up playlists & settings' },
  { id: 'downloading', label: 'Download Android APK' },
  { id: 'verifying', label: 'Verify SHA-256 checksum' },
  { id: 'installing', label: 'Open Android installer' },
]

const STAGE_INDEX_MAP: Record<UpdateProgress['stage'], number> = {
  idle: -1,
  error: -1,
  backup: 0,
  downloading: 1,
  verifying: 2,
  extracting: 3,
  installing: 3,
  done: 4,
}

function stageIndex(stage: UpdateProgress['stage']): number {
  return STAGE_INDEX_MAP[stage] ?? -1
}

/**
 * In-app Release Update & Zero-Copy Data Backup Dialog.
 * Notifies users when a new GitHub Release is published, backs up playlists & settings
 * without touching audio files in `songs/`, verifies SHA-256, swaps binaries atomically,
 * and restarts into the new version in one click.
 */
export function UpdateDialog({
  open,
  appVersion,
  homeDir,
  updateInfo,
  checking,
  checkError,
  autoCheck,
  onToggleAutoCheck,
  onCheckNow,
  onSkipVersion,
  onCollectUiSettings,
  onBackupDone,
  onClose,
}: UpdateDialogProps) {
  const native = isTauriRuntime()
  const [createBackup, setCreateBackup] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<UpdateProgress>({
    stage: 'idle',
    message: '',
    percent: 0,
  })
  const [installResult, setInstallResult] = useState<UpdateInstallResult | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)
  const [restarting, setRestarting] = useState(false)
  const [relaunchError, setRelaunchError] = useState<string | null>(null)
  const [manualBackupBusy, setManualBackupBusy] = useState(false)
  const [manualBackup, setManualBackup] = useState<BackupReport | null>(null)
  const [copiedCli, setCopiedCli] = useState(false)
  const copyTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    }
  }, [])

  const isAndroid = Boolean(updateInfo?.target?.startsWith('android')) || isMobilePlatform()
  const canAndroidInstall = isAndroid && hasAndroidApkInstaller()
  const stages = isAndroid ? ANDROID_STAGES : DESKTOP_STAGES

  // Poll live backend update progress while installing on desktop (Android pushes progress directly)
  useEffect(() => {
    if (!installing || isAndroid) return
    let active = true
    let inFlight = false
    const tick = () => {
      if (!active || inFlight) return
      inFlight = true
      zunoApi
        .getUpdateProgress()
        .then((p) => {
          if (active && p) setProgress(p)
        })
        .catch(() => {})
        .finally(() => {
          inFlight = false
        })
    }
    tick()
    const id = window.setInterval(tick, 160)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [installing, isAndroid])

  const hasUpdate = Boolean(updateInfo?.update_available)
  const currentVer = updateInfo?.current_version || appVersion
  const latestVer = updateInfo?.latest_version || currentVer

  async function handleInstall() {
    if (!updateInfo?.download_url || installing) return
    setInstallError(null)
    setInstallResult(null)

    // Android fallback when native FileProvider bridge isn't present: open direct APK URL in browser
    if (isAndroid && !canAndroidInstall) {
      if (createBackup) {
        try {
          await zunoApi.backupData(onCollectUiSettings())
        } catch {
          /* continue to browser download */
        }
      }
      openExternalUrl(updateInfo.download_url)
      return
    }

    setInstalling(true)
    setProgress({
      stage: createBackup ? 'backup' : 'downloading',
      message: createBackup
        ? 'Backing up playlists, folders, EQ & settings…'
        : `Downloading Zuno v${latestVer}…`,
      percent: createBackup ? 10 : 20,
    })
    try {
      const result = isAndroid
        ? await zunoApi.installAndroidApk({
            downloadUrl: updateInfo.download_url,
            sha256: updateInfo.sha256,
            sizeBytes: updateInfo.size_bytes,
            targetVersion: latestVer,
            createBackup,
            uiSettingsJson: createBackup ? onCollectUiSettings() : undefined,
            onProgress: (p) => setProgress(p),
          })
        : await zunoApi.installUpdate({
            downloadUrl: updateInfo.download_url,
            sha256: updateInfo.sha256,
            sizeBytes: updateInfo.size_bytes,
            targetVersion: latestVer,
            createBackup,
            uiSettingsJson: createBackup ? onCollectUiSettings() : undefined,
          })
      setProgress({
        stage: 'done',
        message: isAndroid
          ? `Zuno v${result.installed_version} APK downloaded — confirm install in Android`
          : `Zuno v${result.installed_version} installed — ready to restart`,
        percent: 100,
      })
      setInstallResult(result)
    } catch (err) {
      setInstallError(formatError(err))
    } finally {
      setInstalling(false)
    }
  }

  function handleReopenAndroidInstaller() {
    setRelaunchError(null)
    const ok = zunoApi.reopenAndroidApkInstaller()
    if (!ok) {
      if (updateInfo?.download_url) {
        openExternalUrl(updateInfo.download_url)
      } else {
        setRelaunchError('Could not re-open Android installer. Download the APK in your browser.')
      }
    }
  }

  async function handleManualBackup() {
    if (manualBackupBusy) return
    setManualBackupBusy(true)
    setInstallError(null)
    try {
      const report = await zunoApi.backupData(onCollectUiSettings())
      if (report) {
        setManualBackup(report)
        onBackupDone?.(report)
      }
    } catch (err) {
      setInstallError(formatError(err))
    } finally {
      setManualBackupBusy(false)
    }
  }

  async function handleRelaunch() {
    if (restarting) return
    setRelaunchError(null)
    setRestarting(true)
    try {
      await zunoApi.relaunchApp()
    } catch (err) {
      setRestarting(false)
      setRelaunchError(formatError(err))
    }
  }

  function handleCopyCli() {
    navigator.clipboard?.writeText(CLI_INSTALL_CMD).catch(() => {})
    setCopiedCli(true)
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = window.setTimeout(() => {
      copyTimerRef.current = null
      setCopiedCli(false)
    }, 1800)
  }

  const title = installResult
    ? isAndroid
      ? `Zuno v${installResult.installed_version} APK Ready`
      : `Zuno v${installResult.installed_version} Ready`
    : hasUpdate
      ? `Update Available · v${latestVer}`
      : 'Zuno Updates & Backup'

  const subtitle = installResult
    ? isAndroid
      ? "Android's package installer was opened. Confirm Install to upgrade Zuno."
      : 'Your data was preserved safely. Restart Zuno to launch the new version.'
    : hasUpdate
      ? isAndroid
        ? `You are on v${currentVer}. Download and install v${latestVer} APK directly.`
        : `You are on v${currentVer}. Install v${latestVer} directly with automatic data backup.`
      : isAndroid
        ? `Installed version v${currentVer} · Offline-first Android app`
        : `Installed version v${currentVer} · Offline-first single binary`

  const activeStageIdx = stageIndex(progress.stage)

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!installing) onClose()
      }}
      title={title}
      subtitle={subtitle}
      className="max-w-lg"
    >
      <div className="space-y-4">
        {/* ── State 1: Successfully Installed & Ready to Restart ── */}
        {installResult ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/50 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-4 w-4" />
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {isAndroid
                      ? `Downloaded Zuno v${installResult.installed_version} APK`
                      : `Installed Zuno v${installResult.installed_version}`}
                  </p>
                  {!isAndroid && (
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {shortenHomePath(installResult.installed_path, homeDir)}
                    </p>
                  )}
                  {isAndroid && (
                    <p className="text-xs text-muted-foreground">
                      If Android asks for &ldquo;Install unknown apps&rdquo;, allow Zuno and tap{' '}
                      <span className="font-medium text-foreground">Install APK</span> again.
                    </p>
                  )}
                  {installResult.backup_path && (
                    <p className="pt-1 text-xs text-muted-foreground">
                      Backup saved ({installResult.backup_files} files):{' '}
                      <span className="font-mono text-[11px] text-foreground">
                        {shortenHomePath(installResult.backup_path, homeDir)}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {relaunchError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {relaunchError}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              {isAndroid ? (
                <>
                  {updateInfo?.download_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openExternalUrl(updateInfo.download_url!)}
                      className="gap-1.5"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Browser
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                    Close
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleReopenAndroidInstaller}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Install APK
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={restarting}
                    onClick={onClose}
                  >
                    Restart later
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="gap-1.5"
                    disabled={restarting}
                    onClick={handleRelaunch}
                  >
                    <RotateCw className={cn('h-3.5 w-3.5', restarting && 'animate-spin')} />
                    {restarting ? 'Restarting…' : 'Restart Zuno Now'}
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : installing ? (
          /* ── State 2: Live Installation Progress ── */
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl border border-border bg-background/60 p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">
                  {progress.message || 'Preparing update…'}
                </span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {progress.percent}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                  style={{ width: `${Math.max(4, progress.percent)}%` }}
                />
              </div>

              <div className="mt-3 space-y-1.5 pt-1">
                {stages.filter((s) => createBackup || s.id !== 'backup').map((step) => {
                  const idx = stageIndex(step.id)
                  const done = activeStageIdx > idx
                  const active = activeStageIdx === idx
                  return (
                    <div
                      key={step.id}
                      className={cn(
                        'flex items-center gap-2 text-xs transition-colors',
                        done
                          ? 'text-foreground'
                          : active
                            ? 'font-medium text-foreground'
                            : 'text-muted-foreground/60',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]',
                          done
                            ? 'border-primary bg-primary text-primary-foreground'
                            : active
                              ? 'border-primary text-primary'
                              : 'border-border',
                        )}
                      >
                        {done ? <Check className="h-2.5 w-2.5" /> : active ? '•' : ''}
                      </span>
                      <span>{step.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {isAndroid ? (
                'Your music files on this device are never touched.'
              ) : (
                <>
                  Your music files in <span className="font-mono">~/zuno/songs</span> are never
                  touched.
                </>
              )}
            </p>
          </div>
        ) : (
          /* ── State 3: Release Available OR Up-to-Date Status ── */
          <>
            {hasUpdate && updateInfo ? (
              <>
                {/* Version Transition Banner */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-secondary/45 px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <ArrowUpCircle className="h-4 w-4 text-primary" />
                    <span className="font-mono text-xs font-medium text-muted-foreground">
                      v{currentVer}
                    </span>
                    <span className="text-xs text-muted-foreground">→</span>
                    <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[11px] font-semibold text-primary-foreground">
                      v{latestVer}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[10.5px] text-muted-foreground">
                    {formatReleaseDate(updateInfo.published_at) && (
                      <span>{formatReleaseDate(updateInfo.published_at)}</span>
                    )}
                    {formatReleaseSize(updateInfo.size_bytes) && (
                      <span>· {formatReleaseSize(updateInfo.size_bytes)}</span>
                    )}
                  </div>
                </div>

                {/* Release Notes */}
                {updateInfo.notes.trim() && (
                  <div className="max-h-44 overflow-y-auto rounded-xl border border-border bg-background/60 p-3.5 text-xs leading-relaxed text-muted-foreground">
                    <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/80">
                      What&apos;s New
                    </p>
                    <div className="space-y-1 whitespace-pre-wrap break-words font-sans text-xs text-muted-foreground">
                      {updateInfo.notes.trim()}
                    </div>
                  </div>
                )}

                {/* Automatic Zero-Copy Backup Toggle */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={createBackup}
                  onClick={() => setCreateBackup((v) => !v)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-background/50 px-3.5 py-3 text-left transition-colors hover:bg-secondary/40 cursor-pointer"
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        Back up playlists, EQ &amp; settings first
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Saves a snapshot in <span className="font-mono">.zuno/backups/</span> before
                        installing (keeps last 5, never copies audio files).
                      </p>
                    </div>
                  </div>
                  <MotionSwitch checked={createBackup} interactive={false} size="sm" />
                </button>
              </>
            ) : (
              /* Up-to-date or Checking Card */
              <div className="rounded-xl border border-border bg-secondary/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground">
                      {checking ? (
                        <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        {checking
                          ? 'Checking GitHub Releases…'
                          : checkError
                            ? 'Could not reach GitHub Releases'
                            : `Zuno v${currentVer} is up to date`}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {checking
                          ? 'Checking for a newer release in the background'
                          : checkError
                            ? 'Zuno stays 100% functional offline — try again when connected.'
                            : 'No newer release is published yet.'}
                      </p>
                    </div>
                  </div>

                  {native && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={checking}
                      onClick={() => onCheckNow()}
                      className="shrink-0 gap-1.5"
                    >
                      <RefreshCw className={cn('h-3 w-3', checking && 'animate-spin')} />
                      Check
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Manual Data Backup + Auto-Check Toggle */}
            {native && !hasUpdate && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/50 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      Backup playlists &amp; settings
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {manualBackup
                        ? `Saved ${manualBackup.files_count} files → ${shortenHomePath(manualBackup.backup_path, homeDir)}`
                        : 'Snapshots playlists, folders, EQ presets & theme settings.'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={manualBackupBusy}
                    onClick={handleManualBackup}
                    className="shrink-0 gap-1.5"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    {manualBackupBusy ? 'Saving…' : 'Back up'}
                  </Button>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={autoCheck}
                  onClick={() => onToggleAutoCheck(!autoCheck)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-background/50 px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/40 cursor-pointer"
                >
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      Check for updates on launch
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Silent when offline — turn off for strict air-gapped use.
                    </p>
                  </div>
                  <MotionSwitch checked={autoCheck} interactive={false} size="sm" />
                </button>
              </div>
            )}

            {/* Error Banner */}
            {installError && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
                {installError}
              </div>
            )}

            {/* Fallback CLI Installer snippet on desktop when binary dir isn't writable */}
            {hasUpdate && updateInfo && !isAndroid && !updateInfo.can_auto_install && (
              <div className="space-y-2 rounded-xl border border-border bg-background/60 p-3">
                <p className="text-[11px] text-muted-foreground">
                  Run this command in your terminal to upgrade directly:
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
                  <code className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-foreground">
                    {CLI_INSTALL_CMD}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyCli}
                    className="t-press inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                  >
                    {copiedCli ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
                    {copiedCli ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            {/* Footer Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                {hasUpdate && updateInfo && (
                  <button
                    type="button"
                    onClick={() => {
                      onSkipVersion(latestVer)
                      onClose()
                    }}
                    className="text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                  >
                    Skip v{latestVer}
                  </button>
                )}
                {updateInfo?.release_url && (
                  <a
                    href={updateInfo.release_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                      if (isAndroid) {
                        e.preventDefault()
                        openExternalUrl(updateInfo.release_url)
                      }
                    }}
                    className="inline-flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span>Release notes</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                  {hasUpdate ? 'Later' : 'Close'}
                </Button>

                {hasUpdate &&
                  updateInfo?.download_url &&
                  (isAndroid || updateInfo.can_auto_install) && (
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={handleInstall}
                      className="gap-1.5"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {isAndroid
                        ? canAndroidInstall
                          ? createBackup
                            ? 'Backup & Update'
                            : 'Install APK'
                          : 'Download APK'
                        : createBackup
                          ? 'Backup & Install'
                          : 'Install Update'}
                    </Button>
                  )}
              </div>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}
