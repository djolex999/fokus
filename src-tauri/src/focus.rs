//! Returning keyboard focus to whatever the user was working in before the
//! shortcut fired. This is the whole point of the capture loop: if focus does
//! not come back on its own, the round trip is a context switch, not a capture.

use std::sync::mpsc;
use std::time::Duration;

use tauri::AppHandle;

/// Whatever had focus before we took it.
///
/// A process id on macOS, where activation is per application, and a window
/// handle on Windows, where it is not: one process can own several top level
/// windows, and returning to the wrong one drops the user in the wrong
/// document. Opaque here so neither platform has to pretend to be the other.
pub type Target = isize;

/// Human readable name, for the log only.
pub fn app_name(target: Target) -> String {
    imp::app_name(target).unwrap_or_else(|| format!("handle {target}"))
}

/// True if the thing that had focus was us. Pressing the shortcut again while
/// the widget already holds focus would otherwise record fokus as the thing to
/// return to, and the round trip would end on the widget.
pub fn is_self(target: Target) -> bool {
    imp::is_self(target)
}

/// Name of whatever is frontmost right now. Used to check, after the fact, that
/// the handover actually took: `activateWithOptions` returning true only means
/// the request was accepted, not that focus moved.
pub fn frontmost_name() -> String {
    match imp::frontmost() {
        Some(target) => app_name(target),
        None => "nothing".to_string(),
    }
}

/// Recorded *before* we take focus, or the answer is always "fokus".
pub fn frontmost() -> Option<Target> {
    imp::frontmost()
}

/// Brings fokus itself forward.
///
/// `WebviewWindow::set_focus` is not enough on its own: tao still activates via
/// `activateIgnoringOtherApps:`, which macOS 14 turned into a no-op. Without
/// this the widget window becomes key inside our own app while the keystrokes
/// keep going to the editor. Queued, not awaited, so it costs nothing on the
/// way in.
pub fn activate_self(app: &AppHandle) {
    if let Err(e) = app.run_on_main_thread(imp::activate_self) {
        eprintln!("[fokus] could not activate fokus: {e}");
    }
}

/// Give focus back. Runs on the main thread: AppKit activation from a worker
/// thread is unreliable, and the hop costs well under a millisecond.
pub fn activate(app: &AppHandle, target: Target) -> Result<(), String> {
    let (tx, rx) = mpsc::channel::<bool>();
    app.run_on_main_thread(move || {
        let _ = tx.send(imp::activate(target));
    })
    .map_err(|e| format!("could not reach main thread: {e}"))?;

    match rx.recv_timeout(Duration::from_millis(2000)) {
        Ok(true) => Ok(()),
        Ok(false) => Err(format!("handle {target} refused activation")),
        Err(e) => Err(format!("focus return did not complete: {e}")),
    }
}

#[cfg(target_os = "macos")]
mod imp {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{
        NSApplication, NSApplicationActivationOptions, NSRunningApplication, NSWorkspace,
    };

    pub fn frontmost() -> Option<isize> {
        let app = NSWorkspace::sharedWorkspace().frontmostApplication()?;
        Some(app.processIdentifier() as isize)
    }

    pub fn is_self(target: isize) -> bool {
        target == std::process::id() as isize
    }

    pub fn app_name(target: isize) -> Option<String> {
        let app = NSRunningApplication::runningApplicationWithProcessIdentifier(target as i32)?;
        app.localizedName().map(|name| name.to_string())
    }

    /// Must run on the main thread.
    pub fn activate_self() {
        if let Some(mtm) = MainThreadMarker::new() {
            NSApplication::sharedApplication(mtm).activate();
        }
    }

