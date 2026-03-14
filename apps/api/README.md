# @fpl/api — Backend API and Sync Service

This package does two distinct jobs:

1. **Sync** — pulls public Fantasy Premier League data into a local SQLite database
2. **Serve** — exposes an HTTP API that the frontend (and any other tooling) consumes

---

## Architecture overview

```
Public FPL API
  └── fplApiClient.ts        fetches bootstrap, fixtures, player summaries
        └── rateLimiter.ts   enforces minimum interval between requests
              └── syncService.ts    orchestrates all sync logic
                    └── database.ts  writes to SQLite (better-sqlite3)

SQLite file (data/fpl.sqlite)
  └── queryService.ts        read-only queries with joins and filters
        └── createApiRouter.ts  Express route handlers
              └── app.ts / index.ts  HTTP server
```

---

## Commands

Run these from the repository root, or replace `npm run` with `npm run -w @fpl/api` if you are in a different directory.

| Command | Description |
|---|---|
| `npm run dev:api` | Start API in development (auto-restarts on file changes via tsx watch) |
| `npm run sync` | Full sync — fetch all player summaries |
| `npm run sync -- --gameweek 29` | Targeted sync — only players in gameweek 29 |
| `npm run sync -- --force` | Force full refresh even if nothing changed upstream |
| `npm run sync -- --gameweek 29 --force` | Force gameweek refresh |
| `npm run test` | Run all API tests once |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run the compiled production build |

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Port the API listens on |
| `DB_PATH` | `apps/api/data/fpl.sqlite` | Path to the SQLite database file, relative to the repo root or absolute |
| `FPL_BASE_URL` | `https://fantasy.premierleague.com/api` | Base URL for the FPL API — only change this for testing |
| `FPL_MIN_REQUEST_INTERVAL_MS` | `3000` | Minimum milliseconds between outbound FPL requests |

No FPL account or API key is required. All endpoints used are public.

---

## Database

### Location

The database file is created automatically at `apps/api/data/fpl.sqlite` on first sync. The path can be changed with `DB_PATH`.

### Setup and migrations

`database.ts` runs automatically when the API starts or the sync CLI is invoked:

- Creates all tables if they do not exist
- Adds any missing columns (`ALTER TABLE ... ADD COLUMN`) for backward compatibility with existing database files
- Migrates the `player_history` primary key from a single column to the composite `(player_id, round, opponent_team, kickoff_time)` if needed
- Backfills derived performance columns for any existing rows that predate those fields

SQLite runs in WAL (Write-Ahead Logging) mode for better read/write concurrency.

### Schema

#### `gameweeks`

Stores every gameweek's metadata.

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | FPL gameweek ID |
| `name` | TEXT | Display name, e.g. `"Gameweek 29"` |
| `deadline_time` | TEXT | ISO 8601 timestamp of the entry deadline |
| `average_entry_score` | INTEGER | Average score across all managers (null if not finished) |
| `highest_score` | INTEGER | Highest score in this gameweek (null if not finished) |
| `is_current` | INTEGER | `1` if this is the live gameweek, `0` otherwise |
| `is_finished` | INTEGER | `1` if the gameweek is complete, `0` otherwise |
| `updated_at` | TEXT | ISO 8601 timestamp of last upsert |

#### `teams`

All 20 Premier League clubs.

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | FPL team ID |
| `name` | TEXT | Full club name, e.g. `"Arsenal"` |
| `short_name` | TEXT | Three-letter abbreviation, e.g. `"ARS"` |
| `strength` | INTEGER | FPL's overall strength rating (used for fixture difficulty) |
| `updated_at` | TEXT | ISO 8601 timestamp of last upsert |

#### `positions`

The four player positions.

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | FPL position ID (1=GK, 2=DEF, 3=MID, 4=FWD) |
| `name` | TEXT | Full name, e.g. `"Midfielder"` |
| `short_name` | TEXT | Short form, e.g. `"MID"` |
| `updated_at` | TEXT | ISO 8601 timestamp of last upsert |

#### `players`

