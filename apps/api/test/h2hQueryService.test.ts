import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/database.js";
import { H2HQueryService } from "../src/services/h2hQueryService.js";
import { seedH2HComparisonData } from "./h2hFixtures.js";

const tempDirs: string[] = [];

function makeDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fpl-h2h-query-"));
  tempDirs.push(dir);
  return path.join(dir, "test.sqlite");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("H2HQueryService", () => {
  it("returns overlap, differential players, and rank history for a synced rival", () => {
    const db = createDatabase(makeDbPath());
    seedH2HComparisonData(db);

    const service = new H2HQueryService(db);
    const response = service.getH2HComparison(1, 99, 501);

    expect(response.syncRequired).toBe(false);
    expect(response.rivalEntry).toMatchObject({
      entryId: 501,
      playerName: "Brad",
      teamName: "Brad FC",
    });
    expect(response.squadOverlap).toMatchObject({
      gameweek: 2,
      overlapPct: 93.3,
    });
    expect(response.squadOverlap?.sharedPlayers).toHaveLength(14);
    expect(response.squadOverlap?.userOnlyPlayers.map((player) => player.webName)).toEqual(["Isak"]);
    expect(response.squadOverlap?.rivalOnlyPlayers.map((player) => player.webName)).toEqual(["Palmer"]);
    expect(response.gmRankHistory).toEqual([
      { gameweek: 1, userOverallRank: 120000, rivalOverallRank: 130000 },
      { gameweek: 2, userOverallRank: 90000, rivalOverallRank: 98000 },
    ]);
  });

  it("returns syncRequired when rival comparison data has not been synced yet", () => {
    const db = createDatabase(makeDbPath());
    seedH2HComparisonData(db);
    db.prepare("DELETE FROM rival_picks WHERE entry_id = ?").run(501);
    db.prepare("DELETE FROM rival_gameweeks WHERE entry_id = ?").run(501);

    const service = new H2HQueryService(db);
    const response = service.getH2HComparison(1, 99, 501);

    expect(response).toEqual({
      syncRequired: true,
      rivalEntry: {
        entryId: 501,
        playerName: "Brad",
        teamName: "Brad FC",
        rank: 1,
        totalPoints: 130,
      },
      squadOverlap: null,
      gmRankHistory: [],
    });
  });
});
