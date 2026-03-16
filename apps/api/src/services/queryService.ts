import type {
  FixtureCard,
  GameweekSummary,
  OverviewResponse,
  PlayerCard,
  PlayerDetail,
  PlayerHistoryPoint,
  TeamSummary,
} from "@fpl/contracts";
import type { AppDatabase } from "../db/database.js";

type PlayerQuery = {
  search?: string;
  team?: number;
  position?: number;
  sort?: string;
  fromGW?: number;
  toGW?: number;
};

function mapBoolean(value: number) {
  return Boolean(value);
}

export class QueryService {
  constructor(private readonly db: AppDatabase) {}

  getGameweeks(): GameweekSummary[] {
    return this.db
      .prepare(
        `SELECT id, name, deadline_time AS deadlineTime, average_entry_score AS averageEntryScore,
                highest_score AS highestScore, is_current AS isCurrent, is_finished AS isFinished
         FROM gameweeks
         ORDER BY id`,
      )
      .all()
      .map((row: any) => ({
        ...row,
        isCurrent: mapBoolean(row.isCurrent),
        isFinished: mapBoolean(row.isFinished),
      }));
  }

  getTeams(): TeamSummary[] {
    return this.db
      .prepare(
        `SELECT id, name, short_name AS shortName, strength
                , image_path AS imagePath
         FROM teams
         ORDER BY name`,
      )
      .all() as TeamSummary[];
  }