One row per player. Updated on every sync from bootstrap data.

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | FPL element ID |
| `web_name` | TEXT | Display name used in FPL, e.g. `"Salah"` |
| `first_name` | TEXT | First name |
| `second_name` | TEXT | Surname |
| `team_id` | INTEGER FK | References `teams.id` |
| `position_id` | INTEGER FK | References `positions.id` |
| `now_cost` | INTEGER | Current price × 10 (e.g. `125` = £12.5m) |
| `total_points` | INTEGER | Total FPL points this season |
| `form` | REAL | Rolling average points per game (last 30 days) |
| `selected_by_percent` | REAL | Percentage of FPL managers who own this player |
| `points_per_game` | REAL | Season average points per game |
| `goals_scored` | INTEGER | Goals this season |
| `assists` | INTEGER | Assists this season |
| `clean_sheets` | INTEGER | Clean sheets this season |
| `minutes` | INTEGER | Total minutes played this season |
| `bonus` | INTEGER | Bonus points this season |
| `bps` | INTEGER | Total BPS (Bonus Points System) score |
| `creativity` | REAL | FPL creativity score |
| `influence` | REAL | FPL influence score |
| `threat` | REAL | FPL threat score |
| `ict_index` | REAL | Composite ICT (Influence, Creativity, Threat) index |
| `expected_goals` | REAL | xG — expected goals this season |
| `expected_assists` | REAL | xA — expected assists this season |
| `expected_goal_involvements` | REAL | xGI — sum of xG + xA |
| `expected_goal_performance` | REAL | xGP — goals minus xG (positive = over-performing) |
| `expected_assist_performance` | REAL | xAP — assists minus xA |
| `expected_goal_involvement_performance` | REAL | xGIP — xGP + xAP |
| `expected_goals_conceded` | REAL | Expected goals conceded (defenders and goalkeepers) |
| `clean_sheets_per_90` | REAL | Clean sheets per 90 minutes |
| `starts` | INTEGER | Number of starts this season |
| `tackles` | INTEGER | Tackles this season |
| `recoveries` | INTEGER | Recoveries this season |
| `defensive_contribution` | INTEGER | Clearances, blocks, and interceptions combined |
| `status` | TEXT | Availability: `"a"` (available), `"d"` (doubtful), `"i"` (injured), `"s"` (suspended), `"u"` (unavailable) |
| `updated_at` | TEXT | ISO 8601 timestamp of last upsert |

#### `fixtures`

Every match in the Premier League season.

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | FPL fixture ID |
| `code` | INTEGER | FPL fixture code (different from id) |
| `event_id` | INTEGER | Gameweek ID (null for BGW/DGW fixtures without a round assignment) |
| `kickoff_time` | TEXT | ISO 8601 kickoff timestamp (null if not yet scheduled) |
| `team_h` | INTEGER FK | Home team ID → `teams.id` |
| `team_a` | INTEGER FK | Away team ID → `teams.id` |
| `team_h_score` | INTEGER | Home score (null if not finished) |
| `team_a_score` | INTEGER | Away score (null if not finished) |
| `finished` | INTEGER | `1` if the match is complete |
| `started` | INTEGER | `1` if the match has kicked off |
| `updated_at` | TEXT | ISO 8601 timestamp of last upsert |

#### `player_history`

One row per player per gameweek played. This is the most granular data in the database.

Primary key: `(player_id, round, opponent_team, kickoff_time)` — the composite key handles double gameweeks where a player faces different opponents in the same round.

| Column | Type | Description |
|---|---|---|
| `player_id` | INTEGER FK | References `players.id` |
| `round` | INTEGER | Gameweek number |
| `total_points` | INTEGER | FPL points earned in this fixture |
| `minutes` | INTEGER | Minutes played |
| `goals_scored` | INTEGER | Goals scored |
| `assists` | INTEGER | Assists |
| `clean_sheets` | INTEGER | Clean sheet (1 or 0) |
| `bonus` | INTEGER | Bonus points awarded |
| `bps` | INTEGER | BPS score for this fixture |
| `creativity` | REAL | Creativity score |
| `influence` | REAL | Influence score |
| `threat` | REAL | Threat score |
| `ict_index` | REAL | ICT index |
| `expected_goals` | REAL | xG in this fixture |
| `expected_assists` | REAL | xA in this fixture |
| `expected_goal_involvements` | REAL | xGI in this fixture |
| `expected_goal_performance` | REAL | Goals minus xG in this fixture |
| `expected_assist_performance` | REAL | Assists minus xA in this fixture |
| `expected_goal_involvement_performance` | REAL | xGP + xAP in this fixture |
| `expected_goals_conceded` | REAL | xGC in this fixture |
| `tackles` | INTEGER | Tackles in this fixture |
| `recoveries` | INTEGER | Recoveries in this fixture |
| `clearances_blocks_interceptions` | INTEGER | Defensive actions (CBI) |
| `defensive_contribution` | INTEGER | Combined defensive stats |
| `starts` | INTEGER | `1` if the player started, `0` if a substitute |
| `opponent_team` | INTEGER | FPL team ID of the opponent |
| `value` | INTEGER | Player price × 10 at time of this fixture |
| `was_home` | INTEGER | `1` if the player's team was at home |
| `kickoff_time` | TEXT | ISO 8601 kickoff timestamp |
| `updated_at` | TEXT | ISO 8601 timestamp of last write |

