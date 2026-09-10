mod db;
mod focus;
mod window_pos;

use std::sync::Mutex;
use std::time::Instant;

use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const WIDGET_LABEL: &str = "widget";
const MAIN_LABEL: &str = "main";
const CAPTURE_OPEN_EVENT: &str = "capture:open";
const ABANDON_EVENT: &str = "session:abandon";
const QUIT_EVENT: &str = "app:quit";
const MUSIC_EVENT: &str = "audio:enabled";
/// How long the widget gets to close out an in flight session before the app
/// exits anyway. A failed write must not strand the user in an app that will
/// not quit; the startup reconcile will catch whatever was missed.
const QUIT_GRACE_MS: u64 = 1500;
const WIDGET_WIDTH: f64 = 280.0;
/// Extensions the audio folder scan will consider. The plan says "the first
/// file alphabetically", but taking that literally means a stray .DS_Store or a
/// readme wins and the session runs silently with no way to tell why.
///
/// Restricted to what the webview can actually decode. This list previously
/// included ogg and opus, which WKWebView cannot play: picking one would hand
/// the audio element a file it silently refuses, producing exactly the
/// unexplained silence the filter exists to prevent.
const AUDIO_EXTENSIONS: [&str; 6] = ["mp3", "m4a", "aac", "wav", "aiff", "flac"];

/// The tray's music item, kept so its tick can be corrected when a new session
/// turns the music back on.
struct TrayItems {
    music: CheckMenuItem<tauri::Wry>,
}

#[derive(Default)]
struct FokusState {
    /// Application that was frontmost when the shortcut fired.
    prev_app: Mutex<Option<i32>>,
    /// Start of the current round trip. Only used for measurement.
    t0: Mutex<Option<Instant>>,
    /// Whether the *current* session is allowed sound. Deliberately not
    /// persisted: a stored preference would be a setting, and more to the point
    /// music that always starts with the session is a cue that work has begun,
    /// which is worth more than saving one menu click on the rare day you need
    /// silence.
    music: Mutex<bool>,
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
    // Sentence case here, unlike the rest of the app. The menu bar belongs to
    // macOS, not to fokus, and lowercase items sitting beside every other
    // capitalised menu on the system read as a defect rather than a style.
    let open = MenuItem::with_id(app, "open", "Zapisano", true, None::<&str>)?;
    let abandon = MenuItem::with_id(app, "abandon", "Prekini sesiju", true, None::<&str>)?;
    // Here rather than in the widget for the same reason abandoning is: rare,
    // deliberate, and it must cost nothing on the path you take every time.
    let music = CheckMenuItem::with_id(app, "music", "Muzika", true, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Izađi", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &abandon, &music, &quit])?;
    app.manage(TrayItems { music });

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
            "music" => {
                let state = app.state::<FokusState>();
                let enabled = match state.music.lock() {
                    Ok(mut flag) => {
                        *flag = !*flag;
                        *flag
                    }
                    Err(e) => {
                        eprintln!("[fokus] music state poisoned: {e}");
                        return;
                    }
                };
                if let Err(e) = app.emit_to(WIDGET_LABEL, MUSIC_EVENT, enabled) {
                    eprintln!("[fokus] could not send music state: {e}");
                }
            }
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

/// First audio file in ~/fokus/audio, alphabetically. A missing folder, an empty
/// one, or one holding nothing playable all return None: silence is a valid
/// outcome here, never an error.
#[tauri::command]
fn audio_track(app: AppHandle) -> Option<String> {
    let dir = app.path().home_dir().ok()?.join("fokus").join("audio");
    first_playable(&dir).map(|path| path.to_string_lossy().into_owned())
}

/// Split out from the command so it can be tested without an app handle.
fn first_playable(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut playable: Vec<std::path::PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            if !path.is_file() {
                return false;
            }
            let Some(extension) = path.extension().and_then(|e| e.to_str()) else {
                return false;
            };
            AUDIO_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
        })
        .collect();

    playable.sort();
    playable.into_iter().next()
}

