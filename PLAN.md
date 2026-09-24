# fokus — development plan

Four sessions. Each ends with a runnable app. Ordering is deliberate: the capture loop is proven before anything decorates it, and the app is daily-usable after Session 2 even if the rest is never built.

Read `CLAUDE.md` before every session. Constraints there override anything below.

---

## Session 1 — the loop

**Goal:** the capture round-trip works end to end and is measurably under 3 seconds. Nothing else matters this session.

### Scope

1. Scaffold: `pnpm create tauri-app` → Vite + React + TS. Two windows declared in `tauri.conf.json` (`widget`, `main`).
2. Widget window: frameless, always-on-top, 280×80, `skipTaskbar: true`, not resizable, positioned top-right of the primary monitor on first launch, position persisted.
3. Main window: `visible: false` at launch. Nothing in it yet beyond a placeholder heading.
4. SQLite plugin wired, three migrations from `CLAUDE.md` applied at startup. Verify the db file lands in the app data dir.
5. Global shortcut `Ctrl+Shift+Space` (`Cmd+Shift+Space` on macOS) registered via `tauri-plugin-global-shortcut`.
6. Capture loop:
   - Shortcut pressed → widget capture input focused, `CaptureState` → `capturing`.
   - Enter → insert into `captures` (hardcode `session_id = 1`, seed one row into `sessions` for now) → `CaptureState` → `idle` → **focus returned to the previously focused application**.
   - Escape → discard draft, return focus the same way.
7. Focus return is the hard part. On Windows this means recording the foreground `HWND` before stealing focus and restoring it after; on macOS, the previously active `NSRunningApplication`. Implement for the dev platform first, stub the other with a clear `todo!()` and a comment.

### Non-goals

Timer, session lifecycle, styling beyond legibility, main window content, audio, statistics.

### Acceptance

- [ ] Shortcut works while a different app is focused (test from a code editor, not from the widget).
- [ ] After Enter, typing goes back into the editor without a manual click.
- [ ] Row visible in SQLite via CLI.
- [ ] Measured round-trip under 3 seconds, done ten times in a row. Note the median in `NOTES.md`.
- [ ] `pnpm tsc --noEmit` and `cargo check` clean.

### Known traps

- `alwaysOnTop` plus focus stealing fights the OS. The widget should take keyboard focus only while `capturing`.
- Do not use `setTimeout` to "wait for focus". Await the Tauri command that restores it.
- The db path differs between dev and bundled builds. Log it once at startup during development.

---

## Session 2 — sessions

**Goal:** the app is usable for a full working day.

### Scope

1. Session lifecycle: start (task text + ~~25/50~~ 10/25/50 min), countdown, complete, abandon. Writes `sessions` correctly including `outcome`. **10 added 2026-09-16.** Starting was the hard part, not finishing, and a shorter unit is the only part of the breadcrumb method that survives the no-gamification constraint.
2. Countdown is derived from `started_at` and wall clock, not from an accumulating interval, so it survives sleep and throttled timers. Tick once per second only to re-render.
3. `last_active_at` updated on any widget interaction.
4. Captures now link to the real active session.
5. Widget states rendered: idle-with-task, running, capturing.
6. Main window: capture review list. Each row → `uradi` / `zakaži` / `obriši`, writing `resolved`. Header shows the pending count. Empty state reads as done, not as praise.
7. ~~App exits cleanly with an in-flight session: mark it `abandoned` with `ended_at = now` on shutdown.~~ **Revised 2026-09-10 after use.** Abandoning on restart threw away sessions that were not over: quit at minute six of twenty five, reopen, session gone. Time ends a session, not the process timing it. A session whose planned window has not elapsed is now resumed at startup; only expired ones are closed, with `ended_at = COALESCE(last_active_at, started_at)`.

### Non-goals

Audio, resume panel, return counter, ASRS, statistics.

### Acceptance