    /// Must run on the main thread: NSApplication is main thread only.
    pub fn activate(target: isize) -> bool {
        let Some(target) =
            NSRunningApplication::runningApplicationWithProcessIdentifier(target as i32)
        else {
            // The app quit while the widget was open. Nothing to return to.
            return true;
        };

        // macOS 14 removed unilateral activation: an app can no longer shove
        // itself in front. The surviving path is cooperative, we yield first and
        // the target then activates. Without the yield the request is ignored.
        if let Some(mtm) = MainThreadMarker::new() {
            NSApplication::sharedApplication(mtm).yieldActivationToApplication(&target);
        }

        target.activateWithOptions(NSApplicationActivationOptions::empty())
    }
}

#[cfg(windows)]
mod imp {
    use windows::Win32::Foundation::{CloseHandle, HWND, MAX_PATH};
    // AttachThreadInput lives under System::Threading, not the keyboard module
    // its name suggests.
    use windows::Win32::System::Threading::{
        AttachThreadInput, GetCurrentProcessId, GetCurrentThreadId, OpenProcess,
        QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, IsWindow, SetForegroundWindow,
    };

    fn as_hwnd(target: isize) -> HWND {
        HWND(target as *mut core::ffi::c_void)
    }

    fn owning_thread_and_process(window: HWND) -> (u32, u32) {
        let mut process = 0u32;
        let thread = unsafe { GetWindowThreadProcessId(window, Some(&mut process)) };
        (thread, process)
    }

    /// The foreground *window*, not its process. Restoring a process would let
    /// the wrong one of its windows come back.
    pub fn frontmost() -> Option<isize> {
        let window = unsafe { GetForegroundWindow() };
        if window.0.is_null() {
            None
        } else {
            Some(window.0 as isize)
        }
    }

    pub fn is_self(target: isize) -> bool {
        let (_, process) = owning_thread_and_process(as_hwnd(target));
        process != 0 && process == unsafe { GetCurrentProcessId() }
    }

    /// Nothing to do. tao's `set_focus` already calls `SetForegroundWindow`, and
    /// Windows grants foreground rights to the process that received the last
    /// hotkey, which at this moment is us. The macOS counterpart exists only
    /// because macOS 14 removed the equivalent guarantee.
    pub fn activate_self() {}

    pub fn activate(target: isize) -> bool {
        let window = as_hwnd(target);
        if !unsafe { IsWindow(Some(window)) }.as_bool() {
            // Closed while the widget was open. There is nowhere to return to,
            // and that is not a failure.
            return true;
        }

        // SetForegroundWindow is refused unless the caller owns the foreground.
        // We do own it, having just taken it, but the permission is tracked per
        // input queue and the bare call is ignored often enough to matter.
        // Attaching to the target's input queue first makes it reliable.
        let ours = unsafe { GetCurrentThreadId() };
        let (theirs, _) = owning_thread_and_process(window);
        let attached = theirs != 0
            && theirs != ours
            && unsafe { AttachThreadInput(ours, theirs, true) }.as_bool();

        let restored = unsafe { SetForegroundWindow(window) }.as_bool();

        if attached {
            // Left attached, the two threads would share an input queue for the
            // rest of the session, and one hanging would hang the other.
            let _ = unsafe { AttachThreadInput(ours, theirs, false) };
        }
        restored
    }

    pub fn app_name(target: isize) -> Option<String> {
        let (_, process_id) = owning_thread_and_process(as_hwnd(target));
        if process_id == 0 {
            return None;
        }
        // The limited variant is enough for the image name and is granted for
        // processes this one may not otherwise open.
        let process =
            unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) }.ok()?;

        let mut buffer = [0u16; MAX_PATH as usize];
        let mut length = buffer.len() as u32;
        let queried = unsafe {
            QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_WIN32,
                windows::core::PWSTR(buffer.as_mut_ptr()),
                &mut length,
            )
        };
        unsafe {
            let _ = CloseHandle(process);
        }
        queried.ok()?;

        let path = String::from_utf16_lossy(&buffer[..length as usize]);
        Some(
            std::path::Path::new(&path)
                .file_stem()?
                .to_string_lossy()
                .into_owned(),
        )
    }
}
