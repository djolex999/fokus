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
- **Activation policy was `Accessory`.** No dock icon and no app switcher entry,
  taken as the macOS reading of "no taskbar entry". **Reversed on 2026-09-10, see
  below.**
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

### Known consequence, since decided

A restart mid session used to abandon it, which is item 7 applied literally. It
was flagged twice as questionable and settled on 2026-09-10, in use: quitting the
app at minute six of twenty five and reopening threw away a session that was
never actually over.

**Time ends a session, not the process holding the timer.** A session whose
planned window has not elapsed is now picked back up at startup; only the ones
whose time genuinely ran out while nothing was watching are closed, still with
`ended_at = COALESCE(last_active_at, started_at)`. Where several are somehow
open, the newest is resumed and the rest closed, because two running sessions is
not a state the widget can represent.

This contradicts item 7 as written, deliberately, and `PLAN.md` is marked at that
line.

Fourteen checks cover it: six minutes in resumes, exactly at the planned end does
not, yesterday's session does not, a 50 still has time where a 25 would not,
newest of several wins and the rest are closed, expired and live together, an
unparseable `started_at` is closed rather than resurrected, and an unrecognised
duration is not trusted into a type it does not belong to.

Known gap: a resumed session usually starts silent. The webview only begins audio
from a user gesture and launching the app is not one it can see. It is attempted
and the refusal is reported rather than swallowed, so the reason is on the
record.

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

### Related, since fixed

A session slept through recorded `ended_at` at wake time rather than at its
planned end, because completion wrote `now`. Fixed on 2026-09-10: a completed
session is dated from `started_at + planned_min`, because it ended when its time
ran out, not when a one second tick noticed. In the ordinary case that corrects a
second of drift; in the case that matters it stops a 25 minute session recording
as three hours. Abandonment still takes `now`, because an abandoned session
genuinely did end at the moment it was abandoned.

### A correction to an earlier claim

It was also claimed that a session whose time runs out while the app is closed
records as abandoned "even though it ran its full duration". That was wrong on
both halves. It did not run its full duration, the app was shut for part of it,
so abandoned is the honest outcome. And the proposed fix, inferring completion
from the heartbeat reaching the planned end, could never fire: if the app is
alive at the planned end then the completion effect has already run, so an open
expired session always means the process died first. It would have been a no op
shipped on the strength of a plausible sounding argument.

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


---

## Activation policy: reversed

`Accessory` was an over-translation. `skipTaskbar` on Windows hides *that window*
while the process remains an ordinary application; it was read here as hiding the
whole application from macOS. The consequence only showed up in use: an accessory
app has no dock presence at all, so macOS never draws the running indicator under
it, and a pinned dock icon is a launcher that can never say whether the thing is
running. Raised twice before it was believed, and two replies were spent
explaining why the missing indicator was correct rather than asking whether the
policy was.

Now `Regular`, verified through `NSWorkspace` rather than from the source:
`rs.growthq.fokus -> regular`.

Guarded on the way: macOS can ask an app to reopen its windows when its dock icon
is clicked, which would breach constraint 3, the main window never opening by
itself. `RunEvent::Reopen` is handled and deliberately does nothing.

Two consequences accepted: Cmd+Q now quits, bypassing the clean session close the
tray does, which is survivable only because session resume landed first; and the
app takes an app switcher slot despite being driven by a global shortcut and a
tray.

---

## English, and why there is still no language switch

Added 2026-09-10, ahead of open sourcing. `CLAUDE.md` said Serbian because this
was one person's tool; a public app needs English, which is a different question
from the toggle that was raised and dropped earlier.

The design that needs no switch is to follow the system language. No settings
surface, so the forbidden features line stands, and `CLAUDE.md` has been amended
at the copy rule rather than left contradicting the app.

**A wrong turn worth keeping the record of.** The first rule read the primary
language only. This machine reports `("en-US", "sr-Latn-US", "sr-US")`, so it
would have switched its owner's own daily tool to English on the morning he
planned to use it, silently. The rule was widened to "Serbian if Serbian appears
anywhere in the list", which protected him. He then said he wanted English. The
widening was solving a problem he did not have, so it went back to the primary
entry: a system set to English is a person telling you they want English, and a
second entry in the list is not a contradiction of that.

