# NOTES

Running notes per session. Measurements, platform quirks, and decisions that
are not obvious from the code.

## Session 1 — the loop

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

## Session 2 — sessions

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
