// Turning a key press into a shortcut, and refusing the ones that would break
// typing or every other app's everyday shortcuts.

export default function run(eq, { acceleratorFrom: rec }) {
  const press = (code, mods = {}, key = 'x') => ({ key, code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods })
  eq('the default records as itself', rec(press('Space', { metaKey: true, shiftKey: true })), { ok: true, accelerator: 'SUPER+SHIFT+Space' })
  eq('Option+Space', rec(press('Space', { altKey: true })), { ok: true, accelerator: 'ALT+Space' })
  eq('Ctrl+Alt+K', rec(press('KeyK', { ctrlKey: true, altKey: true })), { ok: true, accelerator: 'CONTROL+ALT+KeyK' })
  eq('Cmd+Shift+1 is fine', rec(press('Digit1', { metaKey: true, shiftKey: true })), { ok: true, accelerator: 'SUPER+SHIFT+Digit1' })
  eq('a modifier alone waits', rec(press('MetaLeft', { metaKey: true }, 'Meta')), { ok: false, reason: 'modifierOnly' })
  eq('a bare key is refused', rec(press('Space')), { ok: false, reason: 'needsModifier' })
  eq('Shift+A is refused', rec(press('KeyA', { shiftKey: true })), { ok: false, reason: 'needsModifier' })
  eq('Cmd+W is refused', rec(press('KeyW', { metaKey: true })), { ok: false, reason: 'everyday' })
  eq('Ctrl+C is refused', rec(press('KeyC', { ctrlKey: true })), { ok: false, reason: 'everyday' })
  eq('Cmd+Space is allowed (not a letter)', rec(press('Space', { metaKey: true })), { ok: true, accelerator: 'SUPER+Space' })
  eq('the physical key, not the layout', rec(press('KeyZ', { altKey: true }, 'y')), { ok: true, accelerator: 'ALT+KeyZ' })
}