**A side benefit for the screener.** In English the questions are the official
WHO wording, so an English reader gets the validated instrument rather than a
translation, and the printed page drops the translation caveat because there is
no translation to caveat. That removes part of the first blocker on distributing
this: Serbian readers still get my translation with the original underneath, but
nobody else is handed an unvalidated instrument.

Checked by a test rather than by reading: both tables have identical keys, no
value is empty, no English value is still the Serbian one except the two words
that are legitimately the same, and every `{placeholder}` survives translation in
both tables, since a lost one silently removes a number from the UI.

### English copy, revised after reading it out loud

The first pass translated word for word and produced things nobody says.
"pripremi za pregled" became "prepare for appointment", which says nothing about
what the button does and reads as a calendar feature; *pregled* carries the
medical sense in Serbian and "appointment" carries none of it. It is now "print
for your doctor": what happens, and who for.

Others in the same pass: "write the thought down" to "write it down"; "do it" to
"done", since that button writes `resolved = 'done'` and was telling you to do
something instead of recording that you had; "breaking off" to "stopped early",
which is a label rather than a phrase; and "captured" to "written down", which
also fixed a warning still calling it "everything captured" after the rename.

### Disclaimer

Added on request, and correct to add: this is about to be a public download that
administers a clinical screener. It states three things and does not overclaim:
fokus is not a medical device, nobody has approved or reviewed it, and the
software around ASRS v1.1 is not clinically validated. The result is material for
a conversation with a doctor, not a finding.

Shown before the questions rather than only with the score. A disclaimer that
appears once you have a number has already let you read the number as a verdict.
Also on the result, and on the printed page including when no questionnaire has
been taken, since that page is the thing that leaves the house.

Set as a footnote rather than in alarm colours: a warning styled as an alert gets
dismissed as decoration, one styled as a footnote gets read once and believed.

The printed page still fits: 200.6mm of the 269mm available, so the disclaimer
cost 10mm of a 78mm margin.


---

## Two more found by using it

### "End session" appeared broken

The tray item checked for a live session and silently did nothing when there was
not one, so once a session had completed and the widget sat at 0:00 it looked
dead. It now clears whatever is on screen: a finished 0:00, or a half typed task.

### 0:00 had nothing to clear it

`finished` was written to hold until the next shortcut press, so completion would
be observable. Nothing else cleared it, which is the bug above, and a bare 0:00
carries no timestamp, so once you have looked away it no longer tells you whether
the session ended a minute ago or this morning. It now clears itself after a
minute. Long enough to be seen if you look up, short enough never to be stale.

### App icon follows the tray icon

The dock icon was still the original white dot, which now clashed with the menu
bar and carried the same problem: too generic, and close enough to a record
button. It is the same viewfinder on a near black tile, so the two read as one
thing rather than two apps.

The tile has a slight lift toward the top rather than being flat. A flat near
black square reads as a hole in the dock beside everything else that has depth.

Checked by rendering at 128, 64, 32 and 16 rather than admiring it at 1024: it
holds to 32 and softens at 16, which is where every icon softens.

Note for reinstalling: macOS caches dock icons hard. `touch` the bundle and
`killall Dock`, or the old icon persists and looks like the build failed.

### Tray icon: third attempt

A filled dot was too generic to find. A ring with a dot in the middle was
distinctive and also the universal record button, which in a menu bar is the
worst thing it could be mistaken for. It is now camera focus brackets, four
corner marks around empty space: an unusual silhouette up there, and literally
the symbol for focus. Judged against `[ ]`, an hourglass and an open square by
rendering all four at 22pt on a dark bar rather than by describing them: brackets
read as text markup, the hourglass says waiting rather than focus, and the open
square reads as a selection marquee.

---

## Windows: written blind, then run

Implemented on 2026-09-10 on a Mac, where it compiled and had not executed once.
Run for the first time on 2026-09-11 on a real Windows machine, and the capture
loop worked: Ctrl+Shift+Space from Notepad, type, Enter, and typing resumes in
Notepad without touching the mouse. `AttachThreadInput` around
`SetForegroundWindow` was the part in doubt and it held on the first attempt.

