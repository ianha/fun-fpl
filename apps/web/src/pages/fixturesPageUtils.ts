import type { GameweekSummary } from "@fpl/contracts";

export function parseNullableNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getFixturesCacheKey(gameweek: number | null, team: number | null): string {
  return `${gameweek ?? ""}-${team ?? ""}`;
}

export function getDefaultFixtureGameweek(gameweeks: GameweekSummary[]): number | null {
  const gameweek =
    gameweeks.find((candidate) => candidate.isCurrent) ??
    gameweeks.find((candidate) => !candidate.isFinished) ??
    gameweeks[0];

  return gameweek?.id ?? null;
}

export function buildFixturesSearchParams(
  gameweek: number | null,
  team: number | null,
): URLSearchParams {
  const params = new URLSearchParams();
  if (gameweek !== null) params.set("gw", String(gameweek));
  if (team !== null) params.set("team", String(team));
  return params;
}
