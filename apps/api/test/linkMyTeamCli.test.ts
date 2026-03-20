import { describe, expect, it } from "vitest";
import { parseLinkMyTeamArgs } from "../src/cli/linkMyTeam.js";

describe("parseLinkMyTeamArgs", () => {
  it("parses required credentials and optional entry id", () => {
    expect(
      parseLinkMyTeamArgs(["--email", "ian@fpl.local", "--password", "super-secret", "--entry", "321"]),
    ).toEqual({
      email: "ian@fpl.local",
      password: "super-secret",
      entryId: 321,
    });
  });

  it("accepts credentials without an entry id", () => {
    expect(parseLinkMyTeamArgs(["--email=ian@fpl.local", "--password=super-secret"])).toEqual({
      email: "ian@fpl.local",
      password: "super-secret",
      entryId: undefined,
    });
  });

  it("requires email and password", () => {
    expect(() => parseLinkMyTeamArgs(["--email", "ian@fpl.local"])).toThrow(
      "Both `--email` and `--password` are required.",
    );
  });
});
