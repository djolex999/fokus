# handoff

Read `CLAUDE.md` for the constraints. This file is only "where things were
left", and is overwritten each sync.

## Where we left off

fokus ships on macOS and Windows. v0.1.3 is published and downloadable, the
landing page is live at djolex999.github.io/fokus, and CI compiles for both
platforms on every push. The Windows focus return was written blind on a Mac and
then run for the first time on a real machine: the capture loop worked on the
first attempt.

Nothing in the last stretch was a feature. It was bugs found by using the thing,
and the landing page being rewritten three times to stop selling the ADHD
screener as a headline.

A session is running right now: `LOOM VIDEO`, unfinished.

## In flight

- **A Reddit post for r/ADHD_Programmers.** Copy is written and ready in the
  conversation, opening with the personal version that does not state a
  diagnosis. Needs a screenshot of the capture state, not the start state.
- **A Show HN was submitted and flagged within a minute.** New account plus a
  text-only Show HN, which breaks the rule that a Show HN must link to something
  people can try. Remedy is an email to hn@ycombinator.com, or wait and resubmit
  properly with the URL in the url field and the description as the first
  comment. Do not rapidly resubmit.
- **Five of six features have still never run with real data.** The review list,
  the return counter, the resume panel, the statistics screen and the printed
  page. Statistics needs ten sessions and there are six.

## Blockers

- **Still zero captures.** Six sessions across two days, none of which captured
  a single thought. The capture loop is the product and it has never been used
  for its purpose.
- **The Serbian ASRS is a translation**, not the validated instrument. English
  now uses the official WHO wording, so this only affects a Serbian reader.
- **Neither build is signed.** Gatekeeper on macOS, SmartScreen on Windows.
- **The database is not backed up anywhere** except two by-hand snapshots
  sitting in the same folder as the original.

## Next session: start here

Ask how the use went, then **read the numbers out of the database rather than
relying on memory**: sessions, captures, when they broke off, time of day. The
user reports how it felt; the database reports what happened.

Expect the next bugs to be in the five features that have never run. Roughly
eight bugs surfaced in two days of use and not one of them would have failed a
build. The capture loop has had that treatment; nothing else has.
