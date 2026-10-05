# handoff

Read `CLAUDE.md` for the constraints. This file is only "where things were
left", and is overwritten each sync.

## Where we left off

The three-way review of the app is fully worked through. v0.1.10 shipped group 1
(Session 7: the capture loop no longer loses typed text; the warm start is an
offer behind Tab). v0.1.11 shipped groups 2 to 4: the printed page's numbers
(running session excluded, DST week, print refuses on a failed load, landing
page claim), four behaviour bugs, and cleanup (`report()` over `console.error`,
strings into i18n, Serbian `urađeno`, unused capabilities and package removed,
stale comments and docs corrected). Since v0.1.11, uncommitted or unreleased
depending on when this is read: the widget refuses to close, a resumed session
no longer auto-starts music, and README explains starting fokus at login by
hand (a decision, not code: registering a login item makes macOS notify).

Numbers, 2026-10-05: **29 sessions over 10 days, 3 captures**, all with no
session running, high-water 79, no duplicates.

## In flight

- **Hand tests, unchecked** (Session 7 in PLAN.md, plus double Enter from group
  3). The database shows none of the in-session ones done yet: no capture inside
  a session today. Test 1 and test 3 leave rows that can be checked.
- **The widget close guard and the resume-music change** are installed locally
  but not released. They ride the next tag.
- **README GIF, Reddit and LinkedIn posts,** waiting on the user's clip.
- **v0.1.0 stays a draft** on purpose.

## Blockers

- **The Serbian ASRS is a translation**, not the validated instrument.
- **Neither build is signed.** $99/year Apple Developer; a cost decision.
- **Nothing on Windows has been run since v0.1.2** except by CI compiling it.
  The resume-music change exists for Windows and is untested there.
- **A daily backup that keeps failing is silent** by design.

## Next session: start here

Read the numbers first (`?mode=ro`, `sqlite_sequence` and `COUNT(*)`): captures
since 2026-10-05, split by `session_id IS NULL`, and whether any landed inside a
session (the in-session path has not been used since the history wipe). Then ask
how the hand tests went. The review list is exhausted; anything new comes from
use, or from `IDEJE.md`.