#### `player_future_fixtures`

Upcoming fixtures for each player. Rebuilt on every player summary sync.

Primary key: `(player_id, fixture_id)`

Contains the same fixture columns as the `fixtures` table, plus `player_id`.

#### `player_sync_status`

Tracks which players have been synced and whether they are up to date.

| Column | Type | Description |
|---|---|---|
| `player_id` | INTEGER PK FK | References `players.id` |
| `bootstrap_updated_at` | TEXT | Timestamp from the bootstrap data for this player |
| `synced_at` | TEXT | When this player's summary was last successfully synced |
| `last_error` | TEXT | Error message from the last failed attempt (null if none) |
| `requested_snapshot` | TEXT | SHA-256 hash of the data that was submitted for sync |
| `completed_snapshot` | TEXT | SHA-256 hash that was present when sync completed — if these match, the player is up to date |

#### `gameweek_player_sync_status`

Same purpose as `player_sync_status`, but scoped to a specific gameweek sync run.

Primary key: `(gameweek_id, player_id)`

#### `sync_state`

Key-value store for global sync metadata, primarily used to store the current full-sync snapshot hash and per-gameweek snapshot hashes.

| Column | Type | Description |
|---|---|---|
| `key` | TEXT PK | e.g. `"full_snapshot"`, `"gameweek_snapshot:29"` |
| `value` | TEXT | The snapshot hash or other state value |
| `updated_at` | TEXT | ISO 8601 timestamp |

#### `sync_runs`

Audit log of every sync invocation.

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-incrementing run ID |
| `started_at` | TEXT | ISO 8601 start timestamp |
| `finished_at` | TEXT | ISO 8601 finish timestamp (null if still running or crashed) |
| `status` | TEXT | `"running"`, `"success"`, or `"failed"` |
| `error_message` | TEXT | Top-level error message for failed runs |

---

## Sync pipeline

### How it works

`syncService.ts` implements two public functions: `syncAll` and `syncGameweek`.

**Full sync (`npm run sync`):**

1. Fetch `/api/bootstrap-static/` — contains all gameweeks, teams, positions, and every player's season summary
2. Upsert gameweeks, teams, positions, and players into the database
3. Fetch `/api/fixtures/` — all matches
4. Upsert all fixtures
5. Compare a SHA-256 hash of the bootstrap players + fixtures against the stored `full_snapshot` in `sync_state`
6. If the snapshot matches and all players are marked complete, the run is a no-op (unless `--force` is passed)
7. For each player that is pending (new, errored, or not yet completed for this snapshot):
   - Fetch `/api/element-summary/{id}/` — season history and upcoming fixtures
   - Replace that player's `player_history` and `player_future_fixtures` rows in a transaction
   - Mark the player complete in `player_sync_status`
8. Record the run result in `sync_runs`

**Gameweek sync (`npm run sync -- --gameweek 29`):**

Same steps 1–4, then:

5. Find which teams play in gameweek 29
6. Hash the gameweek's fixtures + the players on those teams → `gameweek_snapshot:29`
7. Skip players already complete for that snapshot
8. Fetch and refresh only the players on those teams
9. Mark run complete

### Snapshot-aware resume

Each player's `requested_snapshot` is set before fetching, and `completed_snapshot` is set after a successful write. If they match, the player is skipped on re-runs.

If a sync fails mid-run (network error, crash, etc.), rerunning the same command automatically resumes from the first player whose `completed_snapshot` does not match `requested_snapshot`. No data is lost or corrupted.

### Derived performance fields

Three fields in `players` and `player_history` are calculated locally, not provided by FPL:

```
expected_goal_performance             = goals_scored - expected_goals
expected_assist_performance           = assists - expected_assists
expected_goal_involvement_performance = expected_goal_performance + expected_assist_performance
```

