//! Returning keyboard focus to whatever the user was working in before the
//! shortcut fired. This is the whole point of the capture loop: if focus does
//! not come back on its own, the round trip is a context switch, not a capture.

use std::sync::mpsc;
use std::time::Duration;

use tauri::AppHandle;

/// Human readable name of an application, for the dev log only.
pub fn app_name(pid: i32) -> String {
    imp::app_name(pid).unwrap_or_else(|| format!("pid {pid}"))
}

/// Name of whatever is frontmost right now. Used to check, after the fact, that
/// the handover actually took: `activateWithOptions` returning true only means
/// the request was accepted, not that focus moved.
pub fn frontmost_name() -> String {
    match imp::frontmost_pid() {
        Some(pid) => app_name(pid),
        None => "nothing".to_string(),
    }
}

/// pid of the frontmost application, recorded *before* we steal focus.
pub fn frontmost_pid() -> Option<i32> {
    imp::frontmost_pid()
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
pub fn activate_pid(app: &AppHandle, pid: i32) -> Result<(), String> {
    let (tx, rx) = mpsc::channel::<bool>();
    app.run_on_main_thread(move || {
        let _ = tx.send(imp::activate_pid(pid));
    })
    .map_err(|e| format!("could not reach main thread: {e}"))?;

    match rx.recv_timeout(Duration::from_millis(2000)) {
        Ok(true) => Ok(()),
        Ok(false) => Err(format!("application {pid} refused activation")),
        Err(e) => Err(format!("focus return did not complete: {e}")),
    }
}

#[cfg(target_os = "macos")]
mod imp {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{
        NSApplication, NSApplicationActivationOptions, NSRunningApplication, NSWorkspace,
    };

    pub fn frontmost_pid() -> Option<i32> {
        let app = NSWorkspace::sharedWorkspace().frontmostApplication()?;
        Some(app.processIdentifier())
    }

    pub fn app_name(pid: i32) -> Option<String> {
        let app = NSRunningApplication::runningApplicationWithProcessIdentifier(pid)?;
        app.localizedName().map(|name| name.to_string())
    }

    /// Must run on the main thread.
    pub fn activate_self() {
        if let Some(mtm) = MainThreadMarker::new() {
            NSApplication::sharedApplication(mtm).activate();
        }
    }

    /// Must run on the main thread: NSApplication is main thread only.
    pub fn activate_pid(pid: i32) -> bool {
        let Some(target) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid)
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

#[cfg(not(target_os = "macos"))]
mod imp {
    pub fn app_name(_pid: i32) -> Option<String> {
        todo!("windows: QueryFullProcessImageName on the recorded HWND's process")
    }

    pub fn activate_self() {
        // Windows: SetForegroundWindow on our own capture window, subject to the
        // same foreground lock rules as the return path below.
        todo!("windows: SetForegroundWindow on the widget")
    }

    pub fn frontmost_pid() -> Option<i32> {
        // Windows: record GetForegroundWindow() here, not a pid. A process can own
        // several top level windows and restoring the wrong one lands the user in
        // the wrong document. Store the HWND and thread it through instead of i32.
        todo!("windows: GetForegroundWindow")
    }

    pub fn activate_pid(_pid: i32) -> bool {
        // Windows: AttachThreadInput to the foreground thread, then
        // SetForegroundWindow(hwnd). The bare SetForegroundWindow call is refused
        // unless the calling process currently owns the foreground.
        todo!("windows: SetForegroundWindow on the recorded HWND")
    }
}
