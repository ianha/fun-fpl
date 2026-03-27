import { describe, expect, it } from "vitest";
import { parseSyncArgs } from "../src/cli/sync.js";

describe("parseSyncArgs", () => {
  it("parses a targeted gameweek sync with force", () => {
    expect(parseSyncArgs(["--gameweek", "29", "--force"])).toEqual({
      gameweek: 29,
      playerId: undefined,
      force: true,
    });
  });

  it("parses a targeted player sync with an inline gameweek", () => {
    expect(parseSyncArgs(["--player=101", "--gameweek=30"])).toEqual({
      gameweek: 30,
      playerId: 101,
      force: false,
    });
  });

  it("rejects invalid gameweek values", () => {
    expect(() => parseSyncArgs(["--gameweek", "0"])).toThrow(
      "`--gameweek` must be followed by a positive integer.",
    );
  });
});
