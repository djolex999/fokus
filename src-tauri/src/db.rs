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
        Migration {
            version: 5,
            // Session 2 introduces real sessions, so the placeholder from
            // migration 4 and everything hanging off it goes. Its captures were
            // typed to test the loop, not to be kept.
            description: "drop the session 1 placeholder",
            sql: "DELETE FROM captures WHERE session_id IN
                    (SELECT id FROM sessions WHERE task = '__seed__');
                  DELETE FROM sessions WHERE task = '__seed__';",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            // A thought can now be written down with no session running, so
            // `session_id` loses NOT NULL. SQLite cannot drop a constraint in
            // place, so the table is rebuilt and every row copied with its id.
            //
            // A plain rebuild also resets the AUTOINCREMENT high-water mark to
            // the largest surviving id, and that mark is the only record of
            // captures that were made and later cleared (76 of them, found this
            // way on 2026-09-16). So it is carried across before the swap: set
            // on the new table's row if the copy created one, inserted if the
            // old table was empty but used. A never-used table has no mark and
            // gets none. Checked against a copy of the real database and three
            // constructed ones before it was committed.
            description: "captures can exist without a session",
            sql: "CREATE TABLE captures_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER REFERENCES sessions(id),
                    text TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    resolved TEXT CHECK (resolved IN ('done','scheduled','deleted'))
                  );
                  INSERT INTO captures_new (id, session_id, text, created_at, resolved)
                    SELECT id, session_id, text, created_at, resolved FROM captures;
                  UPDATE sqlite_sequence
                     SET seq = (SELECT seq FROM sqlite_sequence WHERE name = 'captures')
                   WHERE name = 'captures_new';
                  INSERT INTO sqlite_sequence (name, seq)
                    SELECT 'captures_new', seq FROM sqlite_sequence
                     WHERE name = 'captures'
                       AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'captures_new');
                  DROP TABLE captures;
                  ALTER TABLE captures_new RENAME TO captures;",
            kind: MigrationKind::Up,
        },
    ]
}
