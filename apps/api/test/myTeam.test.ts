import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "../src/db/database.js";
import { QueryService } from "../src/services/queryService.js";
import { MyTeamSyncService } from "../src/my-team/myTeamSyncService.js";
import { createApp } from "../src/app.js";

vi.hoisted(() => {
  process.env.FPL_AUTH_SECRET = "test-fpl-secret";
});

const sessionFixtures = vi.hoisted(() => ({
  me: {
    player: {
      id: 77,
      entry: 321,
      entry_name: "Midnight Press FC",
    },
  },
  entry: {
    player_first_name: "Ian",
    player_last_name: "Harper",
    player_region_name: "Canada",
    name: "Midnight Press FC",
  },
  history: {
    current: [
      {
        event: 7,
        points: 64,
        total_points: 612,
        overall_rank: 121482,
        rank: 121482,
        bank: 14,
        value: 1012,
        event_transfers: 1,
        event_transfers_cost: 4,
        points_on_bench: 6,
      },
    ],
    past: [
      {
        season_name: "2025/26",
        total_points: 2310,
        rank: 150002,
      },
    ],
  },
  transfers: [
    {
      event: 7,
      time: "2026-03-18T18:00:00.000Z",
      element_in: 11,
      element_out: 10,
      element_in_cost: 110,
      element_out_cost: 105,
    },
  ],
  picks: {
    active_chip: null,
    entry_history: {
      bank: 14,
      value: 1012,
      event_transfers: 1,
      event_transfers_cost: 4,
      points_on_bench: 6,
      points: 64,
      total_points: 612,
      overall_rank: 121482,
      rank: 121482,
    },
    picks: [
      {
        element: 11,
        position: 1,
        multiplier: 1,
        is_captain: true,
        is_vice_captain: false,
        selling_price: 110,
        purchase_price: 108,
      },
      {
        element: 10,
        position: 12,
        multiplier: 0,
        is_captain: false,
        is_vice_captain: true,
        selling_price: 105,
        purchase_price: 103,
      },
    ],
  },
}));

const loginMock = vi.fn(async () => undefined);

vi.mock("../src/my-team/fplSessionClient.js", () => ({
  FplSessionClient: vi.fn().mockImplementation(() => ({
    login: loginMock,
    getMe: async () => sessionFixtures.me,
    getEntry: async () => sessionFixtures.entry,
    getEntryHistory: async () => sessionFixtures.history,
    getTransfers: async () => sessionFixtures.transfers,
    getEventPicks: async () => sessionFixtures.picks,
    getEntryIdFromMyTeamPage: async () => null,
    getEntryResolutionDiagnostics: () => "none",
  })),
}));

function now() {
  return new Date().toISOString();
}

