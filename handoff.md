# handoff

Read `CLAUDE.md` for the constraints. This file is only "where things were
left", and is overwritten each sync.

## Where we left off

fokus ships on macOS and Windows. v0.1.3 is published and downloadable, the
landing page is live at djolex999.github.io/fokus, and CI compiles for both
platforms on every push. The Windows focus return was written blind on a Mac and
then run for the first time on a real machine: the capture loop worked on the
first attempt.

**2026-09-16: a third session length, 10 minutes.** The toggle is a three way
cycle now. It came out of the "breadcrumb method", of which the shorter unit is
the only part that survives the no-gamification constraint; the ticked boxes are
a score you can be behind on and were refused. `DURATIONS` is declared once and
the reducer, the widget and the narrowing all read from it, closing a near miss
where two hand-copied ternaries would have made a 10 minute session resume as a
25 minute one. Shipped as `cff811e`, CI green on both platforms.

## What the database says

Read 2026-09-16 from a copy of the live db, with a session running. Everything
below is counted, not remembered.

- **11 sessions**, ids 31 to 41. 5 completed, 5 abandoned, 1 running at time of
  reading.
- **0 captures.** But `sqlite_sequence` puts the `captures` high-water mark at
  **76**, so 76 were made and all of them are gone. The only path in the code
  that deletes a capture is the clear-history button on the Stats screen
  (`db.ts`, `clearAllSessions`); triage is an `UPDATE` that keeps the row. The
  wipe took sessions 1 to 30 with it. **This corrects the previous handoff**,
  which read the zero as "the capture loop has never been used". It has been,
  and then the history was cleared.
- **4 days used** out of the 7 since Sep 10: the 10th, 11th, 15th and 16th.
  Gate 1 wants 10 of 14.
- **The duration toggle has never been moved.** Eleven sessions out of eleven at
  25 minutes. Never once 50. This was not known when the 10 minute option was
  added earlier the same day, and it means the duration control is either not
  discoverable or not the axis that matters.
- Sessions cluster at night: three in the 13:00 to 14:00 range, five between
  02:56 and 05:12 on Sep 11, one at 00:45, one at 09:28.

### Two of the five abandons are mislabelled

Sessions 37, 38 and 39 ran 19, 22 and 24 minutes, ending 6, 3 and 1 minutes
short of the bell, with `ended_at` a few seconds after the last heartbeat. Those
were ended by hand near the finish, which is not abandonment in any sense a
person would recognise. Session 35 lasted 9 seconds and session 36 began 4
seconds later with the task renamed from `Finish that project` to `LOOM VIDEO`:
that row is a typo being fixed, recorded as a failed session.

The stats screen reports completion rate and median minutes to abandonment, and
it is the page meant to be printed for a psychiatrist. As it stands it would
report roughly half the sessions abandoned at a median near 22 minutes. An app
whose stated position is that abandoned is neutral data rather than a verdict is
currently producing data that is wrong in the direction of a verdict.

## In flight

- **A Reddit post for r/ADHD_Programmers.** Copy is written and ready in the
  conversation, opening with the personal version that does not state a
  diagnosis. Needs a screenshot of the capture state, not the start state.
- **A LinkedIn post.** Drafted 2026-09-15, unposted. Casual first person, no
  diagnosis claim, ends on the repo link.
- **A Show HN was submitted and flagged within a minute.** New account plus a
  text-only Show HN, which breaks the rule that a Show HN must link to something
  people can try. Remedy is an email to hn@ycombinator.com, or wait and resubmit
  properly with the URL in the url field and the description as the first
  comment. Do not rapidly resubmit.
- **The statistics screen is about to render for the first time.** It needs ten
  sessions and there are now eleven. The review list, return counter, resume
  panel and printed page have still never run against real data.

## Blockers

- **Zero captures across the current eleven sessions**, on four separate days.
  Either thoughts are not arriving during sessions, or the shortcut is not
  reaching the user when they do. Those have different fixes and the second is
  testable in about a minute. The capture loop is the product and this is the
  number that matters.
- **The abandoned/ended distinction above**, because it reaches the printed page.
- **The Serbian ASRS is a translation**, not the validated instrument. English
  now uses the official WHO wording, so this only affects a Serbian reader.
- **Neither build is signed.** Gatekeeper on macOS, SmartScreen on Windows.
- **The database is not backed up anywhere** except two by-hand snapshots
  sitting in the same folder as the original, both predating the clear. Nothing
  in the permitted feature space is more overdue than an export.

## Next session: start here

Do not ask how it went and build from the answer. **Read the numbers first**, the
way this entry was produced: copy the db rather than opening the live one, and
check `sqlite_sequence` as well as the row counts, because an empty table and a
table that was emptied look identical from a `COUNT(*)`.

The open question is the zero. Everything else on this page is downstream of it.
