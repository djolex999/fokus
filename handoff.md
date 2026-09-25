# handoff

Read `CLAUDE.md` for the constraints. This file is only "where things were
left", and is overwritten each sync.

## Where we left off

v0.1.9 is published and installed. Since the last sync: v0.1.8 shipped Session 6
(automatic daily backups to `~/fokus/backups`, a backup before every clear
history, and renaming a running session with Tab from capture), and v0.1.9
fixed *Print for your doctor*, which had done nothing on macOS since Session 4
and had three more bugs behind it (charts blank on paper, "6 od 6" on an English
page, headline figures white on white). All four were verified in real PDFs
from the installed build.

Numbers, 2026-09-25: **24 sessions over 8 days, 1 capture** (77, no session).
The first daily backup exists: `fokus-2026-09-25.db`.

## In flight

- **The capture experiment.** Both capture fixes are in (shortcut visible in a
  session since v0.1.6, capture with no session since v0.1.7). One capture so
  far. Everything feature-shaped waits on whether that becomes a habit.
- **PLAN.md checklists for Sessions 5 and 6 are unticked**, though every item
  has been verified. Offered, not yet answered.
- **README GIF.** Deferred until the user records 6 to 8 seconds of one capture
  (⌘⇧5); convert with the installed `ffmpeg` to about 640px, show it, then
  `docs/capture.gif` and one README line. Landing page stays as is.
- **Reddit and LinkedIn posts,** drafted, unposted, both want the same clip.
- **Show HN was flagged** (new account, text-only). Email hn@ycombinator.com or
  resubmit later with the URL in the url field.
- **v0.1.0 stays a draft** on purpose.

## Blockers

- **Pages skips the rebuild on a push that carries a tag.** v0.1.7, v0.1.8 and
  v0.1.9 all needed a manual `POST .../pages/builds`; plain pushes rebuild
  fine. Suspected fix: push the commit, then the tag, separately. Untested.
- **The Serbian ASRS is a translation**, not the validated instrument.
- **Neither build is signed.** $99/year Apple Developer; a cost decision.
- **A daily backup that keeps failing is silent** by design (zero
  notifications). Only visible by opening the backups folder.

## Next session: start here

Read the numbers first: open the db with `?mode=ro`, check `sqlite_sequence`
as well as `COUNT(*)`, and look at captures since 2026-09-25 split by
`session_id IS NULL`. Check `~/fokus/backups` has one file per day used. Then
ask how it went. If captures are growing, the candidates are in `IDEJE.md`; if
not, the conversation is about why, not features.
