# handoff

Read `CLAUDE.md` for the constraints. This file is only "where things were
left", and is overwritten each sync.

## Where we left off

fokus sat closed for 24 days (5 to 29 October): quit, not lost to a restart,
and the shortcut was dead throughout. That prompted a brainstorm, and every
buildable item from it is now on master: `npm run verify` (115 node checks, in
CI on both platforms), *Hide until tomorrow* in the tray, keyboard triage and
in-place editing in the review list, *copy scheduled*, the finished widget's
count and time past the end, a five minute break after a session, the idle
fade, and changing the shortcut (the one allowed setting, `shortcut.rs`).
v0.1.13 shipped the first two batches; the last batch (break, time past the
end, shortcut) is on master at `9605471`, not yet released.

Numbers, 2026-10-29: **29 sessions over 10 days, 3 captures**, unchanged since
5 October because the app was not running. fokus is running again and today's
backup was written at launch.

## In flight

- **Nothing new has been tested by hand.** Two batches of screen code shipped or
  merged on node checks and type checks alone: hiding, the review list keys,
  editing, copy (clipboard unconfirmed), the fade, the break, time past the
  end, the shortcut setting. The round-trip measurement is set up (fokus runs
  with stderr to the scratchpad `roundtrip.log`, an `escape pressed` mark exists
  so no rows are written) and has zero runs.
- **v0.1.14 untagged**: break, time past the end, shortcut setting.
- **fokus not yet in Login Items.** The user knows how; README has the steps
  (macOS 15+ calls it Login Items & Extensions).
- **README GIF, Reddit and LinkedIn posts** wait on a 6 to 8 second recording.
- **v0.1.0 stays a draft** on purpose.

## Blockers

- **The Serbian ASRS is a translation**, not the validated instrument.
- **Neither build is signed.** $99/year; Homebrew likely needs it too.
- **Nothing has run on a real Windows machine since v0.1.2.** CI compiles and
  runs the node checks there, nothing more.
- **A failing daily backup is silent** by design.

## Next session: start here

Read the numbers first (`?mode=ro`, `sqlite_sequence` and `COUNT(*)`), and check
`~/fokus/backups` has a file per day since 29 October: a missing day means fokus
was not running again. Then the hand tests before anything else, starting with
the round trip (10 times: shortcut, two letters, Escape) and the shortcut
setting, since both touch the capture loop. Only then v0.1.14.
