# Frontend Web App

This frontend is a responsive React application that consumes the local API and presents a Fantasy Premier League inspired dashboard.

## Commands

- Run in development: `npm run dev -w @fpl/web`
- Build for production: `npm run build -w @fpl/web`
- Run tests: `npm run test -w @fpl/web`

## Local API expectation

The frontend expects the backend API at `http://localhost:4000/api`.

If you want to point the web app somewhere else, set:

- `VITE_API_BASE_URL`

Example:

```bash
VITE_API_BASE_URL=http://localhost:4100/api npm run dev -w @fpl/web
```

You can also set this in the shared root `.env` file by copying [.env.example](/Users/iha/fpl-app/.env.example) to `.env`.

## Mobile friendliness

The layout is designed to:

- Collapse from a multi-column dashboard to stacked cards on smaller screens
- Keep filters accessible on touch devices
- Preserve readable type sizes and hit targets
