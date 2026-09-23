# handoff

Read `CLAUDE.md` for the constraints. This file is only "where things were
left", and is overwritten each sync.

## Where we left off

Three releases in one stretch, v0.1.4 to v0.1.6, all published with notes and
installed on the Mac at 0.1.6. v0.1.4 added a 10 minute session length and
bounded the warm start to two hours (it had offered a five day old task on every
launch). v0.1.5 stopped the statistics reading `outcome` raw: `classifyEnding`
derives completed, stopped early, false start and open, so a session ended by
hand at 24 of 25 minutes is no longer a failure on the page meant for a doctor.
v0.1.6 keeps the capture shortcut visible during a session, shows the end time
beside the countdown, asks for the first small step, settles music at 0.7, and
adds *Open music folder* to the tray.

Numbers, read 2026-09-23 from a copy of the live db: **17 sessions over 6 days,
0 captures** (high-water mark still 76, from before the clear-history wipe).
Durations: 15 at 25 minutes, 2 at 10. The 10 minute option is being used; 50
never has been.

## In flight

- **The capture experiment.** v0.1.6 put the shortcut on screen during sessions
  because it was only ever shown while idle. If captures stay at zero with it in
  view, the tool was not the reason, and nothing in `IDEJE.md` fixes it.
- **A Reddit post for r/ADHD_Programmers.** Copy written, opening with the
  personal version that does not state a diagnosis. Needs a screenshot of the
  capture state, not the start state.
- **A LinkedIn post.** Drafted 2026-09-15, unposted. Casual, first person, ends
  on the repo link. Suggested attachment: a 5 to 8 second screen recording of one
  capture.
- **A Show HN was flagged** within a minute (new account, text-only). Email
  hn@ycombinator.com, or resubmit later with the URL in the url field and the
  description as the first comment. Do not rapidly resubmit.
- **v0.1.0 is a draft on GitHub, on purpose.** Notes added, left unpublished so
  its bug-laden build is not downloadable. Decided 2026-09-23.

## Blockers

- **Zero captures.** Still the number that matters. The capture loop is the
  product and it has not been used for its purpose since the history was wiped.
- **Capture only works inside a session.** Idle, the shortcut opens session
  start, so typing a thought and pressing Enter starts a session named after it.
  In `IDEJE.md`; needs a table rebuild migration and a decision about what the
  shortcut means when idle. Deliberately not built before the experiment above
  reports.
- **The Serbian ASRS is a translation**, not the validated instrument.
- **Neither build is signed.** Gatekeeper on macOS, SmartScreen on Windows.
- **No backup.** Two by-hand snapshots beside the original, both predating the
  wipe. In `IDEJE.md`.
- **Unverified by hand:** *Open music folder* on Windows (compiles in CI, never
  clicked), and whether 0.7 is the right volume by ear.

## Next session: start here

Read the numbers before anything else: copy the db, check `sqlite_sequence` as
well as `COUNT(*)`, and look at captures since 2026-09-23. Then ask how it went.
If captures moved, the next candidate is capture with no session. If they did
not, the conversation is about why, not about features.