- [ ] Full session start → interrupt three times → complete, all rows correct in SQLite.
- [ ] Abandon at 11 minutes writes `outcome = 'abandoned'`, no failure language anywhere in the UI.
- [ ] Machine sleeps mid-session; countdown is correct on wake.
- [ ] Review list empties to zero and stays empty across a restart.
- [ ] ~~Used for one real working day before moving on.~~ **Passed without being met, 2026-09-10.** Session 3 was started after roughly twenty test captures rather than a day of real use. Recorded because the gate existed to catch exactly this, and skipping it silently would make the record useless. The gate still stands for Gate 1 in the concept note.

---

## Session 3 — retention

**Goal:** the app gets opened on the second day. Four mechanics, each aimed at a distinct failure point: start, mid-session, return, and end.

### Scope

1. **Local audio.** Read `~/fokus/audio` via a Rust command, take the first file alphabetically, play it looped through a webview `<audio>` element on session start, fade out on end. Missing folder or empty folder is silent and non-fatal. No controls of any kind in the UI; a single `♪` glyph at 50% opacity indicates it is playing.
2. **Resume panel.** If `now - last_active_at > 5 min`, on next widget interaction render `CaptureState.resumed`: the task plus the last three capture texts. Widget grows downward. Clears on the next keystroke.
3. **Warm start.** On launch, query the most recent `abandoned` session ~~;~~ **ended within the last two hours**; prefill its task in the widget with the duration preselected. Enter starts immediately. Escape or typing replaces it. If none exists, plain empty input. **Window added 2026-09-16 after use.** As specified it had no time bound, so it offered a task from five days earlier on every launch, indefinitely, until something else was abandoned.
4. ~~**Return counter.**~~ Pulled forward into Session 1 on 2026-09-10: the absence of any acknowledgement was noticed within a minute of first use. Implemented as specified, `{n}. povratak` from `COUNT(captures)`, one second, no animation, no movement, no sound. Reconnect `n` to the real session id when Session 2 lands.
5. **Last minute.** At 60 seconds remaining, progress bar height 2px → 5px and timer text takes the accent color. No other change, no alert.

### Non-goals

ASRS, statistics, packaging.

### Acceptance

- [ ] Audio starts with the session and stops at the end; app runs identically with the folder absent.
- [ ] Resume panel appears after a real five-minute absence and the widget does not jump position.
- [ ] Cold start to running session in one keypress when a prior abandoned task exists.
- [ ] Return counter appears and disappears without drawing the eye. Judge this while actually working, not while staring at it.
- [ ] No new dependencies added beyond what audio required (which should be zero).

---

## Session 4 — the evidence

**Goal:** two weeks of use becomes one page that can be handed to a psychiatrist.

### Scope

1. **ASRS v1.1** in the main window: 18 questions, 0-4 scale (Nikada / Retko / Ponekad / Često / Vrlo često). Part A (items 1-6) scored per the WHO shading rubric; store `answers_json` and `part_a_score`.
2. **Result screen.** Score, then this framing, non-negotiable in substance: the screener does not and cannot produce a diagnosis; take the result to a psychiatrist. No interpretation beyond that sentence. Retakeable, all results timestamped.
3. **Statistics** (requires ≥10 sessions, otherwise show how many more are needed):
   - Completion rate by planned duration (~~25 vs 50~~ per duration offered). **Revised 2026-09-23 after use.** "Completed" is derived, not read off `outcome`: a session ended by hand after 90% of its planned time counts as completed, and one ended inside its first minute, or inside five minutes and replaced by a new session within fifteen seconds (a rename, since a running task cannot be edited), is a false start and is not counted at all. Read straight from `outcome`, session 39 (ended by hand at 24 of 25 minutes) and session 35 (nine seconds, then restarted under a better name) were both reported as abandoned, on the page meant for a doctor.
   - Median minutes to abandonment
   - Captures per session
   - Time-of-day bars: started vs abandoned
   - One line: returns this week vs last week
   - Bars are divs. No chart library.
