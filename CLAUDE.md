# fokus

Tauri v2 desktop app. Local-first focus timer built around one mechanic: capturing an intrusive thought faster than following it.

Personal tool, single user, no product infrastructure. Every decision below is deliberate and pre-argued; do not "improve" past them.

## Non-negotiable constraints

1. **Capture round-trip under 3 seconds.** Global shortcut → widget capture focused → type → Enter → focus returned to the previously focused app. If a change makes this slower, the change is wrong. This is the product; everything else is support.
2. **Zero notifications.** No OS notifications, no toasts, no sounds on events, no badge counts, no window flashing. An anti-distraction tool must never generate an interruption.
3. **The main window never opens by itself.** Not on session end, not on app start, not on error. The user opens it.
4. **No network calls. Ever.** No telemetry, no crash reporting, no fonts from CDNs, no update checks, no audio streaming. `tauri.conf.json` CSP must forbid remote connections.
5. **Local only.** SQLite on disk. No accounts, no auth, no sync, no cloud.
6. **Abandoned is neutral.** Never use failure language in UI copy for an abandoned session. It is data, not a verdict. No red X, no "you gave up", no encouragement to do better.

## Forbidden features (do not implement, do not suggest inline)

Daily streaks, points, levels, badges, any comparison to other users. Notifications of any kind. Cloud sync, accounts, auth. Mobile version. Task management (projects, tags, priorities, due dates). Calendar integration. AI anything. Themes or settings beyond shortcut remap. Landing page, domain, analytics.

Audio specifically: no playlist screen, no skip, no volume slider, no sound library, no tone generator, no network audio source including YouTube.

The only reward mechanic permitted is the return counter (Session 3).

## Stack

- Tauri v2, Rust backend as scaffolding only. All logic in the webview.
- Vite + React 18 + TypeScript **strict**. No `any`, ever. Explicit error handling at every IPC boundary.
- SQLite via `@tauri-apps/plugin-sql`. Migrations defined in Rust, run at startup.
- No UI framework, no component library, no CSS-in-JS. Plain CSS with variables, single stylesheet per window.
- No charting library. Bars are divs.
- State: React `useState` / `useReducer` only. No Redux, Zustand, Jotai, React Query.

Dependency budget: if a package is not required by the constraints above, do not add it. Every dependency is maintenance cost on a personal tool.

## Windows

| Window | Label | Size | Behavior |
|---|---|---|---|
| Widget | `widget` | 280×80, grows to ~280×150 | Frameless, always-on-top, no taskbar entry, skip decorations, not resizable |
| Main | `main` | 900×620 | Standard, hidden on launch, opened only by tray/menu or user action |

Widget grows **downward** when the resume panel shows. Anchor top-left; do not recenter on resize or the window jumps out from under the cursor.

## Data model

Migrations are additive only. Never rewrite an existing migration; add a new one.

```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task TEXT NOT NULL,
  planned_min INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  last_active_at TEXT,
  outcome TEXT CHECK (outcome IN ('completed','abandoned'))
);

CREATE TABLE captures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved TEXT CHECK (resolved IN ('done','scheduled','deleted'))
);

CREATE TABLE asrs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  answers_json TEXT NOT NULL,
  part_a_score INTEGER NOT NULL,
  taken_at TEXT NOT NULL
);
```

All timestamps ISO 8601 UTC strings. Convert to local only for display.

**Return count is derived**, never stored: `COUNT(captures)` per session or per week. A separate counter column is duplicate state that can drift, and a temptation to "correct" later.

## Widget capture state

One explicit union, not a set of booleans (they can overlap and produce impossible UI):

```ts
type CaptureState =
  | { kind: 'idle' }
  | { kind: 'capturing'; draft: string }
  | { kind: 'confirmed'; returnNumber: number }   // auto-clears after 1s
  | { kind: 'resumed'; task: string; recent: string[] };  // clears on next input
```

## Copy

Serbian (Latin) and English, chosen by the system language, primary entry only. No switch: a switch would be a setting, and those are still forbidden. Both tables live in `src/lib/i18n.ts` and are typed identically, so a missing string is a compile error.

Informal second person, matching the tone of the concept note. Terse. No exclamation marks, no encouragement, no emoji.

The ASRS items are the exception to "translate everything": in English the official WHO wording *is* the question, so nothing is shown beneath it. In Serbian the question is a translation of mine, so the original stays visible underneath and the printed page says so.

Never use em dashes in UI copy or docs. Commas, periods, or parentheses.

## Working agreement

- Work session by session per `PLAN.md`. Do not start a later session's work early, even if it seems trivial.
- Each session ends with a working, runnable app. If it does not run, the session is not done.
- Run `pnpm tsc --noEmit` and `cargo check` before declaring a session complete.
- If an idea comes up mid-build that is not in the current session's scope: append one line to `IDEJE.md`, do not implement it. This is the paper version of the capture loop.
- If a constraint above blocks an approach, stop and say so rather than working around it.