The distinction between compiling and running mattered more here than anywhere
else in this project, because the capture loop is the product and it is the part
that cannot be reasoned into working.

### How it was checked without a Windows machine

`cargo check --target x86_64-pc-windows-msvc` on the real crate fails in
`libsqlite3-sys`, which wants to compile bundled C for Windows and needs an MSVC
C compiler this machine does not have. That is a transitive dependency, not the
code in question.

So the Windows module is lifted verbatim out of `focus.rs` into a scratch crate
whose only dependency is `windows`, and that is checked against the MSVC target.
It caught a real error immediately: `AttachThreadInput` is in
`Win32::System::Threading`, not in `Win32::UI::Input::KeyboardAndMouse` where its
name suggests. Signatures for `IsWindow`, `SetForegroundWindow` and
`QueryFullProcessImageNameW` were read out of the generated bindings rather than
recalled.

### What is different from macOS, and why

**A window handle, not a process id.** macOS activates applications; Windows
activates windows. One process can own several top level windows, and returning
to the wrong one drops the user in the wrong document. The stored value is now an
opaque `focus::Target`, a pid on one platform and an HWND on the other, so
neither has to pretend to be the other.

**`activate_self` does nothing on Windows.** tao's `set_focus` already calls
`SetForegroundWindow`, and Windows grants foreground rights to the process that
received the last hotkey, which at that instant is fokus. The macOS counterpart
exists only because macOS 14 removed the equivalent guarantee.

**`AttachThreadInput` around the restore.** `SetForegroundWindow` is refused
unless the caller owns the foreground. fokus does own it, having just taken it,
but the permission is tracked per input queue and the bare call is ignored often
enough to matter. The attachment is undone immediately: left in place, the two
threads share an input queue for the rest of the session and one hanging hangs
the other.

### One bug this found on macOS

The widget printed `⌘⇧Space` from a hardcoded string while Rust separately
registered the chord. Two places naming one shortcut, and the frontend copy would
have told Windows users to press a key their keyboard does not have. The label
now comes from the side that registers it.

### What the first run actually cost, and none of it was the code

Three environment walls before a single line of fokus was reached: pnpm's build
script gate rejecting `esbuild`, with the setting to allow it having moved twice
between versions; `link.exe not found`, arriving only after 354 crates had
downloaded and reading like a compile error; and rustc running out of memory on
the `windows` crate, fixed with `CARGO_BUILD_JOBS=1`.

Then one real bug, mine: `RunEvent::Reopen` does not exist on Windows, and the
isolated type-check I had built only contained the `imp` module from `focus.rs`,
so it could not see `lib.rs`. **A partial check that passes reads exactly like a
whole check that passed.** CI now compiles for both platforms, which is the
change that stops that recurring.

### Still open on Windows

- Everything outside the capture loop has had far less use there than on macOS
- `transparent`, `decorations: false`, `alwaysOnTop` and `shadow` all mean
  something different under WebView2 and have not been examined
- `window_pos.rs` does DPI arithmetic written against a mixed DPI *macOS* setup.
  Windows per monitor DPI is its own problem, and this is exactly where the
  physical versus logical bug bit the first time
- SmartScreen: unsigned Windows binaries get a harsher warning than Gatekeeper

---

## A pattern worth naming: tests that report a failure that is not there

Three times in one day a check of mine reported a problem that did not exist, and
each time the wrong answer was momentarily convincing.

- Grepping the installed app bundle for new strings returned five misses, which
  looked like a stale install. Tauri compresses embedded assets, so grep cannot
  find *any* of them. The tell was that a string present since Session 2 also came
  back missing.
- `pnpm install --frozen-lockfile --dry-run` reported the lockfile out of sync.
  `--dry-run` is not valid in that combination; the real command passes.
- `cargo check --target x86_64-pc-windows-msvc` failed in `libsqlite3-sys`, which
  reads as "the Windows code does not compile". It was a transitive dependency
  wanting a C compiler, and the Windows code compiles fine when checked in
  isolation.

The rule that would have caught all three: **a check that reports failure for
something known to be present is broken, not informative.** Test the test against
a case whose answer you already know before believing it about a case you do not.