function seedPublicData(db: ReturnType<typeof createDatabase>) {
  db.prepare(
    `INSERT INTO positions (id, name, short_name, updated_at) VALUES
      (3, 'Midfielder', 'MID', ?),
      (4, 'Forward', 'FWD', ?)`,
  ).run(now(), now());

  db.prepare(
    `INSERT INTO teams (id, code, name, short_name, strength, updated_at) VALUES
      (1, 3, 'Arsenal', 'ARS', 5, ?),
      (2, 14, 'Liverpool', 'LIV', 5, ?)`,
  ).run(now(), now());

  const insertPlayer = db.prepare(
    `INSERT INTO players (
      id, code, web_name, first_name, second_name, team_id, position_id, now_cost, total_points,
      form, selected_by_percent, points_per_game, goals_scored, assists, clean_sheets, minutes,
      bonus, bps, creativity, influence, threat, ict_index, expected_goals, expected_assists,
      expected_goal_involvements, expected_goal_performance, expected_assist_performance,
      expected_goal_involvement_performance, expected_goals_conceded, clean_sheets_per_90, starts,
      tackles, recoveries, defensive_contribution, photo, team_code, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  insertPlayer.run(
    10, 10010, "Saka", "Bukayo", "Saka", 1, 3, 105, 215,
    7.8, 35.6, 6.1, 16, 12, 10, 2890,
    30, 620, 980.5, 1122.4, 901.7, 300.4, 14.6, 11.2,
    25.8, 1.4, 0.8, 2.2, 22.3, 0.31, 33,
    54, 146, 88, "10010.jpg", 3, "a", now(),
  );
  insertPlayer.run(
    11, 10011, "Salah", "Mohamed", "Salah", 2, 4, 110, 260,
    9.1, 45.1, 7.2, 22, 14, 11, 3000,
    36, 700, 1044.2, 1305.6, 1190.8, 354.1, 20.5, 12.9,
    33.4, 1.5, 1.1, 2.6, 19.8, 0.33, 35,
    38, 121, 79, "10011.jpg", 14, "a", now(),
  );
}

let tempDir = "";

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fpl-my-team-"));
  loginMock.mockClear();
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("My Team sync", () => {
  it("stores linked credentials, syncs account data, and exposes a queryable page payload", async () => {
    const db = createDatabase(path.join(tempDir, "test.sqlite"));
    seedPublicData(db);

    const service = new MyTeamSyncService(db);
    const accountId = service.linkAccount("ian@fpl.local", "super-secret");
    const result = await service.syncAccount(accountId, true);
    const payload = new QueryService(db).getMyTeam(accountId);

    expect(result).toMatchObject({
      accountId,
      entryId: 321,
      syncedGameweeks: 1,
      currentGameweek: 7,
    });
    expect(loginMock).toHaveBeenCalledWith("ian@fpl.local", "super-secret");
    expect(payload).not.toBeNull();
    expect(payload?.managerName).toBe("Ian Harper");
    expect(payload?.teamName).toBe("Midnight Press FC");
    expect(payload?.currentGameweek).toBe(7);
    expect(payload?.picks).toHaveLength(2);
    expect(payload?.picks[0]?.player.webName).toBe("Salah");
    expect(payload?.transfers[0]?.playerOut.webName).toBe("Saka");
    expect(payload?.seasons[0]?.season).toBe("2025/26");
  });

  it("serves the linked-account flow through the API routes", async () => {
    const db = createDatabase(path.join(tempDir, "test.sqlite"));
    seedPublicData(db);

    const app = createApp(db);
    const response = await request(app)
      .post("/api/my-team/auth")
      .send({ email: "ian@fpl.local", password: "super-secret" })
      .expect(201);

    expect(response.body.teamName).toBe("Midnight Press FC");
    expect(response.body.accounts).toHaveLength(1);
    expect(response.body.accounts[0].authStatus).toBe("authenticated");

    const myTeam = await request(app).get("/api/my-team").expect(200);
    expect(myTeam.body.managerName).toBe("Ian Harper");
    expect(myTeam.body.picks[0].player.webName).toBe("Salah");
  });

  it("marks the account as relogin-required when stored credentials stop working", async () => {
    const db = createDatabase(path.join(tempDir, "test.sqlite"));
    seedPublicData(db);

    const service = new MyTeamSyncService(db);
    const accountId = service.linkAccount("ian@fpl.local", "super-secret");
    await service.syncAccount(accountId, true);

    loginMock.mockRejectedValueOnce(
      new Error("FPL login failed. Check your email/password and try again."),
    );

    await expect(service.syncAccount(accountId, true)).rejects.toThrow("FPL login failed");

    const accounts = service.getAccounts() as Array<{ id: number; authStatus: string; authError: string | null }>;
    const account = accounts.find((candidate) => candidate.id === accountId);
    const payload = new QueryService(db).getMyTeam(accountId);

    expect(account?.authStatus).toBe("relogin_required");
    expect(account?.authError).toContain("FPL login failed");
    expect(payload?.picks[0]?.player.webName).toBe("Salah");
  });

  it("fails with a clear message when FPL returns no manager entry for a newly linked account", async () => {
    const db = createDatabase(path.join(tempDir, "test.sqlite"));
    seedPublicData(db);

    const service = new MyTeamSyncService(db);
    const accountId = service.linkAccount("ian@fpl.local", "super-secret");

    const originalPlayer = sessionFixtures.me.player;
    sessionFixtures.me.player = null;

    await expect(service.syncAccount(accountId, true)).rejects.toThrow("no FPL team entry ID");

    const accounts = service.getAccounts() as Array<{ id: number; authStatus: string; authError: string | null }>;
    const account = accounts.find((candidate) => candidate.id === accountId);
    expect(account?.authStatus).toBe("relogin_required");
    expect(account?.authError).toContain("no FPL team entry ID");

    sessionFixtures.me.player = originalPlayer;
  });

  it("falls back to the authenticated My Team page when /api/me omits the entry id", async () => {
    const db = createDatabase(path.join(tempDir, "test.sqlite"));
    seedPublicData(db);

    const service = new MyTeamSyncService(db);
    const accountId = service.linkAccount("ian@fpl.local", "super-secret");

    const originalPlayer = sessionFixtures.me.player;
    sessionFixtures.me.player = null;

    const originalImplementation = vi.mocked(await import("../src/my-team/fplSessionClient.js")).FplSessionClient;
    originalImplementation.mockImplementationOnce(() => ({
      login: loginMock,
      getMe: async () => sessionFixtures.me,
      getEntry: async () => sessionFixtures.entry,
      getEntryHistory: async () => sessionFixtures.history,
      getTransfers: async () => sessionFixtures.transfers,
      getEventPicks: async () => sessionFixtures.picks,
      getEntryIdFromMyTeamPage: async () => 321,
      getEntryResolutionDiagnostics: () => "none",
    }) as any);

    const result = await service.syncAccount(accountId, true);
    expect(result.entryId).toBe(321);

    sessionFixtures.me.player = originalPlayer;
  });

  it("uses a manually provided entry id during account linking when automatic discovery fails", async () => {
    const db = createDatabase(path.join(tempDir, "test.sqlite"));
    seedPublicData(db);

    const originalPlayer = sessionFixtures.me.player;
    sessionFixtures.me.player = null;

    const app = createApp(db);
    const response = await request(app)
      .post("/api/my-team/auth")
      .send({ email: "ian@fpl.local", password: "super-secret", entryId: 321 })
      .expect(201);

    expect(response.body.accounts[0].entryId).toBe(321);
    expect(response.body.teamName).toBe("Midnight Press FC");

    sessionFixtures.me.player = originalPlayer;
  });

  it("normalizes null rank values from FPL history instead of failing the sync", async () => {
    const db = createDatabase(path.join(tempDir, "test.sqlite"));
    seedPublicData(db);

    const service = new MyTeamSyncService(db);
    const accountId = service.linkAccount("ian@fpl.local", "super-secret");

    const originalCurrentRank = sessionFixtures.history.current[0].rank;
    const originalCurrentOverallRank = sessionFixtures.history.current[0].overall_rank;
    const originalPastRank = sessionFixtures.history.past[0].rank;
    const originalEntryHistoryRank = sessionFixtures.picks.entry_history.rank;
    const originalEntryHistoryOverallRank = sessionFixtures.picks.entry_history.overall_rank;

    sessionFixtures.history.current[0].rank = null;
    sessionFixtures.history.current[0].overall_rank = null;
    sessionFixtures.history.past[0].rank = null;
    sessionFixtures.picks.entry_history.rank = null;
    sessionFixtures.picks.entry_history.overall_rank = null;

    const result = await service.syncAccount(accountId, true);
    const payload = new QueryService(db).getMyTeam(accountId);

    expect(result.syncedGameweeks).toBe(1);
    expect(payload?.history[0]?.rank).toBe(0);
    expect(payload?.history[0]?.overallRank).toBe(0);
    expect(payload?.seasons[0]?.rank).toBe(0);
    expect(payload?.seasons[0]?.overallRank).toBe(0);

    sessionFixtures.history.current[0].rank = originalCurrentRank;
    sessionFixtures.history.current[0].overall_rank = originalCurrentOverallRank;
    sessionFixtures.history.past[0].rank = originalPastRank;
    sessionFixtures.picks.entry_history.rank = originalEntryHistoryRank;
    sessionFixtures.picks.entry_history.overall_rank = originalEntryHistoryOverallRank;
  });
});
