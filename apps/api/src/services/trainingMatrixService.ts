import type { AppDatabase } from "../db/database.js";

export type TrainingMatrixRow = {
  playerId: number;
  webName: string;
  positionId: number;
  targetGameweek: number;
  opponentTeamId: number;
  kickoffTime: string;
  wasHome: boolean;
  opponentStrength: number;
  actualPoints: number;
  rollingMinutes: number;
  rollingStarts: number;
  rollingXg: number;
  rollingXa: number;
  rollingXgc: number;
  rollingBps: number;
  rollingBonus: number;
  rollingCs: number;
  rollingSaves: number;
  matchesInLookback: number;
};

type TrainingMatrixSqlRow = {
  playerId: number;
  webName: string;
  positionId: number;
  targetGameweek: number;
  opponentTeamId: number;
  kickoffTime: string;
  wasHome: number;
  opponentStrength: number;
  actualPoints: number;
  rollingMinutes: number;
  rollingStarts: number;
  rollingXg: number;
  rollingXa: number;
  rollingXgc: number;
  rollingBps: number;
  rollingBonus: number;
  rollingCs: number;
  rollingSaves: number;
  matchesInLookback: number;
};

export class TrainingMatrixService {
  constructor(private readonly db: AppDatabase) {}

  getTrainingMatrix(input: {
    targetGameweek: number;
    lookbackWindow?: number;
  }): TrainingMatrixRow[] {
    const targetGameweek = input.targetGameweek;
    const lookbackWindow = input.lookbackWindow ?? 5;

    if (!Number.isInteger(targetGameweek) || targetGameweek <= 0) {
      throw new Error("targetGameweek must be a positive integer.");
    }

    if (!Number.isInteger(lookbackWindow) || lookbackWindow <= 0) {
      throw new Error("lookbackWindow must be a positive integer.");
    }

    const rows = this.db
      .prepare(
        `SELECT
           target_match.player_id AS playerId,
           p.web_name AS webName,
           p.position_id AS positionId,
           target_match.round AS targetGameweek,
           target_match.opponent_team AS opponentTeamId,
           target_match.kickoff_time AS kickoffTime,
           target_match.was_home AS wasHome,
           t.strength AS opponentStrength,
           target_match.total_points AS actualPoints,
           AVG(past_matches.minutes) AS rollingMinutes,
           AVG(past_matches.starts) AS rollingStarts,
           (SUM(past_matches.expected_goals) * 90.0) / NULLIF(SUM(past_matches.minutes), 0) AS rollingXg,
           (SUM(past_matches.expected_assists) * 90.0) / NULLIF(SUM(past_matches.minutes), 0) AS rollingXa,
           (SUM(past_matches.expected_goals_conceded) * 90.0) / NULLIF(SUM(past_matches.minutes), 0) AS rollingXgc,
           (SUM(past_matches.bps) * 90.0) / NULLIF(SUM(past_matches.minutes), 0) AS rollingBps,
           (SUM(past_matches.bonus) * 90.0) / NULLIF(SUM(past_matches.minutes), 0) AS rollingBonus,
           (SUM(past_matches.clean_sheets) * 90.0) / NULLIF(SUM(past_matches.minutes), 0) AS rollingCs,
           (SUM(past_matches.saves) * 90.0) / NULLIF(SUM(past_matches.minutes), 0) AS rollingSaves,
           COUNT(past_matches.kickoff_time) AS matchesInLookback
         FROM player_history target_match
         JOIN players p
           ON p.id = target_match.player_id
         JOIN teams t
           ON t.id = target_match.opponent_team
         LEFT JOIN player_history past_matches
           ON past_matches.player_id = target_match.player_id
          AND past_matches.round >= (target_match.round - @lookbackWindow)
          AND past_matches.round < target_match.round
         WHERE target_match.round = @targetGameweek
         GROUP BY
           target_match.player_id,
           target_match.round,
           target_match.opponent_team,
           target_match.kickoff_time,
           p.web_name,
           p.position_id,
           target_match.was_home,
           t.strength,
           target_match.total_points
         HAVING matchesInLookback > 0
         ORDER BY target_match.player_id, target_match.kickoff_time`,
      )
      .all({
        targetGameweek,
        lookbackWindow,
      }) as TrainingMatrixSqlRow[];

    return rows.map((row) => ({
      playerId: row.playerId,
      webName: row.webName,
      positionId: row.positionId,
      targetGameweek: row.targetGameweek,
      opponentTeamId: row.opponentTeamId,
      kickoffTime: row.kickoffTime,
      wasHome: Boolean(row.wasHome),
      opponentStrength: Number(row.opponentStrength),
      actualPoints: Number(row.actualPoints),
      rollingMinutes: Number(row.rollingMinutes),
      rollingStarts: Number(row.rollingStarts),
      rollingXg: Number(row.rollingXg),
      rollingXa: Number(row.rollingXa),
      rollingXgc: Number(row.rollingXgc),
      rollingBps: Number(row.rollingBps),
      rollingBonus: Number(row.rollingBonus),
      rollingCs: Number(row.rollingCs),
      rollingSaves: Number(row.rollingSaves),
      matchesInLookback: Number(row.matchesInLookback),
    }));
  }
}
