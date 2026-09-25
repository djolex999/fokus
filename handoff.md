# handoff

Read `CLAUDE.md` for the constraints. This file is only "where things were
left", and is overwritten each sync.

## Where we left off

v0.1.7 is published and installed: Session 5, capture anywhere. With no session
running the shortcut used to open session start, so a thought typed out of habit
became a session (`Reply to email`, 36 seconds, 2026-09-23). Now the shortcut
opens a thought first everywhere, Tab cycles thought → 25 → 50 → 10, and
migration 6 lets a capture exist without a session while keeping the id
high-water mark.

It has been used for real: capture 77, no session, 2026-09-25 02:41. The first
capture since the history was wiped. Numbers read the same day: **23 sessions
over 8 days, 1 capture.** Durations: 18 at 25 minutes, 5 at 10, 50 never.

## In flight

- **The capture experiment, now with both fixes in.** The shortcut is visible
  during sessions (v0.1.6) and works outside them (v0.1.7). One capture so far.
  Whether that becomes a habit is the open question everything else waits on.
- **README GIF.** Agreed, deferred. The user records 6 to 8 seconds of one
  capture with ⌘⇧5; Claude converts with the installed `ffmpeg` to about 640px,
  shows it, then adds `docs/capture.gif` and one README line. Landing page stays
  as is (decided 2026-09-23).
- **Reddit post** for r/ADHD_Programmers and a **LinkedIn post**, both drafted,
  both unposted, both want the same clip as the GIF.
- **Show HN was flagged** (new account, text-only). Email hn@ycombinator.com or
  resubmit later with the URL in the url field. Do not rapidly resubmit.
- **v0.1.0 stays a draft** on GitHub on purpose, so its bug-laden build is not
  downloadable.

## Blockers

- **The Serbian ASRS is a translation**, not the validated instrument.
- **Neither build is signed.** Gatekeeper on macOS, SmartScreen on Windows.
  Apple Developer account is $99/year; a cost decision, not code.
- **No backup feature.** Three by-hand `.backup` snapshots sit beside the live
  db, the newest `fokus.db.backup-20260924-131925`, taken before migration 6.
- **Unverified by hand:** *Open music folder* on Windows (compiles in CI, never
  clicked), and whether 0.7 is the right volume by ear.

## Next session: start here

Read the numbers before asking how it went: copy the db (or open it with
`?mode=ro`), check `sqlite_sequence` as well as `COUNT(*)`, and look at captures
since 2026-09-25, split by `session_id IS NULL`. If captures are growing, the
next candidates are in `IDEJE.md` (rename a running session, a count at session
end). If they are not, the conversation is about why, not features.
