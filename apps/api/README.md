# API And Sync Service

The API package does two jobs:

- It stores public FPL data in SQLite
- It exposes a local API that the frontend consumes

## Storage

By default the database file is created at `apps/api/data/fpl.sqlite`.

Tables include:

- `gameweeks`
- `teams`
- `positions`
- `players`
- `fixtures`
- `player_history`
- `player_future_fixtures`
- `player_sync_status`
- `sync_runs`

The player and player-history models include advanced public FPL fields such as:

- `expected_goals`
- `expected_assists`
- `expected_goal_involvements`
- `expected_goals_conceded`
- `tackles`
- `recoveries`
- `creativity`
- `influence`
- `threat`
- `ict_index`
- `bonus`
- `bps`

## Commands

- Run the API in development: `npm run dev -w @fpl/api`
- Run the sync job: `npm run sync -w @fpl/api`
- Run the sync job for one gameweek: `npm run sync -w @fpl/api -- --gameweek 29`
- Force a refresh even when the snapshot has not changed: `npm run sync -w @fpl/api -- --gameweek 29 --force`
- Run tests: `npm run test -w @fpl/api`
- Build the package: `npm run build -w @fpl/api`

## Local environment file

From the repository root:

```bash
cp .env.example .env
```

The API loads `.env` automatically.

## Environment variables

- `PORT`: API port. Defaults to `4000`
- `DB_PATH`: SQLite path. Defaults to `apps/api/data/fpl.sqlite`
- `FPL_BASE_URL`: Override for the FPL base URL. Defaults to `https://fantasy.premierleague.com/api`
- `FPL_MIN_REQUEST_INTERVAL_MS`: Minimum delay between outbound FPL requests. Defaults to `3000`

No authentication is needed for the current sync flow.

## Rate limiting

All outbound requests to the public FPL API are rate-limited through a shared client-side limiter.

- Default pacing is one request every 3 seconds
- The limiter applies to `bootstrap-static`, `fixtures`, and `element-summary` requests
- This is intentionally conservative to reduce the risk of hitting upstream limits during larger sync runs
- You can override the interval with `FPL_MIN_REQUEST_INTERVAL_MS`, but `3000` is the safe default

## Sync behavior

`npm run sync -w @fpl/api` performs the following steps:

1. Fetch bootstrap data and upsert gameweeks, teams, positions, and players.
2. Fetch fixtures and upsert them.
3. Discover which player summaries need refresh.
4. Refresh player history and future fixtures one player at a time.
5. Record a sync run with timestamps and status.

If a player refresh fails, successful players remain committed. The failed player is marked with an error, and the next run resumes from the remaining unsynced or failed players. This makes the process safe for weekly refreshes and recovery after interruptions.

The sync CLI is intentionally verbose and prints progress as it works, including:

- Run start and scope
- Bootstrap and fixture fetch stages
- How many player summaries are pending
- Per-player progress counters during refresh
- Success or failure summaries at the end

The sync engine is snapshot-aware:

- If the upstream snapshot has not changed, rerunning the same sync command is a noop
- If a run failed partway through, rerunning the same command resumes the unfinished players for that same snapshot
- If you want to bypass that and refresh again anyway, add `--force`

### Syncing a single gameweek

Use `npm run sync -w @fpl/api -- --gameweek 29` when you want a targeted weekly refresh.

This mode:

1. Still refreshes bootstrap data and all fixtures.
2. Finds the teams involved in the requested gameweek.
3. Builds a snapshot from that gameweek's fixtures plus the relevant bootstrap player data.
4. Refreshes only players that are unfinished for that snapshot.
5. Noops if that gameweek snapshot is unchanged and already complete.
6. Refreshes again if you pass `--force`.

## API endpoints

- `GET /api/health`
- `GET /api/overview`
- `GET /api/gameweeks`
- `GET /api/fixtures?event=29&team=1`
- `GET /api/players?search=salah&team=11&position=3&sort=total_points`
- `GET /api/players/:id`

## Testing

The tests use isolated SQLite databases so they do not modify your real local data file.
