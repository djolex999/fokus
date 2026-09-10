# Running fokus on Windows for the first time

**The capture loop works.** Verified by hand on 2026-09-10: Ctrl+Shift+Space
from Notepad, type, Enter, and typing resumes in Notepad without touching the
mouse. `AttachThreadInput` around `SetForegroundWindow` was the part in doubt and
it held.

Everything outside the loop has had far less use here than on macOS. This file
stays because the next person, or the next machine, will hit the same setup.

## Setup

1. **Visual Studio Build Tools**, with the *Desktop development with C++* workload.
   Rust's MSVC toolchain needs the linker, and `libsqlite3-sys` compiles bundled C.
   Without it the build reaches `error: linker \`link.exe\` not found` after
   downloading every crate, which looks like a code failure and is not one.

   ```powershell
   winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
   ```

   Open a new terminal afterwards: the installer changes environment variables
   that an existing shell will not pick up.
2. **Rust**: <https://rustup.rs> (defaults to MSVC, which is what you want)
3. **Node 20+** and **pnpm**: `npm i -g pnpm`
4. **WebView2 runtime**: already present on Windows 11; on 10 install the
   Evergreen runtime from Microsoft.

```powershell
git clone https://github.com/djolex999/fokus
cd fokus
pnpm install
pnpm tauri dev
```

Diagnostics print to the terminal `pnpm tauri dev` is running in. Everything
prefixed `[fokus]` comes from the app.

## The one test that matters

The shortcut is **Ctrl+Shift+Space** here, not Cmd.

1. Open Notepad, type something, leave the caret in it
2. Ctrl+Shift+Space → the widget should take the keyboard
3. Type a task, Enter → the timer starts
4. Ctrl+Shift+Space again → type a thought → Enter
5. **Without touching the mouse, keep typing.** Do the letters land back in
   Notepad?

Step 5 is the whole product. If focus does not come back, the round trip is a
context switch rather than a capture.

The terminal will show, per capture:

```
[fokus] t+   8.0ms  widget focused
[fokus] t+  15.0ms  input focused
[fokus] t+ 900.0ms  enter pressed
[fokus] t+ 905.0ms  row inserted
[fokus] t+ 906.0ms  focus returned
[fokus] returned to notepad, frontmost 250ms later: notepad (ok)
```

That last line is the answer. `NOT RESTORED` means the foreground lock refused
the handover, which is the known risk and the reason this needs a real machine.

## What else to look at, in order of how likely it is to be wrong

1. **The widget's shape.** It is `transparent` with `decorations: false`. Under
   WebView2 that may render as a square black box instead of a rounded panel, or
   with an unwanted border.
2. **Where it sits.** It should be top right of the primary monitor.
   `window_pos.rs` does DPI arithmetic written against a mixed DPI *macOS* setup;
   Windows per monitor DPI is a different problem and this is exactly where the
   first placement bug came from. Try dragging it to a second monitor with a
   different scaling factor, then restart.
3. **The tray.** The icon is a template image, which is a macOS concept: on
   Windows it may come out solid black on a dark taskbar and be invisible.
4. **Audio.** WebView2 is Chromium, so it decodes more than WKWebView. The
   extension filter in `lib.rs` is currently the intersection that macOS
   supports, which is conservative but not wrong.
5. **Always on top over fullscreen apps**, which Windows treats differently.

## Three things that cost an evening, none of them the code

- **pnpm.** Its build-script gate rejects `esbuild`, and the setting that allows
  it has moved twice between versions. The Tauri hooks call `npm` now, so pnpm is
  not in the path at all.
- **`link.exe` not found.** The Build Tools workload, arriving only after every
  crate has downloaded, and reading like a compile error.
- **Out of memory** compiling the `windows` crate. `$env:CARGO_BUILD_JOBS=1`
  serialises it and gets under the limit.