/// Grows the widget downward for the resume panel.
///
/// macOS anchors a window by its bottom left corner, so changing the height
/// alone pushes the top edge upward and the widget jumps out from under the
/// cursor. The top left is read first and put back afterwards. Both reads and
/// writes go through logical units, for the same reason `window_pos` does.
#[tauri::command]
fn set_widget_height(app: AppHandle, height: f64) -> Result<(), String> {
    let window = app
        .get_webview_window(WIDGET_LABEL)
        .ok_or_else(|| "widget window is gone".to_string())?;

    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let top_left = LogicalPosition::new(
        f64::from(position.x) / scale,
        f64::from(position.y) / scale,
    );

    window
        .set_size(LogicalSize::new(WIDGET_WIDTH, height))
        .map_err(|e| format!("could not resize widget: {e}"))?;
    window
        .set_position(top_left)
        .map_err(|e| format!("could not re-anchor widget: {e}"))
}

/// Called when a session starts. Sound comes back for every new session, so the
/// tick has to come back with it.
#[tauri::command]
fn reset_music(app: AppHandle, state: State<'_, FokusState>) -> Result<(), String> {
    *state.music.lock().map_err(|e| e.to_string())? = true;
    app.state::<TrayItems>()
        .music
        .set_checked(true)
        .map_err(|e| format!("could not update the music item: {e}"))
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// The webview's own console goes nowhere in a bundled build, which made every
/// audio failure invisible. This puts them on stderr, where running the binary
/// directly will show them.
#[tauri::command]
fn report(message: String) {
    eprintln!("[fokus] {message}");
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
        .invoke_handler(tauri::generate_handler![
            report,
            mark,
            restore_focus,
            quit_app,
            reset_music,
            audio_track,
            set_widget_height
        ])
        .setup(|app| {
            // A normal application, on purpose. The widget window carries
            // skipTaskbar, which on Windows hides that window while the process
            // stays an ordinary app; Accessory was an over-translation of that
            // to macOS, and it removed the running indicator with no way to get
            // it back. The cost is an app switcher slot for something driven by
            // a global shortcut and a tray.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);

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
        .build(tauri::generate_context!())
        .expect("fokus failed to start")
        .run(|_app, event| {
            // Clicking the dock icon must not open the main window. Constraint 3
            // says it opens only when the user opens it, and a dock click is a
            // request to see the app, not a request to see that window. The
            // widget is always on screen already, so there is nothing to do.
            if let tauri::RunEvent::Reopen { .. } = event {}
        });
}

#[cfg(test)]
mod tests {
    use super::first_playable;
    use std::fs;

    fn dir(name: &str, files: &[&str]) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("fokus-audio-{name}"));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        for file in files {
            fs::write(path.join(file), b"").unwrap();
        }
        path
    }

    fn picked(path: &std::path::Path) -> Option<String> {
        first_playable(path).map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
    }

    #[test]
    fn takes_the_first_playable_file_alphabetically() {
        let d = dir("order", &["c.mp3", "a.wav", "b.m4a"]);
        assert_eq!(picked(&d).as_deref(), Some("a.wav"));
    }

    #[test]
    fn skips_files_that_sort_first_but_cannot_be_played() {
        // Every decoy here sorts before the real track. Without the filter the
        // scan would hand the webview a dotfile and the session would run
        // silent with nothing to explain why.
        let d = dir("decoys", &[".DS_Store", "README.txt", "aaa.ogg", "aab.opus", "track.mp3"]);
        assert_eq!(picked(&d).as_deref(), Some("track.mp3"));
    }

    #[test]
    fn extension_matching_ignores_case() {
        let d = dir("case", &["Track.MP3"]);
        assert_eq!(picked(&d).as_deref(), Some("Track.MP3"));
    }

    #[test]
    fn silence_is_a_valid_outcome() {
        assert_eq!(picked(&dir("empty", &[])), None);
        assert_eq!(picked(&dir("nothing-playable", &["notes.txt"])), None);
        assert_eq!(
            first_playable(&std::env::temp_dir().join("fokus-audio-does-not-exist")),
            None
        );
    }

    #[test]
    fn directories_are_not_tracks() {
        let d = dir("subdir", &["track.mp3"]);
        fs::create_dir_all(d.join("aaa.mp3")).unwrap();
        assert_eq!(picked(&d).as_deref(), Some("track.mp3"));
    }
}