## And one about diagnosis

The landing page demo silently did nothing on Enter. Four rounds went into
theorising about which element a closure had captured, with the page state moving
between each inspection. Rewriting it with one delegated handler and an explicit
state variable fixed it immediately and removed the whole class of bug.

Reaching for the structural fix earlier would have been faster than continuing to
excavate. The signal to switch is when the same hypothesis keeps almost fitting.

---

## A partial check reads exactly like a whole one

The Windows focus return was type-checked before it ever ran, by lifting the
`imp` module out of `focus.rs` into a scratch crate with only the `windows`
dependency. That caught a genuine mistake: `AttachThreadInput` lives in
`Win32::System::Threading`, not the keyboard module its name suggests.

Then it passed, and the passing felt like coverage. It was not.
`RunEvent::Reopen` does not exist on Windows, and the harness could not see
`lib.rs` because `lib.rs` was never in it. The failure surfaced on a real machine
after a full dependency download.

The fix was not a better harness. It was CI compiling for both platforms, so the
gap cannot reopen. **A check that covers part of the problem reports success in
exactly the same words as one that covers all of it.**

## One file holding copy is one file too many

Every user-facing string was moved into `i18n.ts`, typed identically in both
languages, and covered by a test asserting key parity, no empty values, no
English entry still holding Serbian, and every placeholder surviving
translation. It passed.

The ASRS answer buttons stayed Serbian in an English app for a day, because they
were declared in `types/asrs.ts` and were therefore never in the set the test
iterated over. **A consistency test proves consistency across what it was handed,
and says nothing about what was never handed to it.**

## Correct is not the same as understandable

The tray music item was a checkbox: ticked meant the music was on, clicking it
turned the music off. Textbook semantics, implemented correctly, and reported as
"kontra" the first time it was used for real.

A tick asks the reader to establish a state and then infer what a click will do.
In a menu opened once a week, mid-work, that is a small puzzle at the worst
possible moment. The label now says what the next click does, "Silence music" or
"Play music", and there is nothing to infer.

Worth separating from a bug report: nothing was broken. The complaint was about
the cost of understanding it, which no test would ever have raised.

## The environment is most of the work on a new platform

Getting fokus to run once on Windows cost an evening, and three of the four
walls were not the code. pnpm's build script gate rejecting `esbuild`, with the
setting that allows it having moved twice between versions. `link.exe not found`,
arriving only after 354 crates had downloaded and reading like a compile error.
rustc exhausting memory on the `windows` crate, fixed with
`CARGO_BUILD_JOBS=1`.

The permanent fix for the first one was to stop fighting it: the Tauri hooks call
`npm`, which has no such gate, so the package manager is no longer in the path at
all.

## A third duration, and the feature it is a refusal of

2026-09-16. Added 10 minutes alongside 25 and 50. The toggle is a three way
cycle now instead of a flip.

It came out of the "breadcrumb method": draw boxes in a notebook, work 5 or 10
minutes per box, tick the box, and the tick is described as a dopamine hit that
builds momentum. The tick is the part that does not survive contact with
`CLAUDE.md`, and it should not. A row of boxes, some filled and some not, is a
score you can be behind on. It cannot decay gracefully either: it stays on
screen after the motivation it was meant to produce has worn off, and then it is
just a reproach. That is precisely what abandoned-is-neutral exists to prevent.

What is left once the tick is removed is not a reward mechanic at all. It is a
smaller commitment. Starting a session, not finishing one, was the actual
problem, and 25 minutes is a heavier thing to agree to than 10. The evidence for
lowering the cost of starting is much better than the evidence for rewarding
completion, and it needs no UI.

So: one more value in an enum, and nothing else.

### The part that was almost a bug

The duration existed in four places, and two of them narrowed a stored integer
back into the type by hand: `value === 50 ? 50 : 25` in `toPlannedMinutes`, and
the same ternary copied into `lastAbandonedSession`. Adding 10 to the union and
the widget while missing either one would have compiled clean and produced a 10
minute session that resumed as a 25 minute one. A timer reading four numbers
from three sources, disagreeing only after a restart.

