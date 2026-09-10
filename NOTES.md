# NOTES

Running notes per session. Measurements, platform quirks, and decisions that
are not obvious from the code.

## Session 1: the loop

### Platform

Built and measured on macOS 26.6.2 (Apple silicon). The Windows focus return is
a `todo!()` in `src-tauri/src/focus.rs` with the intended approach written out.

### Decisions taken during the session

- **`objc2` + `objc2-app-kit` added.** Tauri v2 has no API for handing focus
  back to another application. These are Rust side only and macOS gated.
- **No `tauri-plugin-window-state`.** The widget position is two integers, kept
  in `widget-position.json` in the app config dir by `src-tauri/src/window_pos.rs`.
- **Activation policy is `Accessory`.** No dock icon and no app switcher entry,
  which is the macOS reading of "no taskbar entry". Consequence for now: there
  is no Cmd+Q and no menu bar, so during Session 1 the app is quit with Ctrl+C
  in the dev terminal. The tray arrives in Session 2.
- **Cooperative activation.** macOS 14 removed unilateral activation, so
  `activateWithOptions` alone is ignored. The working sequence is
  `NSApp.yieldActivationToApplication(target)` and then `target.activateWithOptions`.
- **Migration 4 seeds `sessions` row 1** with task `__seed__` and an epoch
  timestamp, because `captures.session_id` has a foreign key and Session 1 has
  no session lifecycle. Session 2 deletes it.
- **Double press guard.** If the shortcut fires while the widget already holds
  focus, the frontmost app is fokus itself. That reading is discarded, otherwise
  the round trip would end on the widget instead of the editor.

### Measurement

Method: `Instant` is started in the Rust global shortcut handler, before
anything of ours takes focus. Three stages are logged to stderr against it.

| stage | meaning |
|---|---|
| `widget focused` | `set_focus()` returned |
| `input focused` | the webview reports the caret is in the input |
| `row inserted` | the row is committed to SQLite |
| `focus returned` | the previous application accepted activation |

`focus returned` is the number the 3 second constraint applies to, minus human
typing time, which the instrument cannot see. Both the instrumented figure and
a hand check from a real editor are recorded below.

#### Results, 10 runs, 2026-09-10

Captured from the Claude desktop app on the built-in display. All ten logged
`returned to Claude, frontmost 250ms later: Claude (ok)`; none reported
`NOT RESTORED`. Confirmed by hand that typing resumes in the source app with
no click.

| run | total | shortcut to caret | Enter to focus back |
|---:|---:|---:|---:|
| 1 | 1845.7 | 14.1 | 2.3 |
| 2 | 584.6 | 5.3 | 4.7 |
| 3 | 1053.0 | 11.9 | 4.8 |
| 4 | 1727.1 | 8.3 | 1.4 |
| 5 | 1160.2 | 5.0 | 11.1 |
| 6 | 2722.7 | 47.2 | 9.0 |
| 7 | 704.2 | 4.6 | 7.4 |
| 8 | 1142.0 | 28.9 | 10.6 |
| 9 | 1068.8 | 27.8 | 10.9 |
| 10 | 1003.0 | 23.5 | 11.4 |

All figures in milliseconds.

- **Median total: 1105 ms.** Worst run 2723 ms, still inside the budget.
- Median shortcut to caret **13.0 ms**, median Enter to focus back **8.2 ms**.
- The app accounts for roughly 21 ms of the median run. The remaining ~1.08 s
  is typing. The 3 second constraint is not currently under any pressure, and
  the thing that would threaten it is work added between the keypress and the
  caret, not work added to the insert.

#### Scope change: return counter pulled forward

Session 3 item 4 was moved into Session 1 at your request. Rationale: you noticed
the missing acknowledgement inside the first minute of use, which is the kind of
evidence the two week wait in `IDEJE.md` is meant to produce, arriving early.

Implemented to the Session 3 spec exactly: `{n}. povratak` derived from
`COUNT(captures)`, one second, then `idle`. Same colour, size and line position
as the idle hint, so nothing moves or changes weight when it appears. No
animation, no sound. It counts against the seeded session id 1 until Session 2
introduces real sessions.

The count runs before focus is handed back, so the widget never shows the
committed text for a frame before the confirmation replaces it. Measured cost
of the extra `COUNT`: **0.9 ms and 2.3 ms** on two runs. Enter to focus back was
4.1 ms and 7.0 ms with the confirmation in place, against a median of 8.2 ms
without it, so the addition is inside the noise.

Judged in use: the flash does not pull the eye. That was the acceptance
criterion and it is met.

#### Still open

- Measured against the Claude desktop app, not a code editor. Electron and
  native apps can differ in how they accept activation. Worth one deliberate
  check from Cursor during Session 2's working day.