4. **"Pripremi za pregled"**: a print stylesheet producing a single page with the ASRS result, the statistics, and the date range covered. Browser print to PDF is sufficient; do not add a PDF library.
5. ~~**Packaging:**~~ Pulled forward to the end of Session 2 on 2026-09-10, because the working day gate in Session 2 cannot be run against `pnpm tauri dev`: a file save reloads the app and abandons the live session. Build an installer, install it, and use the installed build.

### Acceptance

- [x] Part A scoring verified by hand against the WHO rubric on two constructed answer sets.
- [x] No screen anywhere states or implies a diagnosis. Reread every string with this specifically in mind.
- [x] Print output fits one page and is legible in grayscale. Measured: 190.4mm of 269mm.
- [x] Installed build runs without a dev server and the db persists across restarts.

---

## Session 5 — capture anywhere

Added 2026-09-24, after v1. Not part of the original four.

**Goal:** a thought can be written down whether or not a session is running, and the habit "shortcut, type, Enter" never does anything but write it down.

**Evidence.** Seventeen sessions, zero captures. On 2026-09-23 at 18:48, with no session running, a thought was typed into the shortcut and Enter started a 36 second session called `Reply to email`. Idle, the shortcut opened session start, so the capture habit produced a session. It was confirmed afterwards that it was meant as a thought.

### Scope

1. **Migration 6: `captures.session_id` becomes nullable.** SQLite cannot drop `NOT NULL` in place, so the table is rebuilt: create `captures_new` without the constraint, copy every row with its id, drop, rename. The `sqlite_sequence` high-water mark is carried across rather than reset, because it is the only record of captures that were made and later cleared.
2. **Widget state `noting`.** The shortcut from `idle` or `finished` opens it. Placeholder `write it down`; the row reads `thought 10 25 50 tab` with *thought* active.
3. **Tab is one ring:** thought → 25 → 50 → 10 → thought, draft kept across every step. Landing on a duration is `starting`, unchanged, placeholder `first small step`. Enter on a duration starts a session as today.
4. **Widget state `noted`.** Enter in `noting` inserts the capture with `session_id` NULL, shows `written down` (`zapisano`) for one second, returns focus, then goes idle. No number: the return counter means returns within a session, and a count with no session would be a new counter.
5. **Escape** in `noting` discards the draft and returns focus. Empty Enter behaves the same.
6. **Readers.** Review list `LEFT JOIN`s sessions and shows only the time when there is no session. Return counter and resume panel unchanged (session scoped). Captures per session counts only session captures. Returns this week and last week include session-less captures: catching a thought instead of following it is the same act either way.
7. **Warm start** still opens `starting` with the task prefilled. It offers a session, which is a different thing from the shortcut.

### Non-goals

A second shortcut. Any count or reward for session-less captures. Renaming a running session. Changing anything about capture during a session.

### Acceptance

- [ ] Migration run against a copy of the real database and against a constructed one with rows and a gap in the ids: rows and ids preserved, NULL accepted, high-water mark kept.
- [ ] Every reducer transition exercised: Tab round the full ring and back to thought with the draft intact; Enter and Escape from `noting` and `starting`; shortcut from `idle`, `finished`, `running`; warm start.
- [ ] Installed build: shortcut with no session, type, Enter. Row in SQLite with `session_id` NULL, focus back in the previous app without a click, `written down` shown for a second.
- [ ] Round trip still under 3 seconds.
- [ ] A capture during a session still shows `return N`.
- [ ] `pnpm tsc --noEmit`, `cargo check`, `cargo test` clean. CI green on both platforms.

---

## Definition of done for v1

Capture round-trip under three seconds, and the app used for one full working day without the main window being opened mid-session.

After that: two weeks of daily use, then Gate 1 from the concept note (10+ of 14 days, 30+ captures, and an honest yes to whether losing it would annoy you). Nothing about productization gets decided before then.

## Mid-build discipline

Ideas that surface during a session go into `IDEJE.md`, one line each, and are not implemented. Reviewed after two weeks of use, when there is data instead of enthusiasm. Roughly half will not survive that wait.