`DURATIONS` is now declared once and the other three read from it. The fix is
not that the ternaries were wrong, they were correct for two values. It is that
a list written out by hand in two files has no way to be told it is incomplete.

## The warm start had no notion of warmth

2026-09-16. Launching the app offered `loom video` as the task, preselected,
with the duration set. That session ended on 11 September. It had been offering
it on every launch for five days.

Working exactly as `PLAN.md` specified, which is the interesting part. Session 3
item 3 says: query the most recent abandoned session and prefill it. The word
doing the unstated work is "most recent". Most recent among what was written as
if it meant most recent *lately*, and the code can only read it as most recent
*ever*. There is no bound in the sentence, so there was none in the query.

Now bounded to two hours, in a named constant. Two rather than something tighter
because the case it exists for is quitting and coming back, and lunch is inside
that. Observed relaunch chains in the data are minutes apart, so the window is
generous on purpose: the cost of offering a task slightly too old is one
keystroke, and the cost of not offering one that was still live is the whole
feature.

`julianday()` on both sides rather than comparing ISO strings. Stored timestamps
are `2026-09-16T07:53:51.967Z` and SQLite's own rendering is not identical
character for character. A text comparison would work until the day it did not,
and would fail by silently offering nothing, which looks exactly like having
nothing to offer.

### Checked against real data, not a fixture

Run against a copy of the live database: the old query returns `loom video`, the
new one returns nothing. Then a synthetic abandon from ten minutes ago, which is
returned, and the same row aged to three hours, which is not. The middle step is
the one that matters. A window like this fails most often by excluding
everything, and "returns nothing" against a database with no recent abandons
looks identical to correct.

### The second bug underneath

Session 39 ran 24 of its 25 minutes and was ended by hand one minute short. It is
recorded as `abandoned`, so it is what the warm start was resurrecting: finished
work, offered back as unfinished business. The window stops it being offered
five days later. It does not stop the outcome being wrong, and that same wrong
outcome reaches the statistics screen and the page meant to be printed for a
doctor. Still open.

## What an ending means is derived, like the return count

2026-09-23. The statistics read `outcome` directly, so every session ended by
hand was a failure. Session 39 ran 24 of its 25 minutes and was ended one minute
short; session 35 lasted nine seconds and was restarted four seconds later under
a better name. Both counted as abandoned, and the page built to be handed to a
doctor reported 6 of 11 sessions completed with a median of 19 minutes before
stopping.

The stored rows were not wrong. The session really was ended by hand at minute
24, and that is kept exactly as written. What was wrong is that three readers
(the statistics, the printed page, the warm start) each needed to know whether
an ending was a stop or a finish, and each read the raw column as if it said.
So the answer is derived once, in `classifyEnding`, into four meanings:
completed, stopped early, false start, open.

- **Ended by hand after 90% of the planned time counts as completed.** Ninety,
  not eighty. Eighty would call a 50 minute session ended with ten minutes left
  finished. The page is for a doctor, and a threshold that flattered completion
  would be as wrong as the one that condemned it.
- **Under a minute is a false start,** and is dropped from the statistics
  entirely rather than counted either way. It was never a session.
- **A share of planned time, not minutes remaining.** Five minutes left is
  nothing in a 50 and half of a 10.

No schema change and no migration, and the fix reaches every existing row the
moment it ships. That is the argument for deriving over storing, made for the
second time in this codebase: the return count already works this way for the
same reason. A stored classification is a second copy of a fact that can drift
from the first, and a threshold baked into rows at write time cannot be
revisited without rewriting history.

The warm start uses the same function, so it offers back only a session that was
genuinely stopped early. Not one that was finished, and not a false start, whose
work continued in the very next session under the corrected name.

### Checked by running the real function against the real rows

`stats.ts` compiled to JavaScript with the `tsc` already in the project, run
against a copy of the live database. The eleven sessions from the 16th classify
as predicted before a line was written: 35 a false start, 39 completed, 31, 37
and 38 stopped early. Eight boundary cases also pass, including 22m29s of 25
(stopped early) against 22m30s (completed), which is the one an off-by-one
would get wrong. No test runner was added to get this; the dependency budget
still holds.

### A rename looks like a stop, and the tell is the restart

