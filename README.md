# FPL Clone

A TypeScript monorepo that mirrors the public experience of [fantasy.premierleague.com](https://fantasy.premierleague.com) using a local SQLite database, a Node.js/Express API, and a React frontend.

> **What is Fantasy Premier League?** FPL is an official game where players pick a squad of real Premier League footballers and score points based on their real-world performances each gameweek. This project pulls all public player, fixture, and gameweek data from the official FPL API and gives you a local copy you can explore, query, and build on.

---

## Features

- Sync pipeline that pulls all public FPL data into a local SQLite database
- Idempotent refresh flow: safe to rerun, resumes after interruptions, noops when nothing has changed
- Express HTTP API serving player, fixture, gameweek, and team data
- React frontend with FPL-inspired design, player search, and per-player stat history
- Advanced public metrics: xG, xA, xGI, xGP, xAP, xGIP, ICT index, tackles, recoveries
- Full game-by-game player history for the current season
- Automated tests for the sync service, API routes, and frontend components

---

## Tech stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5 (ES modules) |
| API framework | Express 5 |
| Database | SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| Frontend framework | React 19 |
| Frontend build tool | Vite 7 |
| Test runner | [Vitest](https://vitest.dev) 3 |
| Frontend test utilities | [React Testing Library](https://testing-library.com/docs/react-testing-library/intro) |
| TypeScript runner (dev) | [tsx](https://github.com/privatenumber/tsx) |
| Monorepo runner | npm workspaces + [concurrently](https://github.com/open-cli-tools/concurrently) |

---

## Prerequisites

- **Node.js 20 or later** — check with `node --version`
- **npm 10 or later** — bundled with Node 20; check with `npm --version`

No database server is required. SQLite runs as a file embedded in the project.

---

## Quick start

```bash
# 1. Clone and install dependencies
git clone <repo-url> fpl-app
cd fpl-app
npm install

# 2. Create your local environment file
cp .env.example .env
# The defaults work out of the box — no edits needed for local dev

# 3. Populate the database (this takes a while — see "Seeding the database" below)
npm run sync

# 4. Start the API and frontend together
npm run dev

# 5. Open the app
open http://localhost:5173
```

The API runs at `http://localhost:4000`. The frontend runs at `http://localhost:5173`.

---

## All available scripts

Run these from the repository root.

| Command | Description |
|---|---|
| `npm run dev` | Start the API and frontend concurrently |
| `npm run dev:api` | Start only the API (port 4000) |
| `npm run dev:web` | Start only the frontend (port 5173) |
| `npm run build` | Type-check and build both apps for production |
| `npm run test` | Run all tests across all packages |
| `npm run test:watch` | Run all tests in watch mode |
| `npm run sync` | Full sync — fetch all player summaries from FPL |
| `npm run sync -- --gameweek 29` | Targeted sync — only players in gameweek 29 |
| `npm run sync -- --force` | Force full refresh even if nothing has changed upstream |
| `npm run sync -- --gameweek 29 --force` | Force gameweek refresh even if unchanged |

---

## Environment variables

Copy `.env.example` to `.env`. All variables have working defaults for local development.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Port the Express API listens on |
| `DB_PATH` | `./fpl-app/apps/api/data/fpl.sqlite` | Path to the SQLite database file |
| `FPL_BASE_URL` | `https://fantasy.premierleague.com/api` | Base URL for the public FPL API |
| `FPL_MIN_REQUEST_INTERVAL_MS` | `3000` | Minimum milliseconds between outbound FPL requests |
| `VITE_API_BASE_URL` | `http://localhost:4000/api` | API base URL used by the frontend at build time |

The API reads `.env` automatically via [dotenv](https://github.com/motdotla/dotenv). The frontend reads `VITE_*` variables at build/dev time via Vite's built-in env handling.

---

## Seeding the database

"Seeding" in this project means running the sync pipeline, which fetches live data from the official FPL API and writes it to your local SQLite file.

### Full sync

```bash
npm run sync
```

This:

1. Fetches bootstrap data from FPL (`/api/bootstrap-static/`) — all gameweeks, teams, positions, and player summaries
2. Fetches all fixtures from FPL (`/api/fixtures/`)
3. Upserts everything into the local database
4. Fetches the detailed season history for every player individually (`/api/element-summary/{id}/`)
5. Records progress so the run can be resumed if it fails

**How long does it take?** With the default 3-second rate limit, fetching all ~750 player summaries takes around 40 minutes. You can lower `FPL_MIN_REQUEST_INTERVAL_MS` (e.g., `1000`) to speed this up, but be conservative to avoid being throttled by FPL.

### Targeted gameweek sync

```bash
npm run sync -- --gameweek 29
```

This still refreshes bootstrap data and fixtures, but only fetches player summaries for players whose teams are involved in gameweek 29's fixtures. Useful for weekly updates instead of re-fetching every player.

### Resume behavior

The sync pipeline is designed to be safe to rerun:

- If a sync run fails halfway through, rerunning the same command resumes from where it stopped
- If nothing has changed upstream (same data hash), rerunning is a no-op
- Use `--force` to bypass the no-op check and re-fetch everything anyway

Progress is tracked per-player in the `player_sync_status` and `gameweek_player_sync_status` database tables using SHA-256 snapshots of the upstream data.

---

## Folder structure

```text
fpl-app/
├── .env.example              # Environment variable template
├── .env                      # Your local config (created from .env.example, not committed)
├── package.json              # Root scripts and workspace definitions
├── tsconfig.base.json        # Shared TypeScript compiler settings
│
├── apps/
│   ├── api/                  # Backend: Express API + sync pipeline + SQLite
│   │   ├── src/
│   │   │   ├── index.ts              # API server entry point
│   │   │   ├── app.ts                # Express app factory
│   │   │   ├── cli/
│   │   │   │   └── sync.ts           # sync CLI entry point (npm run sync)
│   │   │   ├── client/
│   │   │   │   └── fplApiClient.ts   # Typed HTTP client for the FPL API
│   │   │   ├── config/
│   │   │   │   └── env.ts            # Loads and validates environment variables
│   │   │   ├── db/
│   │   │   │   ├── database.ts       # Opens/creates the SQLite file, runs migrations
│   │   │   │   └── schema.ts         # SQL CREATE TABLE statements for all tables
│   │   │   ├── lib/
│   │   │   │   ├── http.ts           # Thin fetch wrapper (sets headers, throws on error)
│   │   │   │   └── rateLimiter.ts    # Queue-based rate limiter for FPL requests
│   │   │   ├── routes/
│   │   │   │   └── createApiRouter.ts  # All Express route handlers
│   │   │   └── services/
│   │   │       ├── queryService.ts   # Read-only database queries for the API
│   │   │       └── syncService.ts    # Full sync and gameweek sync orchestration
│   │   ├── test/
│   │   │   ├── app.test.ts           # HTTP integration tests for API routes
│   │   │   ├── syncService.test.ts   # Unit tests for sync logic and data calculations
│   │   │   ├── rateLimiter.test.ts   # Unit tests for rate limiter timing
│   │   │   └── fixtures.ts           # Shared test data (FPL API response mocks)
│   │   ├── data/
│   │   │   └── fpl.sqlite            # SQLite database file (created on first sync)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   │
│   └── web/                  # Frontend: React + Vite
│       ├── src/
│       │   ├── main.tsx              # React DOM entry point
│       │   ├── App.tsx               # Root component — all pages and state live here
│       │   ├── App.test.tsx          # Component tests
│       │   ├── api/
│       │   │   └── client.ts         # Typed fetch wrapper for the local API
│       │   ├── components/
│       │   │   └── StatPill.tsx      # Reusable stat badge component
│       │   ├── lib/
│       │   │   └── format.ts         # Formatting helpers (cost → £Xm, percentages)
│       │   ├── styles/
│       │   │   └── global.css        # Global CSS with FPL color palette
│       │   └── test/
│       │       └── setup.ts          # Vitest + jsdom + Testing Library setup
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
│
└── packages/
    └── contracts/            # Shared TypeScript types used by both api and web
        ├── src/
        │   └── index.ts      # All exported types (PlayerCard, FixtureCard, etc.)
        ├── package.json
        └── tsconfig.json
```

---

## API reference

All endpoints are served by the Express API on port 4000. All responses are JSON.

| Method | Path | Query parameters | Description |
|---|---|---|---|
| `GET` | `/api/health` | — | Returns `{ ok: true }` |
| `GET` | `/api/overview` | — | Current gameweek, top 8 players, upcoming fixtures, all teams |
| `GET` | `/api/gameweeks` | — | All gameweeks with deadlines and scores |
| `GET` | `/api/fixtures` | `event` (gameweek id), `team` (team id) | Fixtures, optionally filtered |
| `GET` | `/api/players` | `search`, `team`, `position`, `sort` | Player search and filter (max 100 results) |
| `GET` | `/api/players/:id` | — | Full player detail: stats + last 8 gameweeks history + upcoming fixtures |

**Player sort options:** `total_points` (default), `form`, `now_cost`, `minutes`

---

## Shared types (`@fpl/contracts`)

Both the API and the frontend share a single set of TypeScript types defined in `packages/contracts/src/index.ts`. This prevents drift between what the API returns and what the frontend expects.

Key exported types:

| Type | Description |
|---|---|
| `PlayerCard` | All player stats (points, form, xG, xA, ICT, tackles, …) |
| `PlayerDetail` | `PlayerCard` + game-by-game history + upcoming fixtures |
| `PlayerHistoryPoint` | One gameweek's worth of stats for a player |
| `FixtureCard` | A fixture with home/away team names and scores |
| `GameweekSummary` | Gameweek metadata (deadline, current, finished, scores) |
| `TeamSummary` | Team name, short name, and strength rating |
| `OverviewResponse` | Shape of the `/api/overview` response |

---

## Testing

```bash
# Run all tests once
npm run test

# Run tests in watch mode (re-runs on file save)
npm run test:watch
```

Tests are written with [Vitest](https://vitest.dev). API tests use an in-memory SQLite database so they never touch your real data file.

| Package | Test file | What it covers |
|---|---|---|
| `@fpl/api` | `test/app.test.ts` | HTTP routes — status codes, response shapes, query params |
| `@fpl/api` | `test/syncService.test.ts` | Sync idempotency, derived field calculations (xGP, xAP, xGIP), resume logic |
| `@fpl/api` | `test/rateLimiter.test.ts` | Rate limiter timing and request queuing |
| `@fpl/web` | `src/App.test.tsx` | Component rendering |

---

## Key libraries

| Library | Used for |
|---|---|
| [express](https://expressjs.com) | HTTP server and routing |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Synchronous SQLite access — no async/await, simple and fast |
| [react](https://react.dev) | Frontend UI |
| [vite](https://vitejs.dev) | Frontend dev server and production bundler |
| [vitest](https://vitest.dev) | Test runner for both API and frontend |
| [@testing-library/react](https://testing-library.com) | React component testing utilities |
| [tsx](https://github.com/privatenumber/tsx) | Run TypeScript directly in Node without a build step |
| [concurrently](https://github.com/open-cli-tools/concurrently) | Run API and frontend dev servers together from one command |
| [dotenv](https://github.com/motdotla/dotenv) | Load `.env` files into `process.env` |
| [supertest](https://github.com/ladjs/supertest) | HTTP assertion library used in API route tests |
| [cors](https://github.com/expressjs/cors) | CORS headers so the frontend can call the API from a different port |

---

## Further reading

- [Backend (API + sync) documentation](apps/api/README.md) — schema details, sync pipeline internals, full endpoint reference
- [Frontend documentation](apps/web/README.md) — component architecture, UI sections, styling approach
