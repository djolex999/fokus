import { invoke } from '@tauri-apps/api/core'

/** Timing probe. Rust holds the start of the round trip and logs the delta. */
export async function mark(stage: string): Promise<void> {
  await invoke('mark', { stage })
}

/**
 * Hands keyboard focus back to the application that was frontmost when the
 * shortcut fired. Always awaited, never approximated with a timeout: the
 * measurement is only meaningful if it covers the actual handover.
 */
export async function restoreFocus(): Promise<void> {
  await invoke('restore_focus')
}

/** Used only by the tray quit path, after any in flight session is closed out. */
export async function quitApp(): Promise<void> {
  await invoke('quit_app')
}

/**
 * Frames a failure in the app's language while keeping the driver's own text.
 * The detail is English and stays English: it is diagnostic, and translating or
 * dropping it would cost the only information worth having when something breaks.
 */
export function failure(what: string, error: unknown): string {
  return `${what}: ${describeError(error)}`
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return JSON.stringify(error)
}
