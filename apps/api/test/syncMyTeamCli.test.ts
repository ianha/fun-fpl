import { describe, expect, it } from "vitest";
import { parseSyncMyTeamArgs } from "../src/cli/syncMyTeam.js";

describe("parseSyncMyTeamArgs", () => {
  it("parses a targeted account sync", () => {
    expect(parseSyncMyTeamArgs(["--account", "3", "--gameweek", "29", "--force"])).toEqual({
      force: true,
      gameweek: 29,
      accountId: 3,
      email: undefined,
    });
  });

  it("parses an email-targeted sync", () => {
    expect(parseSyncMyTeamArgs(["--email=ian@fpl.local"])).toEqual({
      force: false,
      gameweek: undefined,
      accountId: undefined,
      email: "ian@fpl.local",
    });
  });

  it("rejects conflicting account selectors", () => {
    expect(() => parseSyncMyTeamArgs(["--account", "3", "--email", "ian@fpl.local"])).toThrow(
      "Use either `--account` or `--email`, not both.",
    );
  });
});
