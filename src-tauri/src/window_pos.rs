//! Widget position persistence, written by hand so the app does not take on
//! tauri-plugin-window-state for one pair of integers.
//!
//! Everything here is in **logical** coordinates on purpose. Tauri reports
//! monitor geometry in physical pixels, but `set_position` converts a
//! `PhysicalPosition` using the *window's* scale factor, not the target
//! monitor's. On a mixed DPI setup those differ, and a position computed
//! against a scale 2 display gets applied as if it were scale 1, which parks
//! the widget off the edge of the screen. macOS lays displays out in a single
//! point space, so doing the arithmetic in logical units avoids the conversion
//! entirely.

use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{LogicalPosition, Manager, Monitor, WebviewWindow, WindowEvent};

const FILE: &str = "widget-position.json";
const WIDGET_WIDTH: f64 = 280.0;
const MARGIN_RIGHT: f64 = 24.0;
/// Clears the menu bar on macOS, notch included.
const MARGIN_TOP: f64 = 48.0;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq)]
struct Saved {
    x: f64,
    y: f64,
}

/// A monitor's rectangle in logical units.
struct LogicalRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn logical_rect(monitor: &Monitor) -> LogicalRect {
    let scale = monitor.scale_factor();
    LogicalRect {
        x: f64::from(monitor.position().x) / scale,
        y: f64::from(monitor.position().y) / scale,
        width: f64::from(monitor.size().width) / scale,
        height: f64::from(monitor.size().height) / scale,
    }
}

fn file_path(window: &WebviewWindow) -> Result<PathBuf, String> {
    let dir = window
        .app_handle()
        .path()
        .app_config_dir()
        .map_err(|e| format!("no config dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("could not create {}: {e}", dir.display()))?;
    Ok(dir.join(FILE))
}

fn read(window: &WebviewWindow) -> Option<Saved> {
    let raw = fs::read_to_string(file_path(window).ok()?).ok()?;
    serde_json::from_str::<Saved>(&raw).ok()
}

fn write(window: &WebviewWindow, pos: Saved) {
    let Ok(path) = file_path(window) else { return };
    match serde_json::to_string(&pos) {
        Ok(json) => {
            if let Err(e) = fs::write(&path, json) {
                eprintln!("[fokus] could not save widget position: {e}");
            }
        }
        Err(e) => eprintln!("[fokus] could not serialize widget position: {e}"),
    }
}

/// True if the top left corner sits inside one of the connected monitors.
/// Guards against a saved position on a display that is no longer attached.
fn on_a_monitor(window: &WebviewWindow, pos: Saved) -> bool {
    let Ok(monitors) = window.available_monitors() else {
        return false;
    };
    monitors.iter().map(logical_rect).any(|r| {
        pos.x >= r.x && pos.y >= r.y && pos.x < r.x + r.width && pos.y < r.y + r.height
    })
}

fn top_right_of_primary(window: &WebviewWindow) -> Result<Saved, String> {
    let monitor = window
        .primary_monitor()
        .map_err(|e| format!("no monitor info: {e}"))?
        .ok_or_else(|| "no primary monitor".to_string())?;
    let rect = logical_rect(&monitor);
    Ok(Saved {
        x: rect.x + rect.width - WIDGET_WIDTH - MARGIN_RIGHT,
        y: rect.y + MARGIN_TOP,
    })
}

fn apply(window: &WebviewWindow, pos: Saved) -> Result<(), String> {
    window
        .set_position(LogicalPosition::new(pos.x, pos.y))
        .map_err(|e| format!("could not position widget: {e}"))
}

pub fn restore_or_place(window: &WebviewWindow) -> Result<(), String> {
    match read(window) {
        Some(pos) if on_a_monitor(window, pos) => apply(window, pos),
        _ => apply(window, top_right_of_primary(window)?),
    }
}

/// Dragging a frameless window emits Moved continuously, so writes are
/// coalesced by a flusher instead of hitting the disk per frame.
pub fn watch(window: &WebviewWindow) {
    let pending: Arc<Mutex<Option<Saved>>> = Arc::new(Mutex::new(None));

    let on_move = Arc::clone(&pending);
    let moved_window = window.clone();
    window.on_window_event(move |event| {
        if !matches!(event, WindowEvent::Moved(_)) {
            return;
        }
        // The event payload is physical against the window's current scale
        // factor, which changes as it crosses displays. Convert immediately so
        // only logical units are ever stored.
        let (Ok(pos), Ok(scale)) = (moved_window.outer_position(), moved_window.scale_factor())
        else {
            return;
        };
        if let Ok(mut slot) = on_move.lock() {
            *slot = Some(Saved {
                x: f64::from(pos.x) / scale,
                y: f64::from(pos.y) / scale,
            });
        }
    });

    let flusher_window = window.clone();
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(500));
        let next = match pending.lock() {
            Ok(mut slot) => slot.take(),
            Err(_) => None,
        };
        if let Some(pos) = next {
            write(&flusher_window, pos);
        }
    });
}