- Escape and empty Enter were not exercised in the measured runs. Both take the
  identical `close()` path as a committed capture, so the risk is low, but it is
  untested rather than verified.
- Rows 3 to 13 in `captures` are test junk (`jedan`, `asdad`, and so on).
  Row 2 is a real capture. Session 2's review list is where they get cleared.

#### Placement bug found and fixed during the session

The widget first appeared nowhere. `Monitor::size()` and `position()` are
physical pixels, but `set_position(PhysicalPosition)` converts using the
*window's* scale factor, not the target monitor's. With a scale 2 built-in
display and a scale 1 external one, a position computed as 2848 physical was
applied as 2848 logical and the window sat off the right edge of the screen in
dead space, still reported as on screen by `CGWindowListCopyWindowInfo`.
`window_pos.rs` now does all of its arithmetic in logical units and sets a
`LogicalPosition`, which no scale factor touches.

---

## Session 2: sessions

### Decisions taken during the session

- **The widget state union absorbed the session** rather than sitting beside a
  separate one. `CLAUDE.md` specifies a four variant `CaptureState`, but Session 2
  needs states it cannot express: a session running but not being captured into,
  and a session being started. Two parallel unions would have reintroduced the
  exact problem the original was written to prevent, since 'capturing' with no
  session would be representable and meaningless. idle, capturing and confirmed
  all survive, each now carrying its session. See `src/types/session.ts`.
- **Abandon lives in the tray, not on Escape.** The plan confirmation said Escape
  while running would abandon. That turned out to be unbuildable: the widget only
  holds keyboard focus while capturing or starting, so there is no "running and
  focused" state for Escape to mean anything in. The alternatives were double
  Escape or abandoning on an empty capture, both of which put a destructive action
  on the most common keystroke in the app. The tray is the right home for a rare,
  deliberate action.
- **A tray was built although Session 2 does not list one.** Item 6 requires the
  main window to be reachable and `CLAUDE.md` says only tray or menu may open it,
  so item 6 is unbuildable without it. It also supplies the ⌘Q that the Accessory
  activation policy removed in Session 1. Core Tauri, no new dependency.
- **`last_active_at` is written on session start, capture open and capture
  commit.** "Any widget interaction" taken literally would be a disk write per
  keystroke, for a column read once per session.
- **Startup reconciliation is the load bearing half of item 7.** Marking a session
  abandoned on shutdown only covers a clean exit; a crash, a SIGINT or a force quit
  leaves `ended_at` null forever. `reconcileOpenSessions` closes anything left open
  by a previous run, using `last_active_at` as `ended_at` rather than now, because
  the user stopped working when they stopped interacting.
- **Migration 5 deletes the placeholder** session and its captures. One of those
  13 rows was a real capture, `odraditi video za posao`, which went with it.

### Known consequence, undecided

A restart mid session always abandons it, including a `tauri dev` reload after a
file save. That is item 7 applied literally. The alternative is to adopt an open
session on startup when its planned window has not elapsed and abandon only the
expired ones, which is better behaviour after a crash but contradicts item 7 as
written. Built as specified, flagged, not decided.

### Verification

Countdown maths checked directly against `remainingSeconds` and
`formatCountdown`, including the case that matters: waking three hours into a
25 minute session returns 0 rather than a negative or a wrapped value. Clock
moved backwards returns more time rather than crashing.

The interactive acceptance list is not yet run.

### Language: Serbian only, settled

A Serbian/English toggle was raised and dropped on 2026-09-10. It contradicted
two lines in `CLAUDE.md` at once: the copy rule that all UI text is Serbian
(Latin), and the forbidden features list, which rules out settings beyond a
shortcut remap. A toggle is both a settings surface and a second copy set to keep
in sync forever. Recorded here so it does not get re-raised as a fresh idea.

Consequence handled at the same time: errors used to render the raw driver
message, so a failure surfaced bare English with no indication of what had
failed. Each one is now framed in Serbian at the point it is raised, with the
driver's own text kept after it. The detail stays English on purpose; it is
diagnostic, and translating or dropping it would lose the only information worth
having when something breaks.

---

## Session 3: retention

Started after the working day gate was passed rather than met. Recorded in
`PLAN.md` at the point of the gate.

### Decisions taken during the session

- **The audio scan filters by extension.** The plan says "the first file
  alphabetically", but taken literally a `.DS_Store` or a readme wins and the
  session runs silent with nothing to explain why. The scan considers mp3, m4a,
  wav, flac, aac, ogg and opus, and takes the first of those alphabetically.
