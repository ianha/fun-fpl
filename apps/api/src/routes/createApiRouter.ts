import { Router, type Request, type Response } from "express";
import { QueryService } from "../services/queryService.js";
import type { AppDatabase } from "../db/database.js";
import { MyTeamSyncService } from "../my-team/myTeamSyncService.js";
import { liveGwService } from "../services/liveGwService.js";
import type { LiveGwUpdate } from "@fpl/contracts";
import { RecapCardService } from "../services/recapCardService.js";
import { env } from "../config/env.js";
import type { TransferDecisionHorizon } from "@fpl/contracts";
import { RivalSyncService, type RivalLeagueType } from "../services/rivalSyncService.js";
import { FplApiClient } from "../client/fplApiClient.js";
import { parseEnumValue, parseOptionalPositiveInt, parseRequiredPositiveInt } from "./routeParams.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function firstHeaderValue(value: string | undefined) {
  return value?.split(",")[0]?.trim();
}

function parseForwardedHeader(value: string | undefined) {
  if (!value) return {};

  const firstEntry = value.split(",")[0]?.trim();
  if (!firstEntry) return {};

  const parts = firstEntry.split(";").map((part) => part.trim());
  const parsed: { proto?: string; host?: string } = {};

  for (const part of parts) {
    const [rawKey, rawValue] = part.split("=", 2);
    if (!rawKey || !rawValue) continue;

    const key = rawKey.trim().toLowerCase();
    const value = rawValue.trim().replace(/^"|"$/g, "");

    if (key === "proto") parsed.proto = value;
    if (key === "host") parsed.host = value;
  }

  return parsed;
}

function hostLooksLocal(host: string | undefined) {
  if (!host) return true;
  const normalized = host.toLowerCase();

  return (
    normalized.includes("localhost") ||
    normalized.startsWith("127.0.0.1") ||
    normalized.startsWith("[::1]") ||
    normalized.startsWith("0.0.0.0") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".local")
  );
}

function getRequestOrigin(req: Request) {
  const forwarded = parseForwardedHeader(req.get("forwarded"));
  const proto =
    forwarded.proto ||
    firstHeaderValue(req.get("x-forwarded-proto")) ||
    firstHeaderValue(req.get("x-original-proto")) ||
    req.protocol;
  const host =
    forwarded.host ||
    firstHeaderValue(req.get("x-forwarded-host")) ||
    firstHeaderValue(req.get("x-original-host")) ||
    req.get("host");

  if (hostLooksLocal(host) && env.publicUrl) {
    return env.publicUrl;
  }

  return `${proto}://${host}`;
}

function sendJsonMessage(res: Response, status: number, message: string) {
  res.status(status).json({ message });
}

function sendTextMessage(res: Response, status: number, message: string) {
  res.status(status).send(message);
}

function sendParseError(res: Response, error: { status: number; message: string } | undefined) {
  if (!error) return false;
  sendJsonMessage(res, error.status, error.message);
  return true;
}

