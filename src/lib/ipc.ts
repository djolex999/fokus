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

/** Path of the first playable file in ~/fokus/audio, or null. Null is a normal
 *  outcome: no folder, an empty one, or nothing playable in it. */
export async function audioTrack(): Promise<string | null> {
  return invoke<string | null>('audio_track')
}

/** Sends a line to the Rust side's stderr. The webview console is unreachable
 *  in a bundled build, so this is the only way an audio failure is visible. */
export function report(message: string): void {
  void invoke('report', { message })
}

/** The tray menu is built in Rust before the webview exists, so it is told the
 *  language once the widget knows it. */
export async function setMenuLabels(labels: {
  open: string
  abandon: string
  music: string
  quit: string
}): Promise<void> {
  await invoke('set_menu_labels', labels)
}

/** Sound returns for every new session, so the tray's tick returns with it. */
export async function resetMusic(): Promise<void> {
  await invoke('reset_music')
}

/** Grows or shrinks the widget without letting it jump: the Rust side puts the
 *  top left corner back after the resize. */
export async function setWidgetHeight(height: number): Promise<void> {
  await invoke('set_widget_height', { height })
}

/** Browser print to PDF is the entire export mechanism. A PDF library would be
 *  a dependency bought for one button. The JS API has no print binding in this
 *  version, so this is the webview's own, which WKWebView honours. */
export function printPage(): void {
  window.print()
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
