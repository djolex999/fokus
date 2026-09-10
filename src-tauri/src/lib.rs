mod db;
mod focus;
mod window_pos;

use std::sync::Mutex;
use std::time::Instant;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const WIDGET_LABEL: &str = "widget";
const CAPTURE_OPEN_EVENT: &str = "capture:open";

#[derive(Default)]
struct FokusState {
    /// Application that was frontmost when the shortcut fired.
    prev_app: Mutex<Option<i32>>,
    /// Start of the current round trip. Only used for measurement.
    t0: Mutex<Option<Instant>>,
}

fn log_since(t0: Instant, stage: &str) {
    eprintln!(
        "[fokus] t+{:>7.1}ms  {}",
        t0.elapsed().as_secs_f64() * 1000.0,
        stage
    );
}

/// Called from the global shortcut handler. Order is load bearing: the frontmost
/// application has to be recorded before anything of ours takes focus.
fn open_capture(app: &AppHandle) {
    let t0 = Instant::now();
    let prev = focus::frontmost_pid();

    let state = app.state::<FokusState>();
    if let Ok(mut slot) = state.t0.lock() {
        *slot = Some(t0);
    }
    if let Ok(mut slot) = state.prev_app.lock() {
        // Pressing the shortcut again while the widget already has focus would
        // otherwise record fokus as the app to return to, and the round trip
        // would end on the widget instead of the editor.
        let is_us = prev == Some(std::process::id() as i32);
        if !is_us {
            *slot = prev;
        }
    }

    let Some(widget) = app.get_webview_window(WIDGET_LABEL) else {
        eprintln!("[fokus] widget window is gone, cannot capture");
        return;
    };
    // Order matters: activate the app, then make the widget key. Both are
    // queued onto the main thread and run in the order they are queued.
    focus::activate_self(app);
    if let Err(e) = widget.set_focus() {
        eprintln!("[fokus] could not focus widget: {e}");
        return;
    }
    log_since(t0, "widget focused");

    if let Err(e) = app.emit_to(WIDGET_LABEL, CAPTURE_OPEN_EVENT, ()) {
        eprintln!("[fokus] could not notify widget: {e}");
    }
}

#[tauri::command]
fn mark(stage: String, state: State<'_, FokusState>) {
    let Ok(slot) = state.t0.lock() else { return };
    if let Some(t0) = *slot {
        log_since(t0, &stage);
    }
}

/// Ends the round trip: hands focus back and stops the clock.
#[tauri::command]
fn restore_focus(app: AppHandle, state: State<'_, FokusState>) -> Result<(), String> {
    let prev = state
        .prev_app
        .lock()
        .map_err(|e| format!("state poisoned: {e}"))?
        .take();

    let result = match prev {
        Some(pid) => {
            let outcome = focus::activate_pid(&app, pid);
            if cfg!(debug_assertions) && outcome.is_ok() {
                let target = focus::app_name(pid);
                // Verification only. The activation call reports that the request
                // was accepted, not that focus moved, so look again once macOS has
                // had a chance to act on it.
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(250));
                    let now = focus::frontmost_name();
                    let verdict = if now == target { "ok" } else { "NOT RESTORED" };
                    eprintln!("[fokus] returned to {target}, frontmost 250ms later: {now} ({verdict})");
                });
            }
            outcome
        }
        // Nothing was recorded, which means the widget was opened by clicking it
        // rather than by the shortcut. There is nowhere to return to.
        None => Ok(()),
    };

    if let Ok(mut slot) = state.t0.lock() {
        if let Some(t0) = *slot {
            log_since(t0, if result.is_ok() { "focus returned" } else { "focus return FAILED" });
        }
        *slot = None;
    }

    result
}

fn capture_shortcut() -> Shortcut {
    #[cfg(target_os = "macos")]
    {
        Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space)
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(db::DB_URL, db::migrations())
                .build(),
        )
        .manage(FokusState::default())
        .invoke_handler(tauri::generate_handler![mark, restore_focus])
        .setup(|app| {
            // No dock icon and no app switcher entry: the widget is furniture,
            // not an application the user is meant to switch into.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            match app.path().app_data_dir() {
                Ok(dir) => eprintln!("[fokus] db: {}", dir.join("fokus.db").display()),
                Err(e) => eprintln!("[fokus] could not resolve app data dir: {e}"),
            }

            let widget = app
                .get_webview_window(WIDGET_LABEL)
                .ok_or("widget window is not declared in tauri.conf.json")?;
            window_pos::restore_or_place(&widget)?;
            window_pos::watch(&widget);

            let shortcut = capture_shortcut();
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |handle, fired, event| {
                        if fired == &shortcut && event.state() == ShortcutState::Pressed {
                            open_capture(handle);
                        }
                    })
                    .build(),
            )?;
            app.global_shortcut().register(capture_shortcut())?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("fokus failed to start");
}