- **Warm start prefills but does not focus.** The plan's acceptance line reads
  "cold start to running session in one keypress", which implies the widget holds
  the keyboard at launch. It does not, and deliberately: launch can happen at
  login, and stealing the keyboard from whatever the machine was already doing is
  the one thing this app must never do. The task is prefilled and selected, so
  the sequence is the shortcut and then Enter, and typing still replaces it.
- **Item 5 assumes a progress bar that did not exist.** "Progress bar height 2px
  to 5px" was the first mention of one anywhere in the plan, so Session 3 built
  it as well as the last minute treatment.
- **Resizing for the resume panel is done in Rust.** macOS anchors a window by
  its bottom left corner, so setting the height alone pushes the top edge upward
  and the widget slides out from under the cursor. `set_widget_height` reads the
  top left first and puts it back, in logical units for the same reason
  `window_pos` uses them.
- **The resume panel's first keystroke is kept, not swallowed.** The `edit`
  action transitions `resumed` straight into `capturing` carrying the character
  that triggered it.
- **A focus tick was needed.** Pressing the shortcut while already in `starting`
  leaves `state.kind` unchanged, so a focus effect keyed on the state alone never
  re-runs and the caret never lands. A counter bumped on every shortcut press
  fixes it, which the warm start made reachable for the first time.

### Verification

`elapsedFraction` checked directly: 0 at the start, 0.5 halfway, clamped to 1
past the end, and 0 if the clock moves backwards.

`~/fokus/audio` did not exist at the time, which is the silent path.

**Followed up 2026-09-10.** The folder-present path was exercised and the scan
turned out to be wrong: `AUDIO_EXTENSIONS` accepted `ogg` and `opus`, neither of
which WKWebView can decode. Picking one would have handed the audio element a
file it silently refuses, which is exactly the unexplained silence the extension
filter was added to prevent. The list is now what the webview actually plays:
mp3, m4a, aac, wav, aiff, flac.

The scan is now `first_playable`, split out from the command so it can be tested
without an app handle. Five tests cover alphabetical order, decoys that sort
before the real track (`.DS_Store`, `README.txt`, `.ogg`, `.opus`), case
insensitive extensions, directories named like tracks, and the three silent
outcomes: empty folder, nothing playable, no folder at all.

**Verified 2026-09-10, after it did not work.** The pipeline was never the
problem: the asset protocol served the file and WKWebView decoded it, arrow in
the filename and all, percent encoded correctly as `%E2%86%92`. `play()` was the
problem. WKWebView only starts audio from a user gesture, and `startAudio` ran
after several awaits, the database write and the IPC round trip that fetched the
track path. By then the keypress no longer counted as the cause, so playback was
refused, the rejection was caught into `console.info`, and the webview console
goes nowhere in a bundled build. Silence with no explanation: the exact failure
the extension filter was meant to prevent, arriving through a different door.

Two changes. The track is loaded at startup rather than at session start, and
`play()` is called synchronously in the Enter handler before any await, while the
keypress is still the thing causing it.

The diagnostics stay in permanently. `report()` puts messages on the Rust side's
stderr, and the media element reports `network`, `decode` and
`source not supported` explicitly, so an unplayable file can never again be
indistinguishable from having no music configured at all.

---

## Session 4: the evidence

### The Part A rubric, verified rather than recalled

The scoring is not a sum, and getting the boundary wrong shifts every result.
The official form was fetched, rendered to an image and read directly:

- Questions 1, 2, 3 count from "Sometimes" upward (value 2).
- Questions 4, 5, 6 count only from "Often" upward (value 3).
- Four or more of six is the threshold at which the form says further
  investigation is warranted.

Part B is recorded in `answers_json` but has no scoring rule. The instrument
does not define one, and inventing a number for it would be inventing a measure.

The discriminating test: six answers of "Sometimes" score **3, not 6**. Any
implementation using a single uniform threshold passes the easy cases and fails
that one.

### Decisions taken during the session

- **The Serbian questions are a translation, not the validated instrument.**
  This is the weakest point in Session 4 and it is a real limitation, not a
  rough edge. Strictly, a translated ASRS is not an ASRS. Two mitigations: the
  original English wording is rendered under each question so the person
  answering can check what was actually asked, and the printed page states that
  the items were translated. Sourcing the official Serbian version is the only
  real fix.
- **The result screen says less than the form does.** The printed ASRS says four
  or more means "symptoms highly consistent with ADHD". `PLAN.md` permits no
  interpretation beyond "this is a screener, take it to a psychiatrist", so that
  sentence is deliberately absent. The screen reports the count and stops.
- **Statistics are computed in TypeScript from rows loaded whole.** One person's
  sessions is a small dataset; SQL would buy nothing and cost the ability to test
  the arithmetic. Time of day has to be local, since SQLite holds UTC and a
  session started at 23:30 local is a late night session regardless.