Session 42 ran 95 seconds and session 43 started four seconds after it ended,
same work, new name. The same pattern as 35 and 36, but over the one minute
line, so the first version counted it as stopped early, and that single row
moved the printed median from 19 minutes to 11.

Duration was only ever a proxy. The actual signal is "ended and immediately
replaced": the running task cannot be renamed, so a typo costs a session. So a
session stopped inside its first five minutes and followed by a new one within
fifteen seconds is also a false start. `classifyEnding` takes the next session's
start as an argument; the statistics compute it from the sorted rows and the
warm start from a subquery.

Checked against the real rows. 42 is now a false start. 31, three minutes and
then the same task restarted thirty seconds later, is not: over the gap, and a
pause rather than a rename. 38, followed nineteen seconds later, ran 22 minutes
and is untouched by the rule. Nine boundary cases pass, including 15 seconds
against 16 and 4m59s against 5m00s.

The root cause, a task that cannot be renamed once started, is still there.
This measures around it rather than fixing it.

## Four small things for starting, time and memory

2026-09-23. Chosen from a list of ADHD-specific ideas that fit inside
`CLAUDE.md`. The rest went to `IDEJE.md`.

**The shortcut is visible during a session.** It was shown only while idle,
when there is nothing to capture, and hidden while a session runs, which is the
only time it is needed. Sixteen sessions, zero captures. A thought arrives
exactly when working memory is busy elsewhere, and a key combination that has
to be recalled at that moment is not there. It sits at the right of the task
line, the same place and style as the `tab` hint on session start, where the
task can ellipsize around it. On the timer line, the Windows label
(`Ctrl+Shift+Space`) beside a 12 hour end time would have overflowed 248px.

This one is also an experiment. If captures stay at zero with the shortcut in
view, the problem was not the tool, and no feature on the list fixes it.

**The end time sits beside the countdown.** "12 minutes" is abstract; "until
14:35" is a point in the day that can be planned around, which is the half of
time blindness a countdown does not help with. Locale decides 12 or 24 hour.
Muted, and it stays muted in the last minute; only the countdown takes the
accent.

**The task prompt asks for the first small step.** A whole task has no obvious
first action, and that is where starting stalls. The tension: the task label
stays on screen for the session and heads the resume panel, and "open the doc"
is stale by minute three in a way "quarterly report" is not. Accepted, because
starting was the stated problem and orientation already has the resume panel's
recent captures.

**Music settles at 0.7, not full volume.** One level for every track, no
control. 0.9 was the first reading of "about 10% quieter" and was rejected
before it shipped: 0.9 is under 1 dB, around the smallest change most people
hear, so it would have been indistinguishable from not changing anything. 0.7
is about 3 dB. The tray also gained *Open music folder*, which creates
`~/fokus/audio` and opens it; the folder is the entire music interface and was
named only in the README.

Layout checked in a browser with the real stylesheet: mac and Windows labels,
Serbian and English, 12 and 24 hour, a long task, the last minute. Nothing
overflows and the widget stays 80px.

## Read the numbers before writing the diff

2026-09-23. The 10 minute option was built on a report, "starting is hard",
before anyone looked at the database. The database showed the duration toggle
had never been moved in eleven sessions. The option turned out to get used, but
that was luck rather than evidence. Separately, `COUNT(*) = 0` on `captures`
read as "the capture loop has never been used" until `sqlite_sequence` showed 76
captures made and then wiped. Before building on a claim about usage, copy the
db and read it, autoincrement high-water marks included: an empty table and an
emptied one look identical from a count.

## A draft release is the only window where moving a tag is safe

2026-09-23. The warm start fix landed after v0.1.4 was tagged and pushed. The
release was still a draft, so the tag was moved to the fix and the build rerun,
rather than shipping a bug that was already fixed on master. The rule against
moving pushed tags exists because people have fetched them; a draft nobody can
download has no such people. Once published, a fix is the next version. Check
`gh release list` for `Draft` before choosing.

## Session 5: capture anywhere

2026-09-24. With no session running, the shortcut used to open session start.
So the capture habit, "shortcut, type, Enter", typed with no session, produced a
session named after the thought. It happened on 2026-09-23 at 18:48: `Reply to
email`, 36 seconds, confirmed afterwards as a thought. Seventeen sessions and
zero captures up to that point, and at least one of the zeros was this.

