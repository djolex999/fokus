# handoff

Read `CLAUDE.md` for the constraints. This file is only "where things were
left", and is overwritten each sync.

## Where we left off

v0.1.10 is published and installed: Session 7, capture loop hardening. A
three-way review pass over the app (capture loop, data layer, constraints and
docs) found that the loop could lose typed text four ways; all four are fixed,
each first written as a failing node check (57 pass). The warm start is now an
*offer* behind the first Tab, so the shortcut means a thought first everywhere.
The focus-selection decision moved into `selectsOnFocus`, a pure function,
because every bug lived in untested effect glue.

Numbers, 2026-10-05: **29 sessions over 10 days, 3 captures**, all written with
no session running, high-water 79 (none deleted). The capture-anywhere path is
the one being used. Backups exist for each day the app ran since they began:
2026-09-25, 10-02, 10-05.

## In flight

- **Session 7 hand tests, unchecked in PLAN.md.** The user is testing as they
  go. Tests 1 and 3 can be confirmed against the database (the whole word in a
  resumed capture; a thought saved when the timer ran out).
- **Review findings, groups 2 to 4, not started.** Verified against the code:
  - *Wrong numbers on the printed page:* a running session counts in the stats;
    print goes ahead with stale or empty data if the load fails (`loadSheet`
    swallows); "returns last week" is off in the week after a DST change
    (fixed 7×24h); the landing page claims "fourteen days" but stats use all
    sessions.
  - *Behaviour:* music keeps playing after a failed session start; a failed
    triage write shows no error (cleared by `refresh`); double Enter can write
    twice; the clear button hides while session-less captures exist.
  - *Cleanup:* `console.error` used as error handling in five places; `/ 6`
    in Asrs.tsx and an English-only error in backup.ts outside i18n; Serbian
    `resolveDone` is still "uradi"; three unused capabilities and the unused
    `plugin-global-shortcut` package; around fifteen stale comments and doc
    lines (PLAN "four sessions", WINDOWS.md Enter starts a timer, migration 6's
    fresh-install comment, the stacked `printPage` comment).
  - *Plausible, unverified:* Cmd+W closing the widget; WebView2 autoplaying
    music at launch.
- **Start at login** was proposed (fokus does not launch after a restart, so
  the shortcut is dead until it is opened). Not decided.
- **README GIF, Reddit and LinkedIn posts,** all waiting on the user's clip.
- **v0.1.0 stays a draft** on purpose.

## Blockers

- **The Serbian ASRS is a translation**, not the validated instrument.
- **Neither build is signed.** $99/year Apple Developer; a cost decision.
- **A daily backup that keeps failing is silent** by design.

## Next session: start here

Read the numbers first (`?mode=ro`, `sqlite_sequence` as well as `COUNT(*)`):
captures since 2026-10-05, split by `session_id IS NULL`, and check the two
hand tests that leave rows. Then ask which group of review findings to take
next; group 2 is what a doctor would read.
