//! The capture shortcut, and the one setting fokus permits: changing it.
//!
//! Stored as the plugin's own string form in `shortcut.json` beside the widget
//! position, read at startup, rewritten on change. Written by hand for the same
//! reason as `window_pos`: a plugin for one string is not worth carrying.
//!
//! Rust owns this because it owns registration: whether a combination can be
//! taken is only known by trying, and if it cannot, the old one has to be put
//! back before anyone notices the shortcut was gone.

use std::fs;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

const FILE: &str = "shortcut.json";
/// Tells the widget to reprint the hint it shows while idle and in a session.
pub const CHANGED_EVENT: &str = "shortcut:changed";

#[derive(Serialize, Deserialize)]
struct Saved {
    accelerator: String,
}

/// The shortcut currently registered.
pub struct Current(pub Mutex<Shortcut>);

pub fn default_shortcut() -> Shortcut {
    #[cfg(target_os = "macos")]
    {
        Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space)
    }
}

fn path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join(FILE))
}

/// The saved shortcut, or the default when there is none or it no longer parses.
pub fn load(app: &AppHandle) -> Shortcut {
    path(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|text| serde_json::from_str::<Saved>(&text).ok())
        .and_then(|saved| Shortcut::from_str(&saved.accelerator).ok())
        .unwrap_or_else(default_shortcut)
}

fn save(app: &AppHandle, shortcut: Shortcut) -> Result<(), String> {
    let file = path(app).ok_or("no config directory")?;
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    let json = serde_json::to_string(&Saved { accelerator: shortcut.into_string() })
        .map_err(|e| e.to_string())?;
    fs::write(&file, json).map_err(|e| format!("{}: {e}", file.display()))
}

/// A combination with none of these would fire on ordinary typing.
fn has_command_modifier(shortcut: &Shortcut) -> bool {
    shortcut.mods.intersects(Modifiers::SUPER | Modifiers::CONTROL | Modifiers::ALT)
}

fn key_label(key: Code) -> String {
    let name = key.to_string();
    if let Some(letter) = name.strip_prefix("Key") {
        return letter.to_string();
    }
    if let Some(digit) = name.strip_prefix("Digit") {
        return digit.to_string();
    }
    name
}

/// How the shortcut is printed in the widget and the main window. On macOS in
/// the order the default has always been shown, ⌘⇧Space, so the README and the
/// landing page stay true; elsewhere in the usual Ctrl+Alt+Shift+Win order.
pub fn label(shortcut: &Shortcut) -> String {
    let mods = shortcut.mods;
    let key = key_label(shortcut.key);
    if cfg!(target_os = "macos") {
        let mut s = String::new();
        if mods.contains(Modifiers::CONTROL) {
            s.push('⌃');
        }
        if mods.contains(Modifiers::ALT) {
            s.push('⌥');
        }
        if mods.contains(Modifiers::SUPER) {
            s.push('⌘');
        }
        if mods.contains(Modifiers::SHIFT) {
            s.push('⇧');
        }
        s + &key
    } else {
        let mut parts: Vec<&str> = Vec::new();
        if mods.contains(Modifiers::CONTROL) {
            parts.push("Ctrl");
        }
        if mods.contains(Modifiers::ALT) {
            parts.push("Alt");
        }
        if mods.contains(Modifiers::SHIFT) {
            parts.push("Shift");
        }
        if mods.contains(Modifiers::SUPER) {
            parts.push("Win");
        }
        let mut s = parts.join("+");
        if !s.is_empty() {
            s.push('+');
        }
        s + &key
    }
}

#[tauri::command]
pub fn shortcut_label(app: AppHandle) -> Result<String, String> {
    let current = app.state::<Current>();
    let shortcut = *current.0.lock().map_err(|e| e.to_string())?;
    Ok(label(&shortcut))
}

/// Swaps the registered shortcut for `accelerator` and returns its label. If
/// the new one cannot be registered (another app or the system holds it), the
/// old one is registered again and the error says so: there is never a moment
/// afterwards with no shortcut at all.
#[tauri::command]
pub fn set_shortcut(app: AppHandle, accelerator: String) -> Result<String, String> {
    let next = Shortcut::from_str(&accelerator).map_err(|e| format!("not a shortcut: {e}"))?;
    if !has_command_modifier(&next) {
        return Err("needs Cmd, Ctrl or Alt".into());
    }
    let current = app.state::<Current>();
    let mut slot = current.0.lock().map_err(|e| e.to_string())?;
    let previous = *slot;
    if next == previous {
        return Ok(label(&next));
    }
    let shortcuts = app.global_shortcut();
    shortcuts.unregister(previous).map_err(|e| e.to_string())?;
    if let Err(e) = shortcuts.register(next) {
        if let Err(back) = shortcuts.register(previous) {
            eprintln!("[fokus] could not restore the previous shortcut: {back}");
        }
        return Err(format!("taken: {e}"));
    }
    *slot = next;
    drop(slot);
    // The new shortcut works now either way. A failed save only means it reverts
    // at the next launch, which is reported rather than undone.
    if let Err(e) = save(&app, next) {
        eprintln!("[fokus] shortcut changed but not saved: {e}");
    }
    let text = label(&next);
    if let Err(e) = app.emit(CHANGED_EVENT, &text) {
        eprintln!("[fokus] could not announce the new shortcut: {e}");
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_label_matches_the_docs() {
        let expected = if cfg!(target_os = "macos") { "⌘⇧Space" } else { "Ctrl+Shift+Space" };
        assert_eq!(label(&default_shortcut()), expected);
    }

    #[test]
    fn letters_and_digits_print_bare() {
        let s = Shortcut::new(Some(Modifiers::ALT | Modifiers::CONTROL), Code::KeyK);
        let d = Shortcut::new(Some(Modifiers::ALT), Code::Digit1);
        if cfg!(target_os = "macos") {
            assert_eq!(label(&s), "⌃⌥K");
            assert_eq!(label(&d), "⌥1");
        } else {
            assert_eq!(label(&s), "Ctrl+Alt+K");
            assert_eq!(label(&d), "Alt+1");
        }
    }

    #[test]
    fn the_stored_form_reads_back() {
        for s in [
            default_shortcut(),
            Shortcut::new(Some(Modifiers::ALT), Code::Space),
            Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SHIFT), Code::KeyJ),
        ] {
            let back = Shortcut::from_str(&s.into_string()).expect("round trip");
            assert_eq!(back.mods, s.mods);
            assert_eq!(back.key, s.key);
        }
    }

    #[test]
    fn a_bare_key_or_shift_alone_is_refused() {
        assert!(!has_command_modifier(&Shortcut::new(None, Code::Space)));
        assert!(!has_command_modifier(&Shortcut::new(Some(Modifiers::SHIFT), Code::KeyA)));
        assert!(has_command_modifier(&Shortcut::new(Some(Modifiers::ALT), Code::Space)));
    }
}