A positive value means the player is over-performing relative to their expected output. These are calculated during sync and backfilled for any existing rows during migrations.

---

## Rate limiting

All outbound requests to the FPL API pass through a queue-based `RequestRateLimiter` (`src/lib/rateLimiter.ts`). It enforces a minimum interval between consecutive requests:

- Default: **3000 ms** (one request every 3 seconds)
- Override: set `FPL_MIN_REQUEST_INTERVAL_MS` in your `.env`

This is intentionally conservative. The FPL API is a public, unauthenticated service and does not publish rate limit headers. Being throttled would cause your sync to fail, not just slow down.

The limiter queues requests in order so they never fire in parallel.

---

## API endpoints

The Express app mounts all routes under the `/api` prefix.

### `GET /api/health`

Returns a simple health check. Useful to confirm the API is running.

```json
{ "ok": true }
```

### `GET /api/overview`

Dashboard data in one request: current gameweek info, top 8 players by total points, the first 12 upcoming fixtures, and all teams.

```json
{
  "generatedAt": "2025-03-14T12:00:00.000Z",
  "gameweeks": [ /* GameweekSummary[] */ ],
  "topPlayers": [ /* PlayerCard[] — top 8 by total_points */ ],
  "fixtures": [ /* FixtureCard[] — next 12 */ ],
  "teams": [ /* TeamSummary[] */ ]
}
```

### `GET /api/gameweeks`

All gameweeks with deadlines, scores, and status flags.

```json
[ /* GameweekSummary[] */ ]
```

### `GET /api/fixtures`

Fixtures, optionally filtered.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `event` | integer | Filter by gameweek ID |
| `team` | integer | Filter to fixtures involving this team ID |

```json
[ /* FixtureCard[] */ ]
```

### `GET /api/players`

Search and filter players. Returns up to 100 results.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `search` | string | Case-insensitive substring match on `web_name`, `first_name`, `second_name` |
| `team` | integer | Filter by team ID |
| `position` | integer | Filter by position ID (1=GK, 2=DEF, 3=MID, 4=FWD) |
| `sort` | string | Sort field: `total_points` (default), `form`, `now_cost`, `minutes` |

```json
[ /* PlayerCard[] */ ]
```

### `GET /api/players/:id`

Full player detail: season stats, last 8 gameweeks of history, and upcoming fixtures.

```json
{
  "player": { /* PlayerCard */ },
  "history": [ /* PlayerHistoryPoint[] — last 8 gameweeks */ ],
  "upcomingFixtures": [ /* FixtureCard[] */ ]
}
```

---

## Source files reference

| File | Description |
|---|---|
| `src/index.ts` | Creates and starts the Express HTTP server |
| `src/app.ts` | Express app factory — CORS, JSON middleware, mounts the router |
| `src/cli/sync.ts` | CLI entry point: parses `--gameweek` and `--force` flags, calls sync service |
| `src/client/fplApiClient.ts` | Typed HTTP client for the three FPL endpoints (bootstrap, fixtures, element-summary) |
| `src/config/env.ts` | Loads `.env` with dotenv, exports a validated `env` object |
| `src/db/database.ts` | Opens (or creates) the SQLite file, runs migrations, exports the `db` instance |
| `src/db/schema.ts` | SQL strings for all `CREATE TABLE` statements |
| `src/lib/http.ts` | Thin fetch wrapper that sets a user-agent header and throws on non-2xx responses |
| `src/lib/rateLimiter.ts` | Queue-based rate limiter that enforces minimum intervals between requests |
| `src/routes/createApiRouter.ts` | All six Express route handlers |
| `src/services/queryService.ts` | Read-only database queries with joins, filtering, and sorting |
| `src/services/syncService.ts` | Full sync and gameweek sync orchestration |

---

## Testing

```bash
# Run all API tests
npm run test

# Watch mode (re-runs on save)
npm run test:watch
```

Tests use Vitest and isolated in-memory SQLite databases so they never read or write your real `fpl.sqlite` file.

| File | What it tests |
|---|---|
| `test/app.test.ts` | HTTP integration — all routes, status codes, query params, error handling |
| `test/syncService.test.ts` | Sync idempotency, snapshot matching, derived field calculations, resume-on-failure |
| `test/rateLimiter.test.ts` | Interval enforcement, request queuing, fake timer assertions |
| `test/fixtures.ts` | Shared mock data: `bootstrapFixture`, `fixturesFixture`, `createElementSummaryFixture` |
