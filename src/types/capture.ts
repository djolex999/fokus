/**
 * One explicit union rather than a set of booleans: booleans can overlap and
 * produce states the UI has no rendering for.
 *
 * Session 1 reaches 'idle', 'capturing' and 'confirmed'. 'confirmed' was pulled
 * forward from Session 3 because the absence of any acknowledgement was noticed
 * within a minute of first use. 'resumed' is declared but not yet wired.
 */
export type CaptureState =
  | { kind: 'idle' }
  | { kind: 'capturing'; draft: string }
  | { kind: 'confirmed'; returnNumber: number }
  | { kind: 'resumed'; task: string; recent: string[] }

export type CaptureAction =
  | { type: 'open' }
  | { type: 'edit'; draft: string }
  | { type: 'confirm'; returnNumber: number }
  | { type: 'close' }

export function captureReducer(state: CaptureState, action: CaptureAction): CaptureState {
  switch (action.type) {
    case 'open':
      // Re-opening while already capturing keeps the draft: the shortcut can
      // fire twice before the window is up.
      return state.kind === 'capturing' ? state : { kind: 'capturing', draft: '' }
    case 'edit':
      return state.kind === 'capturing' ? { kind: 'capturing', draft: action.draft } : state
    case 'confirm':
      return { kind: 'confirmed', returnNumber: action.returnNumber }
    case 'close':
      return { kind: 'idle' }
  }
}
