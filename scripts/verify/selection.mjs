// Whether arriving in a state selects the input's text. Selecting replaces
// whatever is there on the next keystroke, so it must only happen to text the
// user did not type. Every case below was a real bug or is the guard against one.

export default function run(eq, { selectsOnFocus: sel, widgetReducer: r }) {
  const session = { id: 1, task: 'python', plannedMin: 25, startedAt: 'S', lastInteractionAt: 'S' }
  const offer = { task: 'loom video', plannedMin: 10, expiresAt: 'X' }
  const step = (s, a) => [s, r(s, a)]
  const tab = { type: 'cycle' }

  // Arrivals: selected.
  eq('warm start prefill selects', sel({ kind: 'idle' }, { kind: 'starting', draft: 'x', plannedMin: 25 }), true)
  eq('Tab onto an offer selects its task', sel(...step({ kind: 'noting', draft: '', offer }, tab)), true)
  eq('capture -> renaming selects the name', sel(...step({ kind: 'capturing', session, draft: 'half' }, tab)), true)
  eq('fresh capture selects (empty, harmless)', sel(...step({ kind: 'running', session }, { type: 'shortcut' })), true)

  // Carried text: left alone.
  eq('resume panel first keystroke is kept (Session 7 bug 1)', sel(...step({ kind: 'resumed', session, recent: [] }, { type: 'edit', draft: 'b' })), false)
  eq('Tab after typing your own text keeps it', sel(...step({ kind: 'noting', draft: 'my task', offer }, tab)), false)
  eq('Tab after typing, no offer, keeps it', sel(...step({ kind: 'noting', draft: 'my task', offer: null, breakable: false }, tab)), false)
  eq('ring back to thought keeps text', sel(...step({ kind: 'starting', draft: 'abc', plannedMin: 10 }, tab)), false)
  eq('renaming -> capture returns the thought unselected', sel(...step({ kind: 'renaming', session, draft: 'p', thought: 'half' }, tab)), false)
  eq('timer ends mid capture, thought kept', sel(...step({ kind: 'capturing', session, draft: 'call mom' }, { type: 'sessionCompleted' })), false)
  eq('rename saved, thought back unselected', sel(...step({ kind: 'renaming', session, draft: 'python', thought: 'half' }, { type: 'renamed', task: 'python' })), false)
  eq('Tab onto the break keeps typed text', sel(...step({ kind: 'noting', draft: 'hm', offer: null, breakable: true }, tab)), false)
  eq('break -> 25 keeps typed text', sel(...step({ kind: 'pausing', draft: 'hm', offer: null }, tab)), false)
  eq('shortcut pressed again mid capture keeps the draft', sel({ kind: 'capturing', session, draft: 'abc' }, { kind: 'capturing', session, draft: 'abc' }), false)
}
