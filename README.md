# FPL Clone

This project is a TypeScript monorepo that recreates the core public experience of [fantasy.premierleague.com](https://fantasy.premierleague.com) using a local SQLite database, a backend API, and a mobile-friendly frontend.

## What is included

- A sync pipeline that pulls public Fantasy Premier League data into SQLite
- An idempotent refresh flow that can resume after errors
- A local HTTP API for the frontend and external tooling
- A responsive React frontend styled with the Fantasy Premier League color palette
- Advanced public player metrics such as xG, xA, xGI, tackles, and related history stats
- Automated tests for backend services, API routes, and frontend rendering

## Public FPL endpoints used

The sync process currently uses public endpoints that do not require an FPL account:

- `https://fantasy.premierleague.com/api/bootstrap-static/`
- `https://fantasy.premierleague.com/api/fixtures/`
- `https://fantasy.premierleague.com/api/element-summary/{playerId}/`

If you later want private team features such as transfers, picks, or authenticated manager history, credentials can be added through environment variables and new API clients can be layered on top without changing the current public sync flow.

## FPL request pacing

Sync requests to Fantasy Premier League are rate-limited by default to one request every 3 seconds to reduce the risk of upstream throttling. You can tune this with `FPL_MIN_REQUEST_INTERVAL_MS`, but the default is intentionally conservative.

## Project structure

```text
apps/
  api/        Express API, SQLite schema, sync CLI, tests
  web/        React + Vite frontend, tests
packages/
  contracts/  Shared TypeScript API contracts
```

## Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

   The defaults are set up to work locally without extra changes.

3. Run a first sync to populate the database:

   ```bash
   npm run sync
   ```

   To refresh only one gameweek instead of every player summary:

   ```bash
   npm run sync -- --gameweek 29
   ```

4. Start the backend and frontend together:

   ```bash
   npm run dev
   ```

5. Open the frontend at [http://localhost:5173](http://localhost:5173)

The API runs at [http://localhost:4000](http://localhost:4000).

## Common commands

- Start both apps: `npm run dev`
- Start only the API: `npm run dev:api`
- Start only the web app: `npm run dev:web`
- Build everything: `npm run build`
- Run all tests: `npm run test`
- Refresh data: `npm run sync`
- Refresh a single gameweek: `npm run sync -- --gameweek 29`
- Force a refresh even if the upstream snapshot is unchanged: `npm run sync -- --gameweek 29 --force`

## Environment file

A starter environment template is provided at [.env.example](/Users/iha/fpl-app/.env.example).

Copy it with:

```bash
cp .env.example .env
```

The backend reads `.env` automatically, and the frontend uses the same root `.env` file via Vite configuration.

## How refresh and resume work

The sync task is designed to be safe to rerun:

- Bootstrap data is upserted by primary key
- Fixtures are upserted by fixture id
- Player summary data is replaced transactionally per player
- Sync progress is recorded in the database
- If a refresh fails mid-run, rerunning the same command resumes the unfinished work for the same upstream snapshot
- If the upstream snapshot is unchanged, rerunning the same command is a noop
- If you want to re-refresh anyway, add `--force`

This means you can use the same command for first load, weekly refreshes, and recovery after an interruption.

## Targeted weekly refreshes

If you do not want a full player-summary refresh every week, use:

```bash
npm run sync -- --gameweek 29
```

This mode still refreshes global bootstrap data and fixtures, but it only refreshes detailed player summaries for players on teams involved in that gameweek's fixtures.
If the upstream snapshot for that gameweek has not changed, it noops. If the prior run failed, rerunning the same command resumes the unfinished players. Use `--force` to refresh it anyway.

## Documentation

- Backend docs: [apps/api/README.md](/Users/iha/fpl-app/apps/api/README.md)
- Frontend docs: [apps/web/README.md](/Users/iha/fpl-app/apps/web/README.md)
