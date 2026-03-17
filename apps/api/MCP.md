# FPL Database MCP Server

The FPL API exposes its SQLite database as a **Model Context Protocol (MCP)** server, allowing any MCP-compatible LLM client to query and explore the dataset directly.

---

## Protocol & Standard

| Property | Value |
|----------|-------|
| Protocol | [Model Context Protocol](https://modelcontextprotocol.io/) |
| Spec version | `2025-03-26` |
| Transport | **Streamable HTTP** (stateless) |
| Endpoint | `POST http://localhost:4000/mcp` |
| Authentication | None (trusted-network access) |

### What is MCP?

The Model Context Protocol (MCP) is an open standard that lets LLM clients connect to data sources and tools through a uniform interface. An MCP server exposes **Tools** (functions the LLM can call) and **Resources** (data the LLM can read). The client discovers both at runtime via JSON-RPC 2.0 messages, so no custom per-tool integration is needed.

### Streamable HTTP Transport

This server uses the **Streamable HTTP** transport — the current MCP standard, superseding the older SSE-only transport. Every MCP message is a standard HTTP `POST` to `/mcp` with:

```
Content-Type: application/json
Accept: application/json, text/event-stream
```

The server runs in **stateless mode** — each POST is fully self-contained; no session state is created or maintained between requests.

Only `POST /mcp` is supported. `GET` and `DELETE` return `405 Method Not Allowed`.

### JSON-RPC 2.0

All messages follow the [JSON-RPC 2.0](https://www.jsonrpc.org/specification) wire format:

```json
{ "jsonrpc": "2.0", "method": "<method>", "id": <number>, "params": { … } }
```

Key methods: `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`.

---

## Lifecycle

The MCP server is **co-located with the REST API** — starting the API server (`npm run dev:api` or `npm start`) automatically makes the MCP endpoint available on the same port. No separate process is required.

```
API start → Express app created → /mcp router mounted → MCP available
```

---

## Available Tools

### `query`

Execute a read-only SQL `SELECT` (or `WITH … SELECT`) query against the FPL SQLite database.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sql` | `string` | ✓ | A valid SQL query. Must begin with `SELECT` or `WITH`. Mutating statements (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, etc.) are rejected before the database is touched. |

**Returns:** A JSON array of result rows, serialised as a string in `content[0].text`.

**On error:** `isError: true` is set and `content[0].text` contains `{ "error": "<message>" }`. This covers both the read-only rejection and any SQLite runtime errors (syntax error, unknown table, etc.).

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "id": 1,
  "params": {
    "name": "query",
    "arguments": {
      "sql": "SELECT web_name, total_points FROM players ORDER BY total_points DESC LIMIT 10"
    }
  }
}
```

---

## Available Resources

### `schema://fpl-database`

Returns the full column definitions for every table in the FPL SQLite database. LLMs should read this resource before writing SQL queries to understand table names, column names, and data types.

| Property | Value |
|----------|-------|
| URI | `schema://fpl-database` |
| MIME type | `application/json` |

**Returns:** A JSON array — one entry per table — with the following shape:

```json
[
  {
    "table": "players",
    "createSql": "CREATE TABLE players (id INTEGER PRIMARY KEY, …)",
    "columns": [
      { "name": "id",       "type": "INTEGER", "notNull": true,  "defaultValue": null, "primaryKey": true },
      { "name": "web_name", "type": "TEXT",    "notNull": false, "defaultValue": null, "primaryKey": false }
    ]
  }
]
```

**Example request:**

```json
{
  "jsonrpc": "2.0",
  "method": "resources/read",
  "id": 2,
  "params": { "uri": "schema://fpl-database" }
}
```

---

## Database Tables

| Table | Description |
|-------|-------------|
| `players` | All FPL players — season stats, expected metrics, status, cost |
| `player_history` | Per-gameweek performance for each player |
| `player_future_fixtures` | Upcoming match fixtures for each player's team |
| `teams` | Premier League teams — name, short name, strength, badge image |
| `fixtures` | All match fixtures with scores and status |
| `gameweeks` | Gameweek metadata — deadlines, scores, current/finished flags |
| `positions` | Player position definitions (GKP, DEF, MID, FWD) |
| `player_sync_status` | Internal per-player sync tracking |
| `gameweek_player_sync_status` | Internal per-gameweek sync tracking |
| `sync_state` | Internal key-value store for sync snapshots |
| `sync_runs` | Audit log of all sync operations |

---

## Connecting LLM Clients

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fpl-database": {
      "url": "http://localhost:4000/mcp",
      "transport": "http"
    }
  }
}
```

Restart Claude Desktop. The `query` tool and `schema://fpl-database` resource will appear automatically.

### MCP Inspector (interactive browser UI — recommended for testing)

```bash
npx @modelcontextprotocol/inspector http://localhost:4000/mcp
```

Opens a browser UI to browse tools, read resources, and execute calls interactively.

### curl

```bash
# 1. Initialise handshake
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'

# 2. List available tools
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2,"params":{}}'

# 3. Run a SELECT query
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":3,"params":{"name":"query","arguments":{"sql":"SELECT id, name, short_name FROM teams ORDER BY name"}}}'

# 4. Attempt a mutation (should return isError: true)
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":4,"params":{"name":"query","arguments":{"sql":"DELETE FROM teams"}}}'

# 5. Read the full schema
curl -s -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"resources/read","id":5,"params":{"uri":"schema://fpl-database"}}'
```

---

## Security Notes

- **Read-only enforcement:** Only `SELECT` and `WITH` (CTEs) are permitted. The first keyword of each query is checked before any database call is made.
- **No authentication:** The endpoint is open and intended for use on a trusted local network. If you expose port 4000 publicly, add authentication (e.g. a bearer token middleware) before the `/mcp` route.
- **No DDL or DML:** `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, and similar statements are all blocked by the allowlist check.
