import { describe, expect, it } from "vitest";
import type { GameweekSummary } from "@fpl/contracts";
import { makePlayer } from "../test/factories";
import {
  buildPlayersSearchParams,
  countActiveAdvancedFilters,
  filterAndSortPlayers,
  getDefaultGameweekRange,
  getPlayerColumnValue,
} from "./playersPageUtils";

describe("playersPageUtils", () => {
  it("counts active advanced filters consistently", () => {
    expect(
      countActiveAdvancedFilters({
        team: "all",
        statusFilter: "a",
        minPrice: "6.5",
        maxPrice: "",
        minMinutes: "900",
      }),
    ).toBe(3);
  });

  it("returns default gameweek bounds from the first and current finished window", () => {
    const gameweeks: GameweekSummary[] = [
      {
        id: 1,
        name: "GW1",
        deadlineTime: "2026-08-01T10:00:00Z",
        averageEntryScore: 50,
        highestScore: 100,
        isCurrent: false,
        isFinished: true,
      },
      {
        id: 2,
        name: "GW2",
        deadlineTime: "2026-08-08T10:00:00Z",
        averageEntryScore: 60,
        highestScore: 110,
        isCurrent: true,
        isFinished: false,
      },
    ];

    expect(getDefaultGameweekRange(gameweeks)).toEqual({ fromGW: "1", toGW: "2" });
  });

  it("filters and sorts players using numeric thresholds and computed columns", () => {
    const players = [
      makePlayer(1, 3, 1, 120, { status: "a", nowCost: 75, minutes: 1200, goalsScored: 8, assists: 10 }),
      makePlayer(2, 3, 1, 140, { status: "d", nowCost: 90, minutes: 800, goalsScored: 12, assists: 4 }),
      makePlayer(3, 4, 2, 160, { status: "a", nowCost: 85, minutes: 1400, goalsScored: 11, assists: 3 }),
    ];

    const filtered = filterAndSortPlayers(
      players,
      { statusFilter: "a", minPrice: "8.0", maxPrice: "9.0", minMinutes: "1000" },
      { key: "gi", dir: "desc" },
    );

    expect(filtered.map((player) => player.id)).toEqual([3]);
    expect(getPlayerColumnValue(players[0], "gi")).toBe(18);
  });

  it("builds URL params without default values", () => {
    const params = buildPlayersSearchParams({
      search: "saka",
      position: "3",
      team: "all",
      statusFilter: "all",
      minPrice: "",
      maxPrice: "",
      minMinutes: "",
      fromGW: "1",
      toGW: "5",
      sortCol: "totalPoints",
      sortDir: "desc",
    });

    expect(params.toString()).toBe("q=saka&position=3&fromGW=1&toGW=5");
  });
});