export function createApiRouter(db: AppDatabase) {
  const router = Router();
  const queryService = new QueryService(db);
  const myTeamSyncService = new MyTeamSyncService(db);
  const recapCardService = new RecapCardService(db);
  const rivalSyncService = new RivalSyncService(db);
  const fplApiClient = new FplApiClient();

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.get("/overview", (_req, res) => {
    res.json(queryService.getOverview());
  });

  router.get("/gameweeks", (_req, res) => {
    res.json(queryService.getGameweeks());
  });

  router.get("/teams", (_req, res) => {
    res.json(queryService.getTeams());
  });

  router.get("/fixtures", (req, res) => {
    const eventResult = parseOptionalPositiveInt(req.query.event?.toString(), "event");
    if (sendParseError(res, eventResult.error)) return;
    const teamResult = parseOptionalPositiveInt(req.query.team?.toString(), "team");
    if (sendParseError(res, teamResult.error)) return;
    res.json(queryService.getFixtures(eventResult.value, teamResult.value));
  });

  router.get("/players", (req, res) => {
    const teamResult = parseOptionalPositiveInt(req.query.team?.toString(), "team");
    if (sendParseError(res, teamResult.error)) return;
    const positionResult = parseOptionalPositiveInt(req.query.position?.toString(), "position");
    if (sendParseError(res, positionResult.error)) return;
    const fromGwResult = parseOptionalPositiveInt(req.query.fromGW?.toString(), "fromGW");
    if (sendParseError(res, fromGwResult.error)) return;
    const toGwResult = parseOptionalPositiveInt(req.query.toGW?.toString(), "toGW");
    if (sendParseError(res, toGwResult.error)) return;
    res.json(
      queryService.getPlayers({
        search: req.query.search?.toString(),
        team: teamResult.value,
        position: positionResult.value,
        sort: req.query.sort?.toString(),
        fromGW: fromGwResult.value,
        toGW: toGwResult.value,
      }),
    );
  });

  router.get("/players/xpts", (req, res) => {
    const gwResult = parseOptionalPositiveInt(req.query.gw?.toString(), "gw");
    if (sendParseError(res, gwResult.error)) return;
    res.json(queryService.getPlayerXpts(gwResult.value));
  });

  router.get("/players/:id", (req, res) => {
    const playerIdResult = parseRequiredPositiveInt(req.params.id, "playerId");
    if (sendParseError(res, playerIdResult.error)) return;
    const player = queryService.getPlayerById(playerIdResult.value!);
    if (!player) {
      res.status(404).json({ message: "Player not found" });
      return;
    }
    res.json(player);
  });

  router.get("/my-team/accounts", (_req, res) => {
    res.json(queryService.getMyTeamAccounts());
  });

  router.get("/my-team/leagues", (req, res) => {
    const accountIdResult = parseOptionalPositiveInt(req.query.accountId?.toString(), "accountId");
    if (sendParseError(res, accountIdResult.error)) return;
    const accountId = accountIdResult.value ?? 1;
    const leagues = db
      .prepare(
        `SELECT league_id AS leagueId, league_type AS leagueType, league_name AS leagueName, synced_at AS syncedAt
         FROM rival_leagues WHERE account_id = ? ORDER BY league_name`,
      )
      .all(accountId);
    res.json(leagues);
  });

  router.post("/my-team/leagues/discover", async (req, res) => {
    const accountId = (req.body as { accountId?: number }).accountId ?? 1;
    const account = db
      .prepare(`SELECT entry_id FROM my_team_accounts WHERE id = ?`)
      .get(accountId) as { entry_id: number | null } | undefined;

    if (!account?.entry_id) {
      res.status(404).json({ message: "Account not found or entry ID not set. Sync your team first." });
      return;
    }

    try {
      const data = await fplApiClient.getEntryInfo(account.entry_id);
      const now = new Date().toISOString();
      const upsert = db.prepare(
        `INSERT INTO rival_leagues (league_id, league_type, league_name, account_id, synced_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(league_id, league_type, account_id) DO UPDATE SET
           league_name = excluded.league_name,
           synced_at = excluded.synced_at`,
      );
      db.transaction(() => {
        for (const league of data.leagues.classic) {
          upsert.run(league.id, "classic", league.name, accountId, now);
        }
        for (const league of data.leagues.h2h) {
          upsert.run(league.id, "h2h", league.name, accountId, now);
        }
      })();
      const leagues = db
        .prepare(
          `SELECT league_id AS leagueId, league_type AS leagueType, league_name AS leagueName, synced_at AS syncedAt
           FROM rival_leagues WHERE account_id = ? ORDER BY league_name`,
        )
        .all(accountId);
      res.json(leagues);
    } catch (error) {
      res.status(502).json({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get("/my-team/picks", (req, res) => {
    const accountIdResult = parseOptionalPositiveInt(req.query.accountId?.toString(), "accountId");
    if (sendParseError(res, accountIdResult.error)) return;
    const gameweekResult = parseOptionalPositiveInt(req.query.gameweek?.toString(), "gameweek");
    if (sendParseError(res, gameweekResult.error)) return;
    const accountId = accountIdResult.value;
    const gameweek = gameweekResult.value;
    if (!accountId || !gameweek) {
      res.status(400).json({ message: "accountId and gameweek are required" });
      return;
    }
    res.json(queryService.getMyTeamPicksForGameweek(accountId, gameweek));
  });

  router.get("/my-team", (req, res) => {
    const accountIdResult = parseOptionalPositiveInt(req.query.accountId?.toString(), "accountId");
    if (sendParseError(res, accountIdResult.error)) return;
    res.json(queryService.getMyTeam(accountIdResult.value));
  });

  router.get("/my-team/:accountId/transfer-decision", (req, res) => {
    const accountIdResult = parseRequiredPositiveInt(req.params.accountId, "accountId");
    if (sendParseError(res, accountIdResult.error)) return;
    const gwResult = parseOptionalPositiveInt(req.query.gw?.toString(), "gw");
    if (sendParseError(res, gwResult.error)) return;
    const rawHorizon = req.query.horizon?.toString() ?? "3";
    const horizonResult = parseEnumValue(
      rawHorizon,
      ["1", "3", "5"] as const,
      "horizon",
      "horizon must be one of 1, 3, or 5",
    );
    if (sendParseError(res, horizonResult.error)) return;
    const accountId = accountIdResult.value!;
    const gw = gwResult.value;
    const horizon = Number(horizonResult.value) as TransferDecisionHorizon;

    const response = queryService.getTransferDecision(accountId, { gw, horizon });
    if (!response) {
      res.status(404).json({ message: "Transfer decision data not available for that account/gameweek" });
      return;
    }

    res.json(response);
  });

  router.post("/my-team/auth", async (req, res) => {
    try {
      const { code, codeVerifier, entryId } = req.body as {
        code?: string;
        codeVerifier?: string;
        entryId?: number | string;
      };
      if (!code || !codeVerifier) {
        res.status(400).json({ message: "code and codeVerifier are required" });
        return;
      }

      const parsedEntryId =
        entryId === undefined || entryId === null || entryId === ""
          ? undefined
          : Number(entryId);
      if (parsedEntryId !== undefined && (!Number.isInteger(parsedEntryId) || parsedEntryId <= 0)) {
        res.status(400).json({ message: "entryId must be a positive integer when provided" });
        return;
      }

      const { accountId } = await myTeamSyncService.linkAccountWithCode(code, codeVerifier, parsedEntryId);
      await myTeamSyncService.syncAccount(accountId, true);
      res.status(201).json(queryService.getMyTeam(accountId));
    } catch (error) {
      res.status(400).json({
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get("/fixtures/fdr", (_req, res) => {
    res.json(queryService.getFdrData());
  });

  router.get("/fixtures/calendar", (_req, res) => {
    res.json(queryService.getGwCalendar());
  });

  router.get("/my-team/captain-pick", (req, res) => {
    const accountIdResult = parseOptionalPositiveInt(req.query.accountId?.toString(), "accountId");
    if (sendParseError(res, accountIdResult.error)) return;
    const gwResult = parseOptionalPositiveInt(req.query.gw?.toString(), "gw");
    if (sendParseError(res, gwResult.error)) return;
    const accountId = accountIdResult.value;
    const gw = gwResult.value;
    if (!accountId || !gw) {
      sendJsonMessage(res, 400, "accountId and gw are required");
      return;
    }
    res.json(queryService.getCaptainRecommendations(accountId, gw));
  });

  router.post("/my-team/sync", async (req, res) => {
    try {
      const { accountId, gameweek, force } = req.body as {
        accountId?: number;
        gameweek?: number;
        force?: boolean;
      };
      if (accountId) {
        await myTeamSyncService.syncAccount(accountId, Boolean(force), gameweek);
        res.json(queryService.getMyTeam(accountId));
        return;
      }

      await myTeamSyncService.syncAll(Boolean(force), gameweek);
      res.json(queryService.getMyTeam());
    } catch (error) {
      res.status(400).json({
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get("/leagues/:leagueId/standings", async (req, res) => {
    const leagueIdResult = parseRequiredPositiveInt(req.params.leagueId, "leagueId");
    if (sendParseError(res, leagueIdResult.error)) return;
    const leagueTypeResult = parseEnumValue(
      req.query.type?.toString(),
      ["classic", "h2h"] as const,
      "type",
      "type must be 'classic' or 'h2h'",
    );
    if (sendParseError(res, leagueTypeResult.error)) return;
    const pageResult = parseOptionalPositiveInt(req.query.page?.toString(), "page");
    if (sendParseError(res, pageResult.error)) return;
    const leagueId = leagueIdResult.value!;
    const leagueType = leagueTypeResult.value!;
    const page = pageResult.value ?? 1;

    try {
      const result = await rivalSyncService.getLeagueStandingsPage(
        leagueId,
        leagueType,
        page,
      );
      res.json(result);
    } catch (error) {
      res.status(502).json({
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post("/leagues/:leagueId/sync", async (req, res) => {
    const leagueIdResult = parseRequiredPositiveInt(req.params.leagueId, "leagueId");
    const { accountId, rivalEntryId, type } = req.body as {
      accountId?: number;
      rivalEntryId?: number;
      type?: RivalLeagueType;
      syncSecret?: string;
    };

    if (sendParseError(res, leagueIdResult.error)) return;
    const accountIdResult = parseRequiredPositiveInt(accountId, "accountId");
    if (sendParseError(res, accountIdResult.error)) return;
    const rivalEntryIdResult = parseRequiredPositiveInt(rivalEntryId, "rivalEntryId");
    if (sendParseError(res, rivalEntryIdResult.error)) return;
    const leagueType = type === "h2h" ? "h2h" : "classic";
    const leagueId = leagueIdResult.value!;
    const safeAccountId = accountIdResult.value!;
    const safeRivalEntryId = rivalEntryIdResult.value!;

    try {
      const leagueKnown = db
        .prepare(
          `SELECT 1 FROM rival_leagues WHERE league_id = ? AND league_type = ? AND account_id = ? LIMIT 1`,
        )
        .get(leagueId, leagueType, safeAccountId);

      if (!leagueKnown) {
        await rivalSyncService.syncLeagueStandings(leagueId, leagueType, safeAccountId);
      }

      const result = await rivalSyncService.syncRivalOnDemand(
        leagueId,
        safeRivalEntryId,
        safeAccountId,
      );
      res.json(result);
    } catch (error) {
      res.status(502).json({
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get("/leagues/:leagueId/h2h/:rivalEntryId", (req, res) => {
    const leagueIdResult = parseRequiredPositiveInt(req.params.leagueId, "leagueId");
    if (sendParseError(res, leagueIdResult.error)) return;
    const rivalEntryIdResult = parseRequiredPositiveInt(req.params.rivalEntryId, "rivalEntryId");
    if (sendParseError(res, rivalEntryIdResult.error)) return;
    const accountIdResult = parseOptionalPositiveInt(req.query.accountId?.toString(), "accountId");
    if (sendParseError(res, accountIdResult.error)) return;
    res.json(queryService.getH2HComparison(
      accountIdResult.value ?? 1,
      leagueIdResult.value!,
      rivalEntryIdResult.value!,
    ));
  });

  router.get("/my-team/:accountId/recap/:gw/preview", async (req, res) => {
    const accountIdResult = parseRequiredPositiveInt(req.params.accountId, "accountId");
    const gwResult = parseRequiredPositiveInt(req.params.gw, "gw");
    if (accountIdResult.error || gwResult.error) {
      sendTextMessage(res, 400, "Bad request");
      return;
    }
    const accountId = accountIdResult.value;
    const gw = gwResult.value;
    const data = recapCardService.getRecapData(accountId, gw);
    if (!data) {
      sendTextMessage(res, 404, "Not found");
      return;
    }

    try {
      const asset = await recapCardService.ensureCardAsset(data);
      const origin = getRequestOrigin(req);
      const previewUrl = `${origin}/api/my-team/${accountId}/recap/${gw}/preview`;
      const imageUrl = `${origin}${asset.relativePath}`;
      const title = escapeHtml(`${data.managerName} — GW${gw} Recap`);
      const description = escapeHtml(`${data.points} pts · Rank #${data.overallRank.toLocaleString()} · ${data.teamName}`);
      const imageAlt = escapeHtml(`${data.teamName} gameweek ${gw} recap card`);
      const safeImageUrl = escapeHtml(imageUrl);
      const safePreviewUrl = escapeHtml(previewUrl);
      const safeRelativeImageUrl = escapeHtml(asset.relativePath);

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${description}">
  <meta property="og:url" content="${safePreviewUrl}">
  <meta property="og:site_name" content="FPLytics">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${safeImageUrl}">
  <meta property="og:image:url" content="${safeImageUrl}">
  <meta property="og:image:secure_url" content="${safeImageUrl}">
  <meta property="og:image:width" content="480">
  <meta property="og:image:height" content="320">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:alt" content="${imageAlt}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${safeImageUrl}">
  <meta name="twitter:image:alt" content="${imageAlt}">
  <link rel="canonical" href="${safePreviewUrl}">
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${description}</p>
    <img src="${safeRelativeImageUrl}" alt="${imageAlt}" width="480" height="320">
    <p><a href="${safeRelativeImageUrl}">Open recap image</a></p>
  </main>
</body>
</html>`);
    } catch (err) {
      res.status(500).send(err instanceof Error ? err.message : "Failed to render recap card");
    }
  });

  router.get("/my-team/:accountId/recap/:gw", async (req, res) => {
    const accountIdResult = parseRequiredPositiveInt(req.params.accountId, "accountId");
    const gwResult = parseRequiredPositiveInt(req.params.gw, "gw");
    if (accountIdResult.error || gwResult.error) {
      sendJsonMessage(res, 400, "accountId and gw are required");
      return;
    }
    const accountId = accountIdResult.value;
    const gw = gwResult.value;
    const data = recapCardService.getRecapData(accountId, gw);
    if (!data) {
      res.status(404).json({ message: "No recap data found for this account and gameweek" });
      return;
    }
    try {
      const asset = await recapCardService.ensureCardAsset(data);
      res.setHeader("Content-Type", "image/png");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="fplytics-gw${gw}-recap.png"`,
      );
      res.sendFile(asset.absolutePath);
    } catch (err) {
      res.status(500).json({
        message: err instanceof Error ? err.message : "Failed to render recap card",
      });
    }
  });

  router.get("/live/gw/:gw/stream", (req, res) => {
    const gameweek = Number(req.params.gw);
    if (!gameweek || gameweek < 1) {
      res.status(400).json({ message: "gameweek must be a positive integer" });
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const emit = (update: LiveGwUpdate) =>
      res.write(`data: ${JSON.stringify(update)}\n\n`);
    const cached = liveGwService.getCached(gameweek);
    if (cached) emit(cached);
    liveGwService.startPolling(gameweek);
    const unsub = liveGwService.subscribe(gameweek, emit);
    req.on("close", unsub);
  });

  router.get("/live/gw/:gw", async (req, res) => {
    const gameweek = Number(req.params.gw);
    if (!gameweek || gameweek < 1) {
      res.status(400).json({ message: "gameweek must be a positive integer" });
      return;
    }
    const cached = liveGwService.getCached(gameweek);
    if (cached) { res.json(cached); return; }
    try {
      await liveGwService.fetchAndCache(gameweek);
      res.json(liveGwService.getCached(gameweek));
    } catch (err) {
      res.status(502).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