  getFixtures(eventId?: number, teamId?: number): FixtureCard[] {
    const filters = [];
    const params: Record<string, number> = {};

    if (eventId) {
      filters.push("f.event_id = @eventId");
      params.eventId = eventId;
    }

    if (teamId) {
      filters.push("(f.team_h = @teamId OR f.team_a = @teamId)");
      params.teamId = teamId;
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    return this.db
      .prepare(
        `SELECT f.id, f.code, f.event_id AS eventId, f.kickoff_time AS kickoffTime,
                f.team_h AS teamH, f.team_a AS teamA,
                th.name AS teamHName, ta.name AS teamAName,
                th.short_name AS teamHShortName, ta.short_name AS teamAShortName,
                f.team_h_score AS teamHScore, f.team_a_score AS teamAScore,
                f.finished, f.started
         FROM fixtures f
         JOIN teams th ON th.id = f.team_h
         JOIN teams ta ON ta.id = f.team_a
         ${where}
         ORDER BY COALESCE(f.event_id, 999), COALESCE(f.kickoff_time, '')`,
      )
      .all(params)
      .map((row: any) => ({
        ...row,
        finished: mapBoolean(row.finished),
        started: mapBoolean(row.started),
      }));
  }

  getPlayers(query: PlayerQuery): PlayerCard[] {
    const filters = [];
    const params: Record<string, string | number> = {};

    if (query.search) {
      filters.push("(LOWER(p.web_name) LIKE @search OR LOWER(p.first_name || ' ' || p.second_name) LIKE @search)");
      params.search = `%${query.search.toLowerCase()}%`;
    }

    if (query.team) {
      filters.push("p.team_id = @team");
      params.team = query.team;
    }

    if (query.position) {
      filters.push("p.position_id = @position");
      params.position = query.position;
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    // When a gameweek range is specified, aggregate per-GW history instead of using season totals
    if (query.fromGW !== undefined && query.toGW !== undefined) {
      params.fromGW = query.fromGW;
      params.toGW = query.toGW;
      return this.db
        .prepare(
          `SELECT p.id, p.web_name AS webName, p.first_name AS firstName, p.second_name AS secondName,
                  p.team_id AS teamId, t.name AS teamName, t.short_name AS teamShortName,
                  p.image_path AS imagePath,
                  p.position_id AS positionId, pos.name AS positionName,
                  p.now_cost AS nowCost, p.form,
                  p.selected_by_percent AS selectedByPercent, p.status,
                  COALESCE(SUM(ph.total_points), 0) AS totalPoints,
                  CASE WHEN COUNT(ph.round) > 0
                       THEN ROUND(CAST(SUM(ph.total_points) AS REAL) / COUNT(ph.round), 1)
                       ELSE 0 END AS pointsPerGame,
                  COALESCE(SUM(ph.goals_scored), 0) AS goalsScored,
                  COALESCE(SUM(ph.assists), 0) AS assists,
                  COALESCE(SUM(ph.clean_sheets), 0) AS cleanSheets,
                  COALESCE(SUM(ph.minutes), 0) AS minutes,
                  COALESCE(SUM(ph.bonus), 0) AS bonus,
                  COALESCE(SUM(ph.bps), 0) AS bps,
                  COALESCE(SUM(ph.creativity), 0) AS creativity,
                  COALESCE(SUM(ph.influence), 0) AS influence,
                  COALESCE(SUM(ph.threat), 0) AS threat,
                  COALESCE(SUM(ph.ict_index), 0) AS ictIndex,
                  COALESCE(SUM(ph.expected_goals), 0) AS expectedGoals,
                  COALESCE(SUM(ph.expected_assists), 0) AS expectedAssists,
                  COALESCE(SUM(ph.expected_goal_involvements), 0) AS expectedGoalInvolvements,
                  COALESCE(SUM(ph.expected_goal_performance), 0) AS expectedGoalPerformance,
                  COALESCE(SUM(ph.expected_assist_performance), 0) AS expectedAssistPerformance,
                  COALESCE(SUM(ph.expected_goal_involvement_performance), 0) AS expectedGoalInvolvementPerformance,
                  COALESCE(SUM(ph.expected_goals_conceded), 0) AS expectedGoalsConceded,
                  CASE WHEN SUM(ph.minutes) > 0
                       THEN ROUND(CAST(SUM(ph.clean_sheets) AS REAL) / (SUM(ph.minutes) / 90.0), 2)
                       ELSE 0 END AS cleanSheetsPer90,
                  COALESCE(SUM(ph.starts), 0) AS starts,
                  COALESCE(SUM(ph.tackles), 0) AS tackles,
                  COALESCE(SUM(ph.recoveries), 0) AS recoveries,
                  COALESCE(SUM(ph.defensive_contribution), 0) AS defensiveContribution
           FROM players p
           JOIN teams t ON t.id = p.team_id
           JOIN positions pos ON pos.id = p.position_id
           LEFT JOIN player_history ph ON ph.player_id = p.id
                                      AND ph.round >= @fromGW
                                      AND ph.round <= @toGW
           ${where}
           GROUP BY p.id
           ORDER BY COALESCE(SUM(ph.total_points), 0) DESC, p.web_name ASC`,
        )
        .all(params) as PlayerCard[];
    }

    // Default: season totals from the players table
    const sortMap: Record<string, string> = {
      total_points: "p.total_points DESC",
      form: "p.form DESC",
      cost: "p.now_cost DESC",
      minutes: "p.minutes DESC",
    };
    const orderBy = sortMap[query.sort ?? "total_points"] ?? sortMap.total_points;

    return this.db
      .prepare(
        `SELECT p.id, p.web_name AS webName, p.first_name AS firstName, p.second_name AS secondName,
                p.team_id AS teamId, t.name AS teamName, t.short_name AS teamShortName,
                p.image_path AS imagePath,
                p.position_id AS positionId, pos.name AS positionName,
                p.now_cost AS nowCost, p.total_points AS totalPoints, p.form,
                p.selected_by_percent AS selectedByPercent, p.points_per_game AS pointsPerGame,
                p.goals_scored AS goalsScored, p.assists, p.clean_sheets AS cleanSheets,
                p.minutes, p.bonus, p.bps, p.creativity, p.influence, p.threat,
                p.ict_index AS ictIndex, p.expected_goals AS expectedGoals,
                p.expected_assists AS expectedAssists,
                p.expected_goal_involvements AS expectedGoalInvolvements,
                p.expected_goal_performance AS expectedGoalPerformance,
                p.expected_assist_performance AS expectedAssistPerformance,
                p.expected_goal_involvement_performance AS expectedGoalInvolvementPerformance,
                p.expected_goals_conceded AS expectedGoalsConceded,
                p.clean_sheets_per_90 AS cleanSheetsPer90, p.starts, p.tackles,
                p.recoveries, p.defensive_contribution AS defensiveContribution,
                p.status
         FROM players p
         JOIN teams t ON t.id = p.team_id
         JOIN positions pos ON pos.id = p.position_id
         ${where}
         ORDER BY ${orderBy}, p.web_name ASC`,
      )
      .all(params) as PlayerCard[];
  }

  getPlayerById(playerId: number): PlayerDetail | null {
    const player = this.db
      .prepare(
        `SELECT p.id, p.web_name AS webName, p.first_name AS firstName, p.second_name AS secondName,
                p.team_id AS teamId, t.name AS teamName, t.short_name AS teamShortName,
                p.image_path AS imagePath,
                p.position_id AS positionId, pos.name AS positionName,
                p.now_cost AS nowCost, p.total_points AS totalPoints, p.form,
                p.selected_by_percent AS selectedByPercent, p.points_per_game AS pointsPerGame,
                p.goals_scored AS goalsScored, p.assists, p.clean_sheets AS cleanSheets,
                p.minutes, p.bonus, p.bps, p.creativity, p.influence, p.threat,
                p.ict_index AS ictIndex, p.expected_goals AS expectedGoals,
                p.expected_assists AS expectedAssists,
                p.expected_goal_involvements AS expectedGoalInvolvements,
                p.expected_goal_performance AS expectedGoalPerformance,
                p.expected_assist_performance AS expectedAssistPerformance,
                p.expected_goal_involvement_performance AS expectedGoalInvolvementPerformance,
                p.expected_goals_conceded AS expectedGoalsConceded,
                p.clean_sheets_per_90 AS cleanSheetsPer90, p.starts, p.tackles,
                p.recoveries, p.defensive_contribution AS defensiveContribution,
                p.status
         FROM players p
         JOIN teams t ON t.id = p.team_id
         JOIN positions pos ON pos.id = p.position_id
         WHERE p.id = ?`,
      )
      .get(playerId) as PlayerCard | undefined;

    if (!player) {
      return null;
    }

    const history = this.db
      .prepare(
        `SELECT player_id AS element, round, total_points AS totalPoints, minutes, goals_scored AS goalsScored,
                assists, clean_sheets AS cleanSheets, bonus, bps, creativity,
                influence, threat, ict_index AS ictIndex,
                expected_goals AS expectedGoals,
                expected_assists AS expectedAssists,
                expected_goal_involvements AS expectedGoalInvolvements,
                expected_goal_performance AS expectedGoalPerformance,
                expected_assist_performance AS expectedAssistPerformance,
                expected_goal_involvement_performance AS expectedGoalInvolvementPerformance,
                expected_goals_conceded AS expectedGoalsConceded, tackles,
                recoveries,
                clearances_blocks_interceptions AS clearancesBlocksInterceptions,
                defensive_contribution AS defensiveContribution, starts,
                opponent_team AS opponentTeam, value, was_home AS wasHome,
                kickoff_time AS kickoffTime
         FROM player_history
         WHERE player_id = ?
         ORDER BY round DESC
         LIMIT 8`,
      )
      .all(playerId)
      .map((row: any) => ({
        ...row,
        wasHome: mapBoolean(row.wasHome),
      })) as PlayerHistoryPoint[];

    const upcomingFixtures = this.db
      .prepare(
        `SELECT pf.fixture_id AS id, pf.code, pf.event_id AS eventId, pf.kickoff_time AS kickoffTime,
                pf.team_h AS teamH, pf.team_a AS teamA,
                th.name AS teamHName, ta.name AS teamAName,
                th.short_name AS teamHShortName, ta.short_name AS teamAShortName,
                pf.team_h_score AS teamHScore, pf.team_a_score AS teamAScore,
                pf.finished, pf.started
         FROM player_future_fixtures pf
         JOIN teams th ON th.id = pf.team_h
         JOIN teams ta ON ta.id = pf.team_a
         WHERE pf.player_id = ?
         ORDER BY COALESCE(pf.event_id, 999), COALESCE(pf.kickoff_time, '')`,
      )
      .all(playerId)
      .map((row: any) => ({
        ...row,
        finished: mapBoolean(row.finished),
        started: mapBoolean(row.started),
      })) as FixtureCard[];

    return { player, history, upcomingFixtures };
  }

  getOverview(): OverviewResponse {
    return {
      generatedAt: new Date().toISOString(),
      gameweeks: this.getGameweeks(),
      topPlayers: this.getPlayers({ sort: "total_points" }).slice(0, 8),
      fixtures: this.getFixtures().slice(0, 12),
      teams: this.getTeams(),
    };
  }
}
