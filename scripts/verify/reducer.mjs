// The widget state machine: what each key and event does from each state.
// Cases are grouped by the session that introduced the behaviour, and the bug
// each one would have caught is named where there was one.

export default function run(eq, { widgetReducer: r, sessionOf, holdsKeyboard, offerOf }) {
  const session = { id: 7, task: 'pyhton', plannedMin: 25, startedAt: 'S', lastInteractionAt: 'S' }
  const offer = { task: 'loom video', plannedMin: 10, expiresAt: '2026-01-01T02:00:00.000Z' }
  const idle = { kind: 'idle' }
  const running = { kind: 'running', session }
  const run = (s, ...actions) => actions.reduce((state, a) => r(state, a), s)
  const tab = { type: 'cycle' }

  // Session 5: with no session running, the shortcut means a thought.
  const typed = run(idle, { type: 'shortcut' }, { type: 'edit', draft: 'reply' })
  eq('idle shortcut opens a thought', typed, { kind: 'noting', draft: 'reply', offer: null })
  eq('finished shortcut opens a thought', r({ kind: 'finished', task: 'x', written: 0 }, { type: 'shortcut' }), { kind: 'noting', draft: '', offer: null })
  eq('noted shortcut opens a thought', r({ kind: 'noted', offer: null }, { type: 'shortcut' }), { kind: 'noting', draft: '', offer: null })
  eq('ring: thought -> 25', r(typed, tab), { kind: 'starting', draft: 'reply', plannedMin: 25 })
  eq('ring: -> 50', run(typed, tab, tab), { kind: 'starting', draft: 'reply', plannedMin: 50 })
  eq('ring: -> 10', run(typed, tab, tab, tab), { kind: 'starting', draft: 'reply', plannedMin: 10 })
  eq('ring: -> thought, draft kept', run(typed, tab, tab, tab, tab), { kind: 'noting', draft: 'reply', offer: null })
  eq('Enter on a thought -> noted', r(typed, { type: 'noteSaved' }), { kind: 'noted', offer: null })
  eq('noted clears to idle', r({ kind: 'noted', offer: null }, { type: 'dismiss' }), idle)
  eq('Escape from a thought -> idle', r(typed, { type: 'dismiss' }), idle)
  eq('Escape from starting -> idle', r(r(typed, tab), { type: 'dismiss' }), idle)
  eq('Enter on a duration starts the session', r(r(typed, tab), { type: 'sessionStarted', session }), running)
  eq('tray End session while noting -> idle', r(typed, { type: 'sessionAbandoned' }), idle)

  // During a session: capture, unchanged since Session 1.
  eq('running shortcut opens capture', r(running, { type: 'shortcut' }), { kind: 'capturing', session, draft: '' })
  eq('capture is numbered', r({ kind: 'capturing', session, draft: 'x' }, { type: 'captureConfirmed', returnNumber: 3 }), { kind: 'confirmed', session, returnNumber: 3 })
  eq('Tab does nothing while just running', r(running, tab), running)

  // Session 6: Tab from capture renames the task, holding the thought.
  const cap = run(running, { type: 'shortcut' }, { type: 'edit', draft: 'half' })
  eq('capture -> renaming, name prefilled, thought held', r(cap, tab), { kind: 'renaming', session, draft: 'pyhton', thought: 'half' })
  eq('renaming -> capture, thought back', run(cap, tab, tab), { kind: 'capturing', session, draft: 'half' })
  eq('Escape from renaming -> running', run(cap, tab, { type: 'captureDismissed' }), running)
  eq('resumed -> renaming', r({ kind: 'resumed', session, recent: [] }, tab), { kind: 'renaming', session, draft: 'pyhton', thought: '' })
  eq('shortcut while renaming keeps it', r(r(cap, tab), { type: 'shortcut' }), r(cap, tab))

  // Session 7, bug 4: confirming the name kept the thought only on Tab.
  const fixed = { kind: 'renaming', session, draft: 'python', thought: 'call mom' }
  eq('rename saved with a thought held -> back to it', r(fixed, { type: 'renamed', task: 'python' }), { kind: 'capturing', session: { ...session, task: 'python' }, draft: 'call mom' })
  eq('rename saved, nothing held -> running', r({ ...fixed, thought: '' }, { type: 'renamed', task: 'python' }), { kind: 'running', session: { ...session, task: 'python' } })

  // Session 7, bug 3: the timer running out mid capture lost the text.
  const done = { type: 'sessionCompleted', written: 2 }
  eq('timer ends with text -> kept as a thought', r({ kind: 'capturing', session, draft: 'call mom' }, done), { kind: 'noting', draft: 'call mom', offer: null })
  eq('timer ends, nothing typed -> finished, count kept', r({ kind: 'capturing', session, draft: '  ' }, done), { kind: 'finished', task: 'pyhton', written: 2 })
  eq('timer ends mid rename with a thought -> the thought', r(fixed, done), { kind: 'noting', draft: 'call mom', offer: null })
  eq('timer ends while running -> finished with its count', r(running, done), { kind: 'finished', task: 'pyhton', written: 2 })
  eq('a session with nothing written finishes with 0', r(running, { type: 'sessionCompleted', written: 0 }), { kind: 'finished', task: 'pyhton', written: 0 })

  // Session 7, bug 2: a warm start took over the shortcut. Now an offer.
  const offered = r(idle, { type: 'warmStart', offer })
  const noting = r(offered, { type: 'shortcut' })
  eq('warm start -> offered, nothing focused', offered, { kind: 'offered', offer })
  eq('warm start ignored unless idle', r(running, { type: 'warmStart', offer }), running)
  eq('shortcut on an offer -> a thought, offer held', noting, { kind: 'noting', draft: '', offer })
  eq('first Tab from an empty thought -> the offer', r(noting, tab), { kind: 'starting', draft: 'loom video', plannedMin: 10 })
  eq('Tab after typing -> your text, default 25', run(noting, { type: 'edit', draft: 'new' }, tab), { kind: 'starting', draft: 'new', plannedMin: 25 })
  eq('a thought saved keeps the offer', run(noting, { type: 'edit', draft: 'x' }, { type: 'noteSaved' }, { type: 'dismiss' }), offered)
  eq('Escape from the thought -> still offered', r(noting, { type: 'dismiss' }), offered)
  eq('Escape from offered -> idle', r(offered, { type: 'dismiss' }), idle)
  eq('offer expires while offered -> idle', r(offered, { type: 'offerExpired' }), idle)
  eq('offer expires mid thought -> thought kept', run(noting, { type: 'edit', draft: 'abc' }, { type: 'offerExpired' }), { kind: 'noting', draft: 'abc', offer: null })

  // Helpers the widget leans on.
  eq('sessionOf(offered) is null', sessionOf(offered), null)
  eq('sessionOf(renaming) is the session', sessionOf(fixed), session)
  eq('offerOf(noting) is the offer', offerOf(noting), offer)
  eq('offered holds no keyboard', holdsKeyboard(offered), false)
  eq('renaming holds the keyboard', holdsKeyboard(fixed), true)
}
