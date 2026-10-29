import { useEffect, useState } from 'react'
import { changeShortcut, describeError, failure, shortcutLabel } from '../lib/ipc'
import { acceleratorFrom } from '../lib/shortcut'
import { t } from '../lib/i18n'

/**
 * The one setting fokus has. Press the new combination; it is registered at
 * once, or refused with the old one kept. Recording listens on the window in
 * the capture phase so nothing else on the page reacts to the keys meanwhile.
 *
 * Pressing the current shortcut while recording opens the capture widget
 * instead of reaching here, because the system delivers it to fokus globally.
 * That is a no-op change anyway.
 */
export function ShortcutSetting(): JSX.Element {
  const [label, setLabel] = useState('')
  const [recording, setRecording] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    shortcutLabel()
      .then(setLabel)
      .catch((e: unknown) => setMessage(failure(t.errCannotLoad, e)))
  }, [])

  useEffect(() => {
    if (!recording) return
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      const plain = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
      if (event.key === 'Escape' && plain) {
        setRecording(false)
        setMessage(null)
        return
      }
      const recorded = acceleratorFrom(event)
      if (!recorded.ok) {
        if (recorded.reason === 'needsModifier') setMessage(t.errShortcutModifier)
        if (recorded.reason === 'everyday') setMessage(t.errShortcutEveryday)
        return
      }
      setRecording(false)
      changeShortcut(recorded.accelerator)
        .then((next) => {
          setLabel(next)
          setMessage(null)
        })
        .catch((e: unknown) => {
          // Rust has already put the old one back; say so in plain words.
          const reason = describeError(e)
          setMessage(reason.startsWith('taken') ? t.errShortcutTaken : failure(t.errShortcutNotSet, e))
        })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording])

  return (
    <div className="setting">
      <span className="setting-name">{t.shortcutName}</span>
      <span className="setting-value">{recording ? t.shortcutRecording : label}</span>
      {!recording && (
        <button
          type="button"
          className="header-action"
          onClick={() => {
            setMessage(null)
            setRecording(true)
          }}
        >
          {t.shortcutChange}
        </button>
      )}
      {message !== null && <span className="setting-message">{message}</span>}
    </div>
  )
}
