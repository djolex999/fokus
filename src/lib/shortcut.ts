/** The parts of a key event that decide a shortcut. */
export type KeyPress = {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export type Recorded =
  | { ok: true; accelerator: string }
  /** Only modifiers so far: keep waiting for the key. */
  | { ok: false; reason: 'modifierOnly' }
  /** No Cmd, Ctrl or Alt: it would fire on ordinary typing. */
  | { ok: false; reason: 'needsModifier' }
  /** Cmd or Ctrl alone with a letter or digit, like Cmd+W or Ctrl+C: taking it
   *  globally would break that shortcut in every other app. */
  | { ok: false; reason: 'everyday' }

const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift', 'OS'])

/**
 * A key press as the string the Rust side parses: modifiers in its words, then
 * `KeyboardEvent.code`, which already matches its key names (KeyA, Digit1,
 * Space). The code, not the key, so the shortcut follows the physical key
 * whatever the keyboard layout prints on it.
 */
export function acceleratorFrom(press: KeyPress): Recorded {
  if (MODIFIER_KEYS.has(press.key)) return { ok: false, reason: 'modifierOnly' }
  if (!press.metaKey && !press.ctrlKey && !press.altKey) return { ok: false, reason: 'needsModifier' }
  const plainKey = /^(Key[A-Z]|Digit[0-9])$/.test(press.code)
  const oneCommand = press.metaKey !== press.ctrlKey && !press.altKey && !press.shiftKey
  if (plainKey && oneCommand) return { ok: false, reason: 'everyday' }
  const parts: string[] = []
  if (press.metaKey) parts.push('SUPER')
  if (press.ctrlKey) parts.push('CONTROL')
  if (press.altKey) parts.push('ALT')
  if (press.shiftKey) parts.push('SHIFT')
  parts.push(press.code)
  return { ok: true, accelerator: parts.join('+') }
}
