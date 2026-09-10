mod db;
mod focus;
mod window_pos;

use std::sync::Mutex;
use std::time::Instant;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const WIDGET_LABEL: &str = "widget";
const MAIN_LABEL: &str = "main";
const CAPTURE_OPEN_EVENT: &str = "capture:open";
const ABANDON_EVENT: &str = "session:abandon";
const QUIT_EVENT: &str = "app:quit";
/// How long the widget gets to close out an in flight session before the app
/// exits anyway. A failed write must not strand the user in an app that will
/// not quit; the startup reconcile will catch whatever was missed.
const QUIT_GRACE_MS: u64 = 1500;

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

/// The only way the main window is ever shown. It never opens by itself.
fn open_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_LABEL) else {
        eprintln!("[fokus] main window is gone");
        return;
    };
    focus::activate_self(app);
    if let Err(e) = window.show() {
        eprintln!("[fokus] could not show main window: {e}");
        return;
    }
    if let Err(e) = window.set_focus() {
        eprintln!("[fokus] could not focus main window: {e}");
    }
}

fn build_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let open = MenuItem::with_id(app, "open", "zapisano", true, None::<&str>)?;
    let abandon = MenuItem::with_id(app, "abandon", "prekini sesiju", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "izađi", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &abandon, &quit])?;

    // A dedicated template image rather than the app icon: macOS tints template
    // images to match the menu bar, and the app icon is an opaque rounded
    // rectangle that would come out as a solid black block.
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;

    TrayIconBuilder::new()
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => open_main(app),
            "abandon" => {
                if let Err(e) = app.emit_to(WIDGET_LABEL, ABANDON_EVENT, ()) {
                    eprintln!("[fokus] could not send abandon: {e}");
                }
            }
            "quit" => {
                if let Err(e) = app.emit_to(WIDGET_LABEL, QUIT_EVENT, ()) {
                    eprintln!("[fokus] could not send quit: {e}");
                }
                let handle = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(QUIT_GRACE_MS));
                    handle.exit(0);
                });
            }
            other => eprintln!("[fokus] unhandled tray item: {other}"),
        })
        .build(app)?;
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
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
        .invoke_handler(tauri::generate_handler![mark, restore_focus, quit_app])
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

            build_tray(app.handle())?;

            // Closing the main window hides it instead of destroying it, so the
            // tray can bring it back. Nothing else may open it.
            if let Some(main) = app.get_webview_window(MAIN_LABEL) {
                let closing = main.clone();
                main.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Err(e) = closing.hide() {
                            eprintln!("[fokus] could not hide main window: {e}");
                        }
                    }
                });
            }

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
