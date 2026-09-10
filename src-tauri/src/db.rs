use tauri_plugin_sql::{Migration, MigrationKind};

/// Resolved by the sql plugin against the app data dir.
pub const DB_URL: &str = "sqlite:fokus.db";

/// Additive only. Never rewrite an existing migration, add a new one.
pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create sessions",
            sql: "CREATE TABLE sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task TEXT NOT NULL,
                    planned_min INTEGER NOT NULL,
                    started_at TEXT NOT NULL,
                    ended_at TEXT,
                    last_active_at TEXT,
                    outcome TEXT CHECK (outcome IN ('completed','abandoned'))
                  );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create captures",
            sql: "CREATE TABLE captures (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL REFERENCES sessions(id),
                    text TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    resolved TEXT CHECK (resolved IN ('done','scheduled','deleted'))
                  );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create asrs",
            sql: "CREATE TABLE asrs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    answers_json TEXT NOT NULL,
                    part_a_score INTEGER NOT NULL,
                    taken_at TEXT NOT NULL
                  );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            // Session 1 has no session lifecycle yet, so captures need a parent row
            // to satisfy the foreign key. Deliberately synthetic: task '__seed__' and
            // an epoch timestamp, so Session 2 can delete it without ambiguity.
            description: "seed placeholder session for session 1",
            sql: "INSERT OR IGNORE INTO sessions (id, task, planned_min, started_at)
                  VALUES (1, '__seed__', 25, '1970-01-01T00:00:00Z');",
            kind: MigrationKind::Up,
        },
    ]
}
