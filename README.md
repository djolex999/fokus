# fokus

A local-first focus timer built around one mechanic: **capturing an intrusive thought faster than following it.**

You are working. A thought arrives — *reply to that email, check that invoice, book that appointment.* Following it costs you the session. fokus gives you somewhere to put it in under three seconds, and puts your cursor back where it was.

- Global shortcut → type → Enter → focus returns to the app you were in
- Measured median round trip: **1.1 s**, of which the app's own share is about **21 ms**. The rest is you typing
- No accounts, no sync, no network calls of any kind. SQLite on disk
- Zero notifications. An anti-distraction tool must never generate an interruption

## What it does

**Sessions.** A task and 25 or 50 minutes. The countdown is derived from the wall clock, so it survives sleep. Ending early is recorded as `abandoned` and is treated as data, never as failure — there is no red X anywhere in this app.

**Capture.** During a session the same shortcut opens a one-line input. Enter saves it and hands focus back. You see `return 3` for a second, then nothing.

**Review.** Everything you wrote down, triaged as *done*, *schedule* or *delete*.

**Come back.** Away for five minutes or more and the widget shows your task plus the last three things you captured, so you can pick up the thread without opening anything.

**Sound.** Drop audio files in `~/fokus/audio` and the first one plays, looped, for the duration of a session. There are no controls: a `♪` at half opacity tells you it is playing, and that is the entire interface.

**Evidence.** The WHO ASRS v1.1 screener, plus statistics over your sessions, printable as a single page to take to a doctor.

## This is not a medical app

fokus is **not a medical device** and has not been approved or reviewed by anyone. It reproduces the ASRS v1.1 screening questionnaire; the software around it is not clinically validated. A score here is something to discuss with a doctor, not a finding.

The Serbian rendering of the questionnaire is a translation, not the officially validated Serbian instrument, and the app says so where it matters. In English the official WHO wording is used.

## Install

**macOS** (Apple silicon and Intel): download the `.dmg` from [Releases](../../releases), open it, drag `fokus.app` to Applications.

**Windows**: download the `.msi` or `.exe` from [Releases](../../releases). The shortcut is `Ctrl+Shift+Space`.

The build is **not signed or notarised**, so the first launch needs: right-click the app → Open, or System Settings → Privacy & Security → Open Anyway.

## Build it yourself

```bash
pnpm install
pnpm tauri dev      # run it
pnpm tauri build    # produce an installer
```

Needs Node 20+, pnpm, and a Rust toolchain.

On Windows the Rust MSVC target needs a linker, so install **Visual Studio Build
Tools** with the *Desktop development with C++* workload first, or the build
stops at `linker link.exe not found`. VS Code is a different product and does not
provide it.

```bash
pnpm tsc --noEmit                        # typecheck
cargo test  --manifest-path src-tauri/Cargo.toml --lib
cargo check --manifest-path src-tauri/Cargo.toml
```

## Known limits

- **Windows works but is new.** The capture loop was verified by hand on 2026-09-10: the shortcut fires, the widget takes the keyboard, and focus returns to the app you were in. Everything outside the loop has had far less use there than on macOS. See `WINDOWS.md`
- **Unsigned builds** show a Gatekeeper warning, as above
- **A resumed session starts silent.** The webview only begins audio from a user gesture, and launching the app is not one it can see

## Why it is built this way

Most of the interesting decisions are refusals, and they are written down rather than implied.

`CLAUDE.md` holds the constraints: no notifications, no network, no streaks or points or badges, no task management, no settings beyond a shortcut remap. `PLAN.md` is the four-session build plan, including the places it turned out to be wrong and was overruled by use. `NOTES.md` is the running record of decisions, measurements, and bugs — including several where the fix that seemed obvious was checked and turned out to be a no-op.

If you read one file to judge the engineering, read `NOTES.md`.

## Language

Serbian and English, chosen by your system language. There is no switch, because a switch would be a setting.

## Licence

<!-- Replace the name in LICENSE with whatever you want on a copyright line. -->

MIT. See `LICENSE`.
