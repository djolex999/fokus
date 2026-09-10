# handoff

Read `CLAUDE.md` for the constraints and `PLAN.md` for the build plan. This file
is only "where things were left", and is overwritten each sync.

## Where we left off

All four sessions in `PLAN.md` are built, installed at `/Applications/fokus.app`,
and running. The repository is public at github.com/djolex999/fokus with a
landing page live at djolex999.github.io/fokus. The last stretch of work was not
features: it was bugs found by using the thing, and every one of them was
invisible rather than loud.

The Windows focus return has been written and compiles for MSVC. It has never
executed. That distinction is the single most important fact in this file.

## In flight

- **Windows, untested.** `focus.rs` is implemented for both platforms. `WINDOWS.md`
  has the setup and the one test that decides it: after Enter, do the letters land
  back in Notepad. No `windows-latest` job in `release.yml` until it has.
- **Release v0.1.0 is a draft.** Two DMGs attached, macOS only. Deliberately not
  published: it should wait for a day of real use, and the tag predates the
  Windows work anyway, so a Windows build needs a new tag.
- **The working day gate has still not been met.** The database currently holds a
  handful of test sessions. Clearing them from statistika is step one of counting
  for real.
- **9GB of Rust build cache** in `src-tauri/target`. Gitignored, harmless,
  reclaimable with `cargo clean` at the cost of one rebuild.

## Blockers

- **The Serbian ASRS is a translation, not the validated instrument.** English now
  uses the official WHO wording, which removes the problem for English readers,
  but a Serbian score is still not strictly an ASRS score. Sourcing the official
  translation is the only real fix and it is a search, not a code change.
- **Unsigned builds.** Gatekeeper on macOS, SmartScreen on Windows. $99/year for
  Apple, $200-400/year for an OV certificate. Until then, downloads cost some
  fraction of visitors at the warning dialog.
- **The database is not backed up anywhere.** It is one SQLite file outside the
  repo. For a tool whose whole purpose is accumulating two weeks of evidence,
  that is the one failure that cannot be recovered from.

## Next session: start here

Ask how the day of use went, then **read the numbers out of the database rather
than relying on memory**: sessions started, finished, abandoned, when they broke
off, captures per session, time of day. The user reports how it felt; the
database reports what happened. Where those two disagree is the interesting part.

Then, and only then, consider what to change. Everything valuable in the last
stretch came from use, not from planning.
