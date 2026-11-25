import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '00:00'
  const secs = Math.floor(totalSeconds)
  const hrs = Math.floor(secs / 3600)
  const mins = Math.floor((secs % 3600) / 60)
  const rem = secs % 60
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
  }
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  let val = bytes
  let unit = 0
  while (val >= 1024 && unit < BYTE_UNITS.length - 1) {
    val /= 1024
    unit += 1
  }
  return `${val.toFixed(1)} ${BYTE_UNITS[unit]}`
}
