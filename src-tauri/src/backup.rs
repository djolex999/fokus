//! Backups of the database, written by the webview with `VACUUM INTO`.
//!
//! Rust is scaffolding here as everywhere: it owns the folder, decides where a
//! named file would go, and prunes. The copy itself is SQL on the webview's own
//! connection, so it is consistent with whatever that connection has written.
//!
//! Only two shapes of file name are accepted from the webview, and the path is
//! always built here. A name is data from the other side of the IPC boundary;
//! it must not be able to reach outside `~/fokus/backups`.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

/// Daily copies kept. Older ones are deleted; before-clear copies never are.
pub const KEEP_DAILY: usize = 14;

const PREFIX: &str = "fokus-";
const BEFORE_CLEAR: &str = "fokus-before-clear-";
const SUFFIX: &str = ".db";

pub fn dir(app: &AppHandle) -> Option<PathBuf> {
    Some(app.path().home_dir().ok()?.join("fokus").join("backups"))
}

fn digits(s: &str, n: usize) -> bool {
    s.len() == n && s.bytes().all(|b| b.is_ascii_digit())
}

/// `YYYY-MM-DD`, shape only. The webview supplies its local date.
fn is_date(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    matches!(parts.as_slice(), [y, m, d] if digits(y, 4) && digits(m, 2) && digits(d, 2))
}

/// `fokus-YYYY-MM-DD.db`
pub fn is_daily(name: &str) -> bool {
    name.strip_prefix(PREFIX)
        .and_then(|rest| rest.strip_suffix(SUFFIX))
        .is_some_and(is_date)
}

/// `fokus-before-clear-YYYY-MM-DD-HHMM.db`
pub fn is_before_clear(name: &str) -> bool {
    name.strip_prefix(BEFORE_CLEAR)
        .and_then(|rest| rest.strip_suffix(SUFFIX))
        .and_then(|stamp| stamp.rsplit_once('-'))
        .is_some_and(|(date, time)| is_date(date) && digits(time, 4))
}

/// Deletes all but the newest `keep` daily files in `dir`. Names sort by date,
/// so newest is last alphabetically. Anything that is not a daily file is left
/// alone, before-clear copies included. Returns how many were deleted.
pub fn prune(dir: &Path, keep: usize) -> std::io::Result<usize> {
    let mut daily: Vec<PathBuf> = std::fs::read_dir(dir)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(is_daily)
        })
        .collect();
    daily.sort();
    let excess = daily.len().saturating_sub(keep);
    for old in &daily[..excess] {
        std::fs::remove_file(old)?;
    }
    Ok(excess)
}

/// The full path for `file_name` in the backups folder, created if missing.
/// None when that file already exists: today's copy is done, or two attempts
/// raced. `VACUUM INTO` also refuses an existing file, so this is a check for
/// the ordinary case rather than the only guard.
#[tauri::command]
pub fn backup_target(app: AppHandle, file_name: String) -> Result<Option<String>, String> {
    if !is_daily(&file_name) && !is_before_clear(&file_name) {
        return Err(format!("not a backup file name: {file_name}"));
    }
    let dir = dir(&app).ok_or("no home directory")?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let path = dir.join(&file_name);
    if path.exists() {
        return Ok(None);
    }
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn prune_backups(app: AppHandle) -> Result<usize, String> {
    let dir = dir(&app).ok_or("no home directory")?;
    prune(&dir, KEEP_DAILY).map_err(|e| format!("{}: {e}", dir.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        assert!(is_daily("fokus-2026-09-25.db"));
        assert!(!is_daily("fokus-2026-9-25.db"));
        assert!(!is_daily("fokus-2026-09-25.db.tmp"));
        assert!(!is_daily("../fokus-2026-09-25.db"));
        assert!(!is_daily("fokus-before-clear-2026-09-25-1412.db"));
        assert!(is_before_clear("fokus-before-clear-2026-09-25-1412.db"));
        assert!(!is_before_clear("fokus-before-clear-2026-09-25-14.db"));
        assert!(!is_before_clear("fokus-before-clear-2026-09-25.db"));
        assert!(!is_before_clear("fokus-before-clear-../../x-1412.db"));
        assert!(!is_daily("fokus.db"));
    }

    #[test]
    fn prune_keeps_newest_and_ignores_the_rest() {
        let dir = std::env::temp_dir().join("fokus-backup-prune-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        for day in 1..=20 {
            std::fs::write(dir.join(format!("fokus-2026-09-{day:02}.db")), b"x").unwrap();
        }
        std::fs::write(dir.join("fokus-before-clear-2026-09-01-0900.db"), b"x").unwrap();
        std::fs::write(dir.join("notes.txt"), b"x").unwrap();

        assert_eq!(prune(&dir, 14).unwrap(), 6);

        let mut left: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        left.sort();
        assert_eq!(left.len(), 16);
        assert!(left.contains(&"fokus-2026-09-07.db".to_string()));
        assert!(left.contains(&"fokus-2026-09-20.db".to_string()));
        assert!(!left.contains(&"fokus-2026-09-06.db".to_string()));
        assert!(left.contains(&"fokus-before-clear-2026-09-01-0900.db".to_string()));
        assert!(left.contains(&"notes.txt".to_string()));

        assert_eq!(prune(&dir, 14).unwrap(), 0);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
