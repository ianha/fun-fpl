import { describe, expect, it } from "vitest";
import type { GameweekSummary } from "@fpl/contracts";
import {
  buildFixturesSearchParams,
  getDefaultFixtureGameweek,
  getFixturesCacheKey,
  parseNullableNumber,
} from "./fixturesPageUtils";

describe("fixturesPageUtils", () => {
  it("parses optional numbers safely", () => {
    expect(parseNullableNumber("12")).toBe(12);
    expect(parseNullableNumber("")).toBeNull();
    expect(parseNullableNumber("oops")).toBeNull();
  });

  it("builds stable cache keys and search params", () => {
    expect(getFixturesCacheKey(7, 12)).toBe("7-12");
    expect(buildFixturesSearchParams(7, null).toString()).toBe("gw=7");
  });

  it("prefers the current gameweek when choosing defaults", () => {
    const gameweeks: GameweekSummary[] = [
      {
        id: 6,
        name: "GW6",
        deadlineTime: "2026-09-06T10:00:00Z",
        averageEntryScore: 54,
        highestScore: 100,
        isCurrent: false,
        isFinished: true,
      },
      {
        id: 7,
        name: "GW7",
        deadlineTime: "2026-09-13T10:00:00Z",
        averageEntryScore: null,
        highestScore: null,
        isCurrent: true,
        isFinished: false,
      },
    ];

    expect(getDefaultFixtureGameweek(gameweeks)).toBe(7);
  });
});