- **Printing is `window.print()`.** The JS API has no print binding in this
  version, and the webview honours its own. A PDF library would be a dependency
  bought for one button.

### Verification

- **Scoring**: 14 checks against hand scored answer sets, including the uniform
  threshold trap above, Part B being ignored, and unanswered items not counting.
- **Statistics**: 20 checks covering completion by duration, median abandonment
  over an even numbered set, captures per session, local hour bucketing, Monday
  based week boundaries, and the empty dataset. Two of those failed first time
  and both failures were in the test, not the code; the weekday was then
  confirmed with `date` rather than counted by hand.
- **Print layout**: rendered with two weeks of realistic data and measured.
  190.4mm of the 269mm available on A4 at a 14mm margin, so it fits one page
  with room. Every print colour is a pure grey, with the two chart series at
  luminance 208 and 85, so grayscale legibility is structural rather than lucky.
  One bug found this way: the legend swatches kept their screen colours, putting
  a near black chip next to a light grey bar and making the legend contradict the
  chart it explained.
- **Copy**: every string in the result and printed page reread for diagnostic
  implication. The only occurrences of "dijagnoza" are the two disclaimers.

### Still open

The questionnaire, the statistics screen and the print dialog have not been
exercised by hand. Statistics need ten sessions before they render at all, and
there are currently zero.

---

## The last_active_at bug

Found by accident while seeding test data on 2026-09-10. A real session,
`RADIM SATOR`, ran about two minutes and recorded `ended_at` identical to
`started_at`: zero minutes.

### Cause

`last_active_at` only advanced when the user interacted (session start, capture
open, capture commit). Start a session, never press the shortcut again, and it
stays pinned at `started_at`. When the app then goes away without a clean quit,
startup reconciliation falls back to `COALESCE(last_active_at, started_at)` and
writes a zero length session.

So any session where nothing was captured, and which did not end cleanly,
recorded as zero. That is the exact opposite of the sessions worth measuring
accurately, and it silently drags down the median time to abandonment, the one
number in Session 4 intended for a clinician.

### The trap in the obvious fix

Heartbeating into `last_active_at` alone breaks the resume panel. That panel
fires when `now - last_active_at > 5 min`, meaning "how long since the user did
something". A heartbeat is not the user doing something, and feeding it into
that clock would mean the panel never appears again.

The column and the field therefore mean different things now, and are named
accordingly:

- **`sessions.last_active_at`** is liveness: user interactions plus a once a
  minute heartbeat. Reconciliation reads it.
- **`RunningSession.lastInteractionAt`**, in memory only, is the last user
  interaction. The resume panel reads it. The heartbeat never writes to it.

No migration: the column's meaning widened to a superset of what it held before,
and the resume panel's clock never needed to survive a restart, because a
restart abandons the session anyway.

Both writes are guarded on `ended_at IS NULL`, so a late heartbeat cannot
disturb a session that has already been closed.

### Verified

Four checks against a scratch database: an eight minute session with no captures
now records eight minutes rather than zero; the same session without a heartbeat
still records zero, which is the bug reproduced for contrast; a late heartbeat
cannot modify a closed session; and the understatement is bounded by one
interval.

### Related, not fixed

A session slept through records `ended_at` at wake time rather than at its
planned end, because completion writes `now`. That overstates completed
sessions. It does not touch the abandonment median, which only reads abandoned
rows, so it is noted rather than chased.

---

## Music: a tray item, not a start-of-session choice

Asked for on 2026-09-10. It sits against two lines: Session 3 item 1 says "no
controls of any kind in the UI", and the forbidden features list rules out
settings beyond a shortcut remap. Three options were put up, and the one first
recommended was the worst.

**Why a choice at session start was wrong.** Task initiation is the core deficit
this app is built around. A decision placed at the exact moment of starting taxes
the hardest moment, and it breaks the one keypress start that the Session 3 warm
start exists to produce. There is also a reason to want the audio automatic:
music that begins with every session becomes a conditioned cue that work has
started, and a per session choice destroys that by making it unreliable.

**What the need actually was.** Not "choose each time" but "sometimes audio is
impossible", which is rare and deliberate. That is the same shape as abandoning a
session, and it belongs in the same place for the same reason: off the path taken
every time.

So music always starts with the session, and the tray silences the current one.
Per session, never persisted, so no stored preference and no setting. The ♪ glyph
remains the only indicator, since it already reflects whether sound is actually
playing rather than whether it was asked for.

**The test of whether this was right:** if the tray item gets used most days,
the real need was a persisted preference, and the honest response then is to
amend the forbidden features line rather than keep clicking. If it goes untouched
for weeks, per session was correct.