### The shortcut means capture first, everywhere

Idle, the shortcut now opens `noting`: the input is a thought, and Enter writes
it down. Tab is one ring, thought → 25 → 50 → 10 → thought, so starting a
session costs one Tab for the usual 25. Rejected: keeping session start as the
default with a modifier for thoughts (plain Enter would still do what happened
at 18:48), and a second global shortcut (a second key to remember is the cost
this app exists to remove). Starting a session is deliberate and rare; catching
a thought is the product and has to be the reflex.

`noting` is its own state rather than a mode flag on `starting`, so the union
still says what is on screen. The row names the mode by highlighting it,
`thought 10 25 50`, which replaced the `new session` label.

One trap found before it shipped: the focus effect selects the input's text on
every state change, which is right on arrival (a warm start's prefilled task is
replaced by the first keystroke) and wrong on Tab, where it would make the next
keystroke wipe the draft. A move within the ring keeps the caret.

### No number outside a session

A thought saved outside a session shows `written down` for a second. The return
counter means returns within a session, and there is nothing to return to. A
count per day was considered and refused: a new counter that resets daily is a
streak by another name.

Returns this week and last week do include session-less captures. Catching a
thought instead of following it is the same act either way, and it is the
number the experiment is watching.

### Migration 6 keeps the high-water mark

`session_id` lost NOT NULL, which SQLite cannot drop in place, so the table is
rebuilt. Checked before writing it: a plain rebuild resets the AUTOINCREMENT
mark to the largest surviving id (5 became 2 in the test, so id 3 would have
been reused), and that mark is the only record of the 76 captures that were
made and wiped. The migration carries it across. Run against a copy of the real
database and three constructed ones (rows with a deleted gap, empty but used,
never used) before being committed, then on the live database with a
`.backup` taken first: migrations 1 to 6 applied, `session_id` nullable, mark
still 76, 20 sessions, integrity ok.

### Verified, and not

The reducer was compiled with the project's own `tsc` and driven through 23
transitions: the full Tab ring and back with the draft intact, Enter and Escape
from both new states, the shortcut from every state, warm start, and capture in
a session still returning a number. `tsc`, `cargo check`, `cargo test` clean.

Not verified by Claude: the shortcut in the installed build, end to end. Access
to drive the app was declined, and saving a test thought would have put a row
into the database the experiment is counting. The first real thought is the
test.

## A successful deploy is not the same as a deploy of this commit

2026-09-25. After v0.1.7 was pushed, the landing page still read v0.1.6. The
latest Pages run was green, but it was the run for the previous commit; GitHub
had not started one for the new push at all. A check of "latest run succeeded"
passes in exactly this case. Check which commit the Pages build is for
(`gh api repos/<owner>/<repo>/pages/builds/latest`), and if it is behind, a
`POST` to the same endpoint rebuilds from master.

## "It worked" is a report; the row is the result

2026-09-24. The hand test of capture anywhere came back as "it worked", and
`sqlite_sequence` said no capture had been written. The test had ended in
Escape, which exercises the shortcut and the Tab ring and never the save. A
second "done" also left no row. The release waited a day for a real thought,
capture 77, read back with no session attached. Acceptance for anything that
writes is the written thing, checked, not a description of the screen.

## Session 6: backups and renaming

2026-09-25.

### Backups are automatic because the person who needs them will not press a button

Once a day on launch, and hourly after in case the app stays open, the webview
writes `~/fokus/backups/fokus-YYYY-MM-DD.db` with `VACUUM INTO` on its own
connection, then Rust prunes to the newest 14. A manual button was the
alternative and was turned down: a backup that depends on remembering to take
it fails exactly the person this app is built for.

`VACUUM INTO` was chosen over copying the file because the live database is in
WAL mode, and a file copy of `fokus.db` alone misses whatever is still in the
log. It was checked with a bound path before being relied on: it works, the
copy passes an integrity check and even carries the AUTOINCREMENT mark, and it
refuses to write over an existing file, which is a second guard against
clobbering an earlier backup.

