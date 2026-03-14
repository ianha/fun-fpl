# @fpl/web — React Frontend

A responsive React dashboard that consumes the local FPL API and presents player stats, fixtures, and gameweek data in an FPL-inspired UI.

---

## What it shows

The app is a single-page dashboard with four main sections:

| Section | What it displays |
|---|---|
| **Hero** | App title, description, and the current gameweek deadline |
| **Overview grid** | Top 8 players by total points, each with a points/form/xGI/price summary |
| **Dashboard grid** | Two-column layout: upcoming fixtures on the left, player search on the right |
| **Detail panel** | Appears when a player is selected — season stats, last 8 gameweeks of history, upcoming fixtures |

---

## Commands

Run these from the repository root, or with `-w @fpl/web` from elsewhere.

| Command | Description |
|---|---|
| `npm run dev:web` | Start the Vite dev server at `http://localhost:5173` with HMR |
| `npm run build` | Type-check (`tsc --noEmit`) then bundle to `dist/` |
| `npm run test` | Run all frontend tests once |

The frontend requires the API to be running at the same time. Start both together with `npm run dev` from the repo root.

---

## Architecture

The frontend is a single `App.tsx` component tree. There are no client-side routes — everything is rendered in one page with conditional display based on state.

| Technology | Purpose |
|---|---|
| React 19 | UI rendering and state management |
| Vite 7 | Dev server, HMR, production bundler |
| `@fpl/contracts` | Shared TypeScript types (imported from the monorepo `packages/contracts`) |
| No CSS framework | Plain CSS in `src/styles/global.css` with FPL color palette |

---

## State management

All state lives in `App.tsx` using React hooks. There is no external state library.

The `AsyncState<T>` type models every remote data fetch:

```ts
type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };
```

Three pieces of state are tracked:

| State | Type | Populated by |
|---|---|---|
| `overview` | `AsyncState<OverviewResponse>` | `getOverview()` — called once on mount |
| `players` | `AsyncState<PlayerCard[]>` | `getPlayers(search)` — called whenever the search input changes |
| `selectedPlayer` | `AsyncState<PlayerDetail \| null>` | `getPlayer(id)` — called when a player card is clicked |

When the players list loads, the first result is automatically selected so the detail panel is never empty.

---

## Source files

| File | Description |
|---|---|
| `src/main.tsx` | React DOM root — mounts `<App />` into `#root` |
| `src/App.tsx` | Root component containing all sections, state, and event handlers |
| `src/api/client.ts` | Typed fetch wrapper that calls the three API endpoints |
| `src/components/StatPill.tsx` | Reusable label + value badge used throughout the dashboard |
| `src/lib/format.ts` | Formatting utilities: cost and percentage display |
| `src/styles/global.css` | All CSS — layout, color palette, responsive breakpoints |
| `src/test/setup.ts` | Vitest + jsdom + `@testing-library/jest-dom` setup file |

---

## API client (`src/api/client.ts`)

The client wraps `fetch` with typed return values from `@fpl/contracts`. Base URL is read from the `VITE_API_BASE_URL` environment variable at build time, falling back to `http://localhost:4000/api`.

```ts
getOverview()          // → OverviewResponse
getPlayers(search?)    // → PlayerCard[]
getPlayer(playerId)    // → PlayerDetail
```

All functions throw if the response is not ok.

---

## Utilities (`src/lib/format.ts`)

| Function | Input | Output | Example |
|---|---|---|---|
| `formatCost(cost)` | Integer price × 10 | `£Xm` string | `125` → `"£12.5m"` |
| `formatPercent(value)` | Float | `X.X%` string | `73.4` → `"73.4%"` |

---

## Components

### `StatPill`

```tsx
<StatPill label="xGI" value="7.23" />
```

Renders a small rounded badge with a label and value. Used in the player overview grid and the detail panel.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:4000/api` | API base URL injected at build time by Vite |

Set this in the root `.env` file. To point the frontend at a different API host without modifying `.env`:

```bash
VITE_API_BASE_URL=http://localhost:4100/api npm run dev:web
```

---

## Testing

```bash
npm run test          # run once
npm run test:watch    # watch mode
```

Tests use [Vitest](https://vitest.dev) with [jsdom](https://github.com/jsdom/jsdom) as the DOM environment and [React Testing Library](https://testing-library.com/docs/react-testing-library/intro) for rendering and assertions. The setup file at `src/test/setup.ts` imports `@testing-library/jest-dom` so DOM matchers like `.toBeInTheDocument()` are available globally.

---

## Responsive design

The layout uses CSS grid and flexbox with breakpoints in `global.css`:

- On wide screens: hero panel spans full width; overview grid shows multiple columns; dashboard shows two columns side by side
- On narrow screens (mobile): all sections stack vertically; player cards reflow to single column; font sizes and touch targets remain accessible

No CSS framework is used — all styles are in `global.css`.
