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

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return JSON.stringify(error)
}
