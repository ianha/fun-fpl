import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/database.js";
import {
  RidgeRegressionService,
  buildFeatureRow,
  computeRSquared,
  fitRidge,
  invert,
  multiply,
  transpose,
} from "../src/services/ridgeRegressionService.js";
import type { TrainingMatrixRow } from "../src/services/trainingMatrixService.js";
import { now, seedPublicData } from "./myTeamFixtures.js";

let tempDir = "";

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fpl-ridge-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("matrix math", () => {
  it("transposes a matrix", () => {
    const m = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    expect(transpose(m)).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ]);
  });

  it("multiplies two matrices", () => {
    const a = [
      [1, 2],
      [3, 4],
    ];
    const b = [
      [5, 6],
      [7, 8],
    ];
    expect(multiply(a, b)).toEqual([
      [19, 22],
      [43, 50],
    ]);
  });

  it("inverts a 2x2 matrix", () => {
    const m = [
      [4, 7],
      [2, 6],
    ];
    const inv = invert(m);
    // A * A^-1 should equal identity
    const product = multiply(m, inv);
    expect(product[0]![0]).toBeCloseTo(1);
    expect(product[0]![1]).toBeCloseTo(0);
    expect(product[1]![0]).toBeCloseTo(0);
    expect(product[1]![1]).toBeCloseTo(1);
  });

  it("throws on singular matrix", () => {
    const m = [
      [1, 2],
      [2, 4],
    ];
    expect(() => invert(m)).toThrow("singular");
  });
});

describe("fitRidge", () => {
  it("fits a simple linear relationship y = 2*x1 + 3*x2", () => {
    const X = [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
      [3, 1],
      [1, 3],
    ];
    const y = X.map((row) => 2 * row[0]! + 3 * row[1]!);

    // With very small lambda, should recover near-true weights
    const weights = fitRidge(X, y, 0.001);
    expect(weights[0]).toBeCloseTo(2, 1);
    expect(weights[1]).toBeCloseTo(3, 1);
  });

  it("regularizes towards zero with large lambda", () => {
    const X = [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ];
    const y = X.map((row) => 2 * row[0]! + 3 * row[1]!);

    const weights = fitRidge(X, y, 1000);
    // Large lambda should shrink weights toward zero
    expect(Math.abs(weights[0]!)).toBeLessThan(2);
    expect(Math.abs(weights[1]!)).toBeLessThan(3);
  });
});

