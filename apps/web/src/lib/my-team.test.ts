import { describe, expect, it } from "vitest";
import type { GameweekSummary, PlayerCard } from "@fpl/contracts";
import { createMockManagers, evaluatePlanner, replaceSquadPlayer } from "./my-team";

function makePlayer(id: number, positionId: number, teamId: number, totalPoints: number): PlayerCard {
  return {
    id,
    webName: `Player ${id}`,
    firstName: "Player",
    secondName: String(id),
    teamId,
    teamName: `Team ${teamId}`,
    teamShortName: `T${teamId}`,
    imagePath: null,
    positionId,
    positionName: ["", "Goalkeeper", "Defender", "Midfielder", "Forward"][positionId],
    nowCost: 45 + id,
    totalPoints,
    form: 5 + (id % 4),
    selectedByPercent: 10 + id,
    pointsPerGame: 4.5,
    goalsScored: positionId === 4 ? 10 : 3,
    assists: positionId === 3 ? 8 : 2,
    cleanSheets: positionId < 3 ? 8 : 3,
    minutes: 900 + id,
    bonus: 10,
    bps: 100,
    creativity: 30,
    influence: 30,
    threat: 30,
    ictIndex: 30,
    expectedGoals: 5,
    expectedAssists: 4,
    expectedGoalInvolvements: 9,
    expectedGoalPerformance: 1,
    expectedAssistPerformance: 1,
    expectedGoalInvolvementPerformance: 2,
    expectedGoalsConceded: 8,
    cleanSheetsPer90: 0.2,
    starts: 10,
    tackles: 8,
    recoveries: 12,
    defensiveContribution: 9,
    status: "a",
  };
}

const players = [
  ...Array.from({ length: 4 }, (_, index) => makePlayer(index + 1, 1, index + 1, 100 - index)),
  ...Array.from({ length: 8 }, (_, index) => makePlayer(index + 10, 2, (index % 5) + 1, 120 - index)),
  ...Array.from({ length: 8 }, (_, index) => makePlayer(index + 30, 3, (index % 5) + 1, 140 - index)),
  ...Array.from({ length: 5 }, (_, index) => makePlayer(index + 50, 4, (index % 5) + 1, 160 - index)),
];

const gameweeks: GameweekSummary[] = [
  {
    id: 7,
    name: "Gameweek 7",
    deadlineTime: "2026-09-20T10:30:00Z",
    averageEntryScore: 58,
    highestScore: 113,
    isCurrent: true,
    isFinished: false,
  },
];

describe("my-team planner utilities", () => {
  it("creates managers with a legal 15-player squad", () => {
    const [manager] = createMockManagers(players, gameweeks);

    expect(manager.squad).toHaveLength(15);
    expect(manager.squad.filter((entry) => entry.player.positionId === 1)).toHaveLength(2);
    expect(manager.squad.filter((entry) => entry.player.positionId === 2)).toHaveLength(5);
    expect(manager.squad.filter((entry) => entry.player.positionId === 3)).toHaveLength(5);
    expect(manager.squad.filter((entry) => entry.player.positionId === 4)).toHaveLength(3);
    expect(manager.squad.filter((entry) => entry.isCaptain)).toHaveLength(1);
    expect(manager.squad.filter((entry) => entry.isViceCaptain)).toHaveLength(1);
  });

  it("flags an over-budget transfer as invalid", () => {
    const [manager] = createMockManagers(players, gameweeks);
    const defender = manager.squad.find((entry) => entry.player.positionId === 2);
    const expensiveDefender = makePlayer(999, 2, 9, 500);
    expensiveDefender.nowCost = 250;

    const workingSquad = replaceSquadPlayer(manager.squad, defender!.slotId, expensiveDefender);
    const evaluation = evaluatePlanner(
      manager.squad,
      workingSquad,
      0,
      manager.freeTransfers,
      manager.currentGameweek,
      manager.currentGameweek,
      "none",
    );

    expect(evaluation.isValid).toBe(false);
    expect(evaluation.warnings.some((warning) => warning.includes("Budget exceeded"))).toBe(true);
  });

  it("treats wildcard planning as hit-free", () => {
    const [manager] = createMockManagers(players, gameweeks);
    const midfielders = manager.squad.filter((entry) => entry.player.positionId === 3).slice(0, 2);
    const candidateA = makePlayer(700, 3, 6, 180);
    const candidateB = makePlayer(701, 3, 7, 179);
    let workingSquad = replaceSquadPlayer(manager.squad, midfielders[0].slotId, candidateA);
    workingSquad = replaceSquadPlayer(workingSquad, midfielders[1].slotId, candidateB);

    const evaluation = evaluatePlanner(
      manager.squad,
      workingSquad,
      manager.bank,
      1,
      manager.currentGameweek,
      manager.currentGameweek,
      "wildcard",
    );

    expect(evaluation.transferCount).toBe(2);
    expect(evaluation.hitCost).toBe(0);
  });
});