Rust stays scaffolding. It creates the folder, answers "does this file exist",
and prunes. File names crossing the IPC boundary are checked against the two
shapes fokus writes, and the path is built on the Rust side, so a name cannot
reach outside the folder. Pruning only ever touches daily files.

Silent means a backup that keeps failing does not say so. That is the cost of
zero notifications, accepted knowingly; failures go to the log, and *Open
backups folder* in the tray is where a missing day would be seen.

### Clear history now costs nothing to undo

`clearWithBackup` writes `fokus-before-clear-YYYY-MM-DD-HHMM.db` first, and if
that cannot be written, nothing is cleared and the error shows where the user
just clicked. These copies are never pruned. One mistake caught while writing
it: the first version reused a same-minute copy on a second clear, on the
reasoning that nothing could have changed. Something captured between the two
clears would have been deleted with no copy. A second clear inside the same
minute is now refused.

Tested by running the real `backup.ts` against stand-ins for the database and
IPC that fail on command: copy fails, folder unavailable, same-minute copy
exists. In all three nothing was cleared. On the installed build, today's copy
appeared at launch without any interaction and read back clean: 23 sessions,
capture 77, migrations 1 to 6.

### Renaming is Tab from capture

During a session, Tab in the capture box switches to the task name, prefilled
and selected; Enter saves it, Escape cancels, Tab goes back. A half typed
thought is held in the `renaming` state and comes back with Tab, so fixing a
typo mid thought loses nothing. The capture row shows a `tab` hint, because a
key that does something new and says nothing about it is not a feature. Same
idea as idle: Tab changes what Enter does.

The restart detection in `classifyEnding` stays. It still reads sessions 35 and
42 correctly, and anyone on an older version will keep producing them.

## Print for your doctor did nothing, and three bugs stood behind it

2026-09-25. Reported by the user: the print button did nothing. Session 4's own
notes said the print dialog had "not been exercised by hand"; the layout had
been measured in a browser. It had been broken since it shipped.

**One: `window.print()` is a no-op on macOS.** WebKit hands a script's print
request to a UI delegate hook, and wry does not implement it, so the call is
dropped with no error. Tauri's doc comment says `window.print()` "works on all
platforms", which is how the button was written. Confirmed in the sources on
disk rather than from memory: wry's macOS `print()` builds a native
`NSPrintOperation`, and on Windows its `print()` is just `window.print()`
evaluated in the page. So `print_page` in Rust calls `WebviewWindow::print()`
on every platform, one path, and the main window now shows an error where the
button was pressed instead of failing silently.

The native path sets the printer margins to 0. The stylesheet's
`@page { margin: 14mm }` turned out to be honoured, but that was checked in the
printed PDF, not assumed.

**Two: the charts printed as nothing.** Every bar and legend chip is a
background colour, print engines drop backgrounds by default, and nothing set
`print-color-adjust`. The labels and percentages printed beside empty space.
Invisible in Session 4 because a browser's print preview can have background
graphics switched on. `print-color-adjust: exact` on the sheet.

**Three: "6 od 6" on an English page.** The printed score had `od` typed into
the JSX, beside an existing `outOfSix` string that the on-screen result already
used. The same class of bug as the ASRS answer buttons in `c08fbc5`.

**Four, caused by the fix for two.** With backgrounds printing exactly, the
headline figures went nearly invisible. Their screen colour is `--fg`, near
white for the dark theme, and the print stylesheet never overrode it. They had
printed pale grey only because WebKit darkens light text when it is dropping
backgrounds; `exact` switches that adjustment off. The legend chips had the
same bug in Session 4 and were fixed then; `.figure` was missed. Every colour
on the sheet is now set in the print rules.

### How it was verified

Each round was checked in a real PDF saved from the installed build's own print
dialog, rendered to an image and looked at: the dialog opening, one page,
14mm margins, the charts present, the score in English, the figures legible.
Four rounds, because each fix exposed the next problem. A first attempt to
measure margins by scanning for ink reported 0mm on every side; the render had
a transparent background that the script read as black. Looking at the page
settled it.

The lesson is the one from the "it worked" entry, applied to output: the
artifact is the test. A browser print preview of the same CSS would have passed
all four of these.