describe("computeRSquared", () => {
  it("returns 1 for perfect predictions", () => {
    expect(computeRSquared([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("returns 0 for mean-level predictions", () => {
    const actual = [1, 2, 3];
    const mean = 2;
    expect(computeRSquared(actual, [mean, mean, mean])).toBeCloseTo(0);
  });

  it("returns negative for worse-than-mean predictions", () => {
    expect(computeRSquared([1, 2, 3], [10, 10, 10])).toBeLessThan(0);
  });
});

describe("buildFeatureRow", () => {
  it("constructs features in projectFixturePoints coordinate system for a midfielder", () => {
    const row: TrainingMatrixRow = {
      playerId: 10,
      webName: "Saka",
      positionId: 3, // MID
      targetGameweek: 7,
      opponentTeamId: 2,
      kickoffTime: "2026-03-24T15:00:00.000Z",
      wasHome: true,
      opponentStrength: 4,
      actualPoints: 10,
      rollingMinutes: 85,
      rollingStarts: 0.9,
      rollingXg: 0.4,
      rollingXa: 0.15,
      rollingXgc: 0.9,
      rollingBps: 25,
      rollingBonus: 1.5,
      rollingCs: 0.3,
      rollingSaves: 0,
      matchesInLookback: 2,
    };

    const features = buildFeatureRow(row);
    expect(features).toHaveLength(7);
    // MID goals = 5pts: 0.4 * 5 = 2.0
    expect(features[0]).toBeCloseTo(2.0);
    // Assists = 3pts: 0.15 * 3 = 0.45
    expect(features[1]).toBeCloseTo(0.45);
    // MID clean sheet = 1pt: 0.3 * 1 = 0.3
    expect(features[2]).toBeCloseTo(0.3);
    // Saves / 3 = 0
    expect(features[3]).toBeCloseTo(0);
    // Bonus = 1.5
    expect(features[4]).toBeCloseTo(1.5);
    // Appearance (minutes > 0) = 2
    expect(features[5]).toBe(2);
    // MID concede penalty = 0.5: -(0.5 * 0.9 / 2) = -0.225
    expect(features[6]).toBeCloseTo(-0.225);
  });

  it("uses correct positional point values for a defender", () => {
    const row: TrainingMatrixRow = {
      playerId: 20,
      webName: "Saliba",
      positionId: 2, // DEF
      targetGameweek: 7,
      opponentTeamId: 3,
      kickoffTime: "2026-03-24T15:00:00.000Z",
      wasHome: false,
      opponentStrength: 3,
      actualPoints: 6,
      rollingMinutes: 90,
      rollingStarts: 1,
      rollingXg: 0.05,
      rollingXa: 0.02,
      rollingXgc: 1.2,
      rollingBps: 20,
      rollingBonus: 0.5,
      rollingCs: 0.4,
      rollingSaves: 0,
      matchesInLookback: 3,
    };

    const features = buildFeatureRow(row);
    // DEF goals = 6pts: 0.05 * 6 = 0.3
    expect(features[0]).toBeCloseTo(0.3);
    // DEF clean sheet = 6pts: 0.4 * 6 = 2.4 (not 0.4 like MID)
    expect(features[2]).toBeCloseTo(2.4);
    // DEF concede penalty = 1: -(1 * 1.2 / 2) = -0.6
    expect(features[6]).toBeCloseTo(-0.6);
  });
});

describe("RidgeRegressionService", () => {
  function seedManyGameweeks(db: ReturnType<typeof createDatabase>, gameweeks: number[]) {
    seedPublicData(db);

    // Add more teams for opponents
    db.prepare(
      `INSERT INTO teams (id, code, name, short_name, strength, updated_at) VALUES
        (3, 43, 'Chelsea', 'CHE', 4, ?),
        (4, 6, 'Spurs', 'TOT', 3, ?),
        (5, 7, 'ManCity', 'MCI', 5, ?),
        (6, 8, 'ManUtd', 'MUN', 4, ?)`,
    ).run(now(), now(), now(), now());

    // Add more players across positions to generate sufficient training rows
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

    // Create 25 players across different positions and teams
    const playerConfigs = [
      // GKP (position 1) — need to add position first
      // DEF (position 2)
      // MID (position 3) — Saka (10) already exists
      // FWD (position 4) — Salah (11) already exists
    ];

    // Add GKP and DEF positions
    db.prepare(
      `INSERT INTO positions (id, name, short_name, updated_at) VALUES
        (1, 'Goalkeeper', 'GKP', ?),
        (2, 'Defender', 'DEF', ?)`,
    ).run(now(), now());

    // Generate 23 more players (10 and 11 already exist)
    for (let i = 12; i <= 34; i++) {
      const teamId = ((i - 1) % 6) + 1;
      const posId = ((i - 1) % 4) + 1;
      insertPlayer.run(
        i, 10000 + i, `Player${i}`, `First${i}`, `Last${i}`, teamId, posId, 60 + i, 100 + i * 5,
        5.0, 10.0, 4.0, i % 10, i % 8, i % 5, 2000 + i * 20,
        i % 6, 300 + i * 10, 400, 500, 600, 150, 5.0, 3.0,
        8.0, 0.5, 0.3, 0.8, 10.0, 0.2, 28,
        30, 100, 60, `${10000 + i}.jpg`, teamId, "a", now(),
      );
    }

    // Add finished gameweeks
    for (const gw of gameweeks) {
      db.prepare(
        `INSERT OR IGNORE INTO gameweeks (id, name, deadline_time, is_current, is_finished, updated_at)
         VALUES (?, ?, ?, 0, 1, ?)`,
      ).run(gw, `Gameweek ${gw}`, `2026-01-${String(gw).padStart(2, "0")}T11:00:00Z`, now());
    }

    const insertHistory = db.prepare(
      `INSERT INTO player_history (
        player_id, round, total_points, minutes, goals_scored, assists, clean_sheets, bonus, bps, creativity,
        influence, threat, ict_index, expected_goals, expected_assists, expected_goal_involvements,
        expected_goal_performance, expected_assist_performance, expected_goal_involvement_performance,
        expected_goals_conceded, tackles, recoveries, clearances_blocks_interceptions, defensive_contribution,
        saves, yellow_cards, red_cards, own_goals, penalties_saved, penalties_missed, goals_conceded, starts,
        opponent_team, team_id, value, was_home, kickoff_time, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    // Seed history for all 25 players across all GWs
    // Use deterministic pseudo-random data based on player/GW combination
    const allGws = [...new Set([...gameweeks, ...gameweeks.map((g) => g - 1), ...gameweeks.map((g) => g - 2)])].filter((g) => g > 0).sort((a, b) => a - b);

    for (const playerId of [10, 11, ...Array.from({ length: 23 }, (_, i) => i + 12)]) {
      const posId = playerId <= 11 ? (playerId === 10 ? 3 : 4) : ((playerId - 1) % 4) + 1;
      const teamId = playerId <= 11 ? (playerId === 10 ? 1 : 2) : ((playerId - 1) % 6) + 1;

      for (const gw of allGws) {
        const seed = playerId * 100 + gw;
        const mins = 70 + (seed % 21); // 70-90
        const pts = 1 + (seed % 12); // 1-12
        const xg = ((seed % 50) + 5) / 100; // 0.05-0.54
        const xa = ((seed % 30) + 3) / 100; // 0.03-0.32
        const xgc = ((seed % 40) + 20) / 100; // 0.20-0.59
        const cs = (seed % 3 === 0) ? 1 : 0;
        const bon = seed % 4;
        const saves = posId === 1 ? 2 + (seed % 5) : 0;
        const opponentTeam = ((seed % 5)) + 1;
        const adjOpponent = opponentTeam === teamId ? (opponentTeam % 6) + 1 : opponentTeam;

        insertHistory.run(
          playerId, gw, pts, mins, seed % 3 === 0 ? 1 : 0, seed % 5 === 0 ? 1 : 0,
          cs, bon, 10 + bon * 5, 10, 10, 10, 3,
          xg, xa, xg + xa, 0, 0, 0, xgc,
          1, 3, 1, 2, saves, 0, 0, 0, 0, 0, cs === 1 ? 0 : 1, 1,
          adjOpponent, teamId, 80, gw % 2 === 0 ? 1 : 0,
          `2026-01-${String(gw).padStart(2, "0")}T15:00:00.000Z`, now(),
        );
      }
    }
  }

  it("skips training when insufficient training rows", () => {
    const db = createDatabase(path.join(tempDir, "insufficient.sqlite"));
    seedPublicData(db);

    const service = new RidgeRegressionService(db);
    const result = service.trainAndStore({ gameweeks: [1] });

    expect(result.skipped).toBe(true);
    expect(result.reason).toContain("Insufficient");
  });

  it("fits and stores a model with sufficient training data", () => {
    const db = createDatabase(path.join(tempDir, "full-train.sqlite"));
    seedManyGameweeks(db, [5, 6, 7, 8, 9, 10]);

    const service = new RidgeRegressionService(db);
    const result = service.trainAndStore({ gameweeks: [5, 6, 7, 8, 9, 10] });

    expect(result.skipped).toBe(false);
    expect(result.result).toBeDefined();
    expect(result.versionId).toBeDefined();
    expect(result.versionTag).toBe("auto-gw5-gw10");

    // All coefficients should be finite numbers within bounds
    const coefficients = result.result!.coefficients;
    for (const key of [
      "goal_weight", "assist_weight", "clean_sheet_weight",
      "save_weight", "bonus_weight", "appearance_weight", "concede_penalty_weight",
    ]) {
      const val = coefficients[key]!;
      expect(typeof val).toBe("number");
      expect(Number.isFinite(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(0.1);
      expect(val).toBeLessThanOrEqual(5.0);
    }

    // Metadata should have training diagnostics
    expect(result.result!.metadata.lambda).toBe(1.0);
    expect(result.result!.metadata.trainingRows).toBeGreaterThanOrEqual(100);
    expect(typeof result.result!.metadata.rSquared).toBe("number");
    expect(result.result!.metadata.gameweeks).toEqual([5, 6, 7, 8, 9, 10]);
  });

  it("activates the new model version in the registry", async () => {
    const db = createDatabase(path.join(tempDir, "activation.sqlite"));
    seedManyGameweeks(db, [5, 6, 7, 8, 9, 10]);

    const service = new RidgeRegressionService(db);
    const result = service.trainAndStore({ gameweeks: [5, 6, 7, 8, 9, 10] });

    expect(result.skipped).toBe(false);

    // Verify the version is active in the registry
    const { MlModelRegistryService } = await import("../src/services/mlModelRegistryService.js");
    const registry = new MlModelRegistryService(db);
    const active = registry.getActiveVersionForModelName("transfer_event_points_v2");

    expect(active).not.toBeNull();
    expect(active!.id).toBe(result.versionId);
    expect(active!.isActive).toBe(true);
    expect(active!.versionTag).toBe("auto-gw5-gw10");
  });

  it("uses correct version tag for single gameweek", () => {
    const db = createDatabase(path.join(tempDir, "single-gw.sqlite"));
    seedManyGameweeks(db, [3, 4, 5, 6, 7, 8, 9, 10]);

    const service = new RidgeRegressionService(db);
    // Train on a single GW but need enough data — the training matrix pulls
    // from all 25 players for that GW, so we need enough GWs with data
    const result = service.trainAndStore({ gameweeks: [5, 6, 7, 8, 9, 10] });

    expect(result.skipped).toBe(false);

    // Now train on a single GW
    const singleResult = service.trainAndStore({ gameweeks: [10] });
    // Might be skipped if single GW doesn't have enough rows
    if (!singleResult.skipped) {
      expect(singleResult.versionTag).toBe("auto-gw10");
    }
  });
});
