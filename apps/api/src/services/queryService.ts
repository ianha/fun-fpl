import type {
  FixtureCard,
  GameweekSummary,
  MyTeamAccountSummary,
  MyTeamGameweekPicksResponse,
  MyTeamHistoryRow,
  MyTeamPageResponse,
  MyTeamPick,
  MyTeamSeasonSummary,
  MyTeamTransfer,
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

type PlayerCardRow = PlayerCard;
type GameweekRow = Omit<GameweekSummary, "isCurrent" | "isFinished"> & {
  isCurrent: number;
  isFinished: number;
};
type FixtureRow = Omit<FixtureCard, "finished" | "started"> & {
  finished: number;
  started: number;
};
type PlayerHistoryRow = Omit<PlayerHistoryPoint, "wasHome"> & {
  wasHome: number;
};
type MyTeamPickRow = PlayerCardRow & {
  slotId: string;
  position: number;
  multiplier: number;
  isCaptain: number;
  isViceCaptain: number;
  sellingPrice: number;
  purchasePrice: number;
  role: MyTeamPick["role"];
  benchOrder: number | null;
  gwPoints?: number;
};
type PlayerTransferPrefix = "playerIn" | "playerOut";
type PlayerTransferRow = {
  id: string;
  gameweek: number;
  madeAt: string;
  hitCost: number | null;
} & Record<string, PlayerCard[keyof PlayerCard]>;

function mapBoolean(value: number | null | undefined) {
  return Boolean(value);
}

export class QueryService {
  constructor(private readonly db: AppDatabase) {}

  getGameweeks(): GameweekSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, deadline_time AS deadlineTime, average_entry_score AS averageEntryScore,
                highest_score AS highestScore, is_current AS isCurrent, is_finished AS isFinished
         FROM gameweeks
         ORDER BY id`,
      )
      .all() as GameweekRow[];

    return rows.map((row) => this.mapGameweek(row));
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

    const rows = this.db
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
      .all(params) as FixtureRow[];

    return rows.map((row) => this.mapFixture(row));
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
        .all(params) as PlayerCardRow[];
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
      .all(params) as PlayerCardRow[];
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
      .get(playerId) as PlayerCardRow | undefined;

    if (!player) {
      return null;
    }

    const historyRows = this.db
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
                expected_goals_conceded AS expectedGoalsConceded,
                saves, yellow_cards AS yellowCards, red_cards AS redCards,
                own_goals AS ownGoals, penalties_saved AS penaltiesSaved,
                penalties_missed AS penaltiesMissed, goals_conceded AS goalsConceded,
                tackles, recoveries,
                clearances_blocks_interceptions AS clearancesBlocksInterceptions,
                defensive_contribution AS defensiveContribution, starts,
                opponent_team AS opponentTeam, value, was_home AS wasHome,
                kickoff_time AS kickoffTime
         FROM player_history
         WHERE player_id = ?
         ORDER BY round DESC`,
      )
      .all(playerId) as PlayerHistoryRow[];
    const history = historyRows.map((row) => this.mapPlayerHistory(row));

    const upcomingFixtureRows = this.db
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
      .all(playerId) as FixtureRow[];
    const upcomingFixtures = upcomingFixtureRows.map((row) => this.mapFixture(row));

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

  getMyTeamAccounts(): MyTeamAccountSummary[] {
    return this.db
      .prepare(
        `SELECT id, email, entry_id AS entryId,
                TRIM(COALESCE(player_first_name, '') || ' ' || COALESCE(player_last_name, '')) AS managerName,
                COALESCE(team_name, '') AS teamName, auth_status AS authStatus,
                auth_error AS authError, last_authenticated_at AS lastAuthenticatedAt
         FROM my_team_accounts
         ORDER BY updated_at DESC`,
      )
      .all() as MyTeamAccountSummary[];
  }

  getMyTeam(accountId?: number): MyTeamPageResponse | null {
    const accounts = this.getMyTeamAccounts();
    const selectedAccount = accountId
      ? accounts.find((account) => account.id === accountId)
      : accounts[0];

    if (!selectedAccount) {
      return {
        accounts,
        selectedAccountId: null,
        currentGameweek: null,
        freeTransfers: 0,
        bank: 0,
        overallPoints: 0,
        overallRank: 0,
        teamName: "",
        managerName: "",
        picks: [],
        transfers: [],
        seasons: [],
        history: [],
      };
    }

    const history = this.db
      .prepare(
        `SELECT gameweek_id AS gameweek, points, total_points AS totalPoints,
                overall_rank AS overallRank, rank, bank, value,
                event_transfers AS eventTransfers, event_transfers_cost AS eventTransfersCost,
                points_on_bench AS pointsOnBench, active_chip AS activeChip
         FROM my_team_gameweeks
         WHERE account_id = ?
         ORDER BY gameweek_id DESC`,
      )
      .all(selectedAccount.id) as MyTeamHistoryRow[];

    const currentGameweek = history[0]?.gameweek ?? null;
    const current = history[0];
    const picks = currentGameweek
      ? ((this.db
          .prepare(
            `SELECT
               'pick-' || mp.position AS slotId,
               mp.position,
               mp.multiplier AS multiplier,
               mp.is_captain AS isCaptain,
               mp.is_vice_captain AS isViceCaptain,
               mp.selling_price AS sellingPrice,
               mp.purchase_price AS purchasePrice,
               CASE WHEN mp.position <= 11 THEN 'starter' ELSE 'bench' END AS role,
               CASE WHEN mp.position <= 11 THEN NULL ELSE mp.position - 11 END AS benchOrder,
               p.id, p.web_name AS webName, p.first_name AS firstName, p.second_name AS secondName,
               p.team_id AS teamId, t.name AS teamName, t.short_name AS teamShortName,
               p.image_path AS imagePath, p.position_id AS positionId, pos.name AS positionName,
               p.now_cost AS nowCost, p.total_points AS totalPoints, p.form,
               p.selected_by_percent AS selectedByPercent, p.points_per_game AS pointsPerGame,
               p.goals_scored AS goalsScored, p.assists, p.clean_sheets AS cleanSheets,
               p.minutes, p.bonus, p.bps, p.creativity, p.influence, p.threat,
               p.ict_index AS ictIndex, p.expected_goals AS expectedGoals, p.expected_assists AS expectedAssists,
               p.expected_goal_involvements AS expectedGoalInvolvements,
               p.expected_goal_performance AS expectedGoalPerformance,
               p.expected_assist_performance AS expectedAssistPerformance,
               p.expected_goal_involvement_performance AS expectedGoalInvolvementPerformance,
               p.expected_goals_conceded AS expectedGoalsConceded, p.clean_sheets_per_90 AS cleanSheetsPer90,
               p.starts, p.tackles, p.recoveries, p.defensive_contribution AS defensiveContribution, p.status
             FROM my_team_picks mp
             JOIN players p ON p.id = mp.player_id
             JOIN teams t ON t.id = p.team_id
             JOIN positions pos ON pos.id = p.position_id
             WHERE mp.account_id = ? AND mp.gameweek_id = ?
             ORDER BY mp.position`,
          )
          .all(selectedAccount.id, currentGameweek) as MyTeamPickRow[])
          .map((row) => this.mapMyTeamPick(row)))
      : [];

    const transferRows = this.db
      .prepare(
        `SELECT mt.transfer_id AS id, mt.gameweek_id AS gameweek, mt.transferred_at AS madeAt,
                CASE
                  WHEN ROW_NUMBER() OVER (PARTITION BY mt.account_id, mt.gameweek_id ORDER BY mt.transferred_at DESC)
                       <= COALESCE(gw.event_transfers_cost / 4, 0)
                  THEN 4 ELSE 0
                END AS hitCost,
                pin.id AS playerInId, pin.web_name AS playerInWebName, pin.first_name AS playerInFirstName, pin.second_name AS playerInSecondName,
                tin.name AS playerInTeamName, tin.short_name AS playerInTeamShortName, pin.team_id AS playerInTeamId,
                pin.image_path AS playerInImagePath, pin.position_id AS playerInPositionId, posin.name AS playerInPositionName,
                pin.now_cost AS playerInNowCost, pin.total_points AS playerInTotalPoints, pin.form AS playerInForm,
                pin.selected_by_percent AS playerInSelectedByPercent, pin.points_per_game AS playerInPointsPerGame,
                pin.goals_scored AS playerInGoalsScored, pin.assists AS playerInAssists, pin.clean_sheets AS playerInCleanSheets,
                pin.minutes AS playerInMinutes, pin.bonus AS playerInBonus, pin.bps AS playerInBps, pin.creativity AS playerInCreativity,
                pin.influence AS playerInInfluence, pin.threat AS playerInThreat, pin.ict_index AS playerInIctIndex,
                pin.expected_goals AS playerInExpectedGoals, pin.expected_assists AS playerInExpectedAssists,
                pin.expected_goal_involvements AS playerInExpectedGoalInvolvements,
                pin.expected_goal_performance AS playerInExpectedGoalPerformance,
                pin.expected_assist_performance AS playerInExpectedAssistPerformance,
                pin.expected_goal_involvement_performance AS playerInExpectedGoalInvolvementPerformance,
                pin.expected_goals_conceded AS playerInExpectedGoalsConceded, pin.clean_sheets_per_90 AS playerInCleanSheetsPer90,
                pin.starts AS playerInStarts, pin.tackles AS playerInTackles, pin.recoveries AS playerInRecoveries,
                pin.defensive_contribution AS playerInDefensiveContribution, pin.status AS playerInStatus,
                pout.id AS playerOutId, pout.web_name AS playerOutWebName, pout.first_name AS playerOutFirstName, pout.second_name AS playerOutSecondName,
                tout.name AS playerOutTeamName, tout.short_name AS playerOutTeamShortName, pout.team_id AS playerOutTeamId,
                pout.image_path AS playerOutImagePath, pout.position_id AS playerOutPositionId, posout.name AS playerOutPositionName,
                pout.now_cost AS playerOutNowCost, pout.total_points AS playerOutTotalPoints, pout.form AS playerOutForm,
                pout.selected_by_percent AS playerOutSelectedByPercent, pout.points_per_game AS playerOutPointsPerGame,
                pout.goals_scored AS playerOutGoalsScored, pout.assists AS playerOutAssists, pout.clean_sheets AS playerOutCleanSheets,
                pout.minutes AS playerOutMinutes, pout.bonus AS playerOutBonus, pout.bps AS playerOutBps, pout.creativity AS playerOutCreativity,
                pout.influence AS playerOutInfluence, pout.threat AS playerOutThreat, pout.ict_index AS playerOutIctIndex,
                pout.expected_goals AS playerOutExpectedGoals, pout.expected_assists AS playerOutExpectedAssists,
                pout.expected_goal_involvements AS playerOutExpectedGoalInvolvements,
                pout.expected_goal_performance AS playerOutExpectedGoalPerformance,
                pout.expected_assist_performance AS playerOutExpectedAssistPerformance,
                pout.expected_goal_involvement_performance AS playerOutExpectedGoalInvolvementPerformance,
                pout.expected_goals_conceded AS playerOutExpectedGoalsConceded, pout.clean_sheets_per_90 AS playerOutCleanSheetsPer90,
                pout.starts AS playerOutStarts, pout.tackles AS playerOutTackles, pout.recoveries AS playerOutRecoveries,
                pout.defensive_contribution AS playerOutDefensiveContribution, pout.status AS playerOutStatus
         FROM my_team_transfers mt
         JOIN players pin ON pin.id = mt.player_in_id
         JOIN teams tin ON tin.id = pin.team_id
         JOIN positions posin ON posin.id = pin.position_id
         JOIN players pout ON pout.id = mt.player_out_id
         JOIN teams tout ON tout.id = pout.team_id
         JOIN positions posout ON posout.id = pout.position_id
         LEFT JOIN my_team_gameweeks gw ON gw.account_id = mt.account_id AND gw.gameweek_id = mt.gameweek_id
         WHERE mt.account_id = ?
         ORDER BY mt.transferred_at DESC`,
      )
      .all(selectedAccount.id) as PlayerTransferRow[];
    const transfers: MyTeamTransfer[] = transferRows.map((row) => ({
        id: row.id,
        gameweek: row.gameweek,
        madeAt: row.madeAt,
        cost: row.hitCost ?? 0,
        playerIn: this.mapPlayerFromPrefix(row, "playerIn"),
        playerOut: this.mapPlayerFromPrefix(row, "playerOut"),
      }));

    const seasons = this.db
      .prepare(
        `SELECT season_name AS season, total_points AS overallPoints,
                overall_rank AS overallRank, rank
         FROM my_team_seasons
         WHERE account_id = ?
         ORDER BY season_name DESC`,
      )
      .all(selectedAccount.id) as MyTeamSeasonSummary[];

    return {
      accounts,
      selectedAccountId: selectedAccount.id,
      currentGameweek,
      freeTransfers: current ? Math.max(1, 1 + (current.activeChip ? 0 : 0)) : 1,
      bank: current?.bank ?? 0,
      overallPoints: current?.totalPoints ?? 0,
      overallRank: current?.overallRank ?? 0,
      teamName: selectedAccount.teamName,
      managerName: selectedAccount.managerName,
      picks,
      transfers,
      seasons,
      history,
    };
  }

  getMyTeamPicksForGameweek(accountId: number, gameweek: number): MyTeamGameweekPicksResponse {
    const pickRows = this.db
      .prepare(
        `SELECT
           'pick-' || mp.position AS slotId,
           mp.position,
           mp.multiplier,
           mp.is_captain AS isCaptain,
           mp.is_vice_captain AS isViceCaptain,
           mp.selling_price AS sellingPrice,
           mp.purchase_price AS purchasePrice,
           CASE WHEN mp.position <= 11 THEN 'starter' ELSE 'bench' END AS role,
           CASE WHEN mp.position <= 11 THEN NULL ELSE mp.position - 11 END AS benchOrder,
           COALESCE(mp.gw_points, ph.total_points, 0) AS gwPoints,
           p.id, p.web_name AS webName, p.first_name AS firstName, p.second_name AS secondName,
           p.team_id AS teamId, t.name AS teamName, t.short_name AS teamShortName,
           p.image_path AS imagePath, p.position_id AS positionId, pos.name AS positionName,
           p.now_cost AS nowCost, p.total_points AS totalPoints, p.form,
           p.selected_by_percent AS selectedByPercent, p.points_per_game AS pointsPerGame,
           p.goals_scored AS goalsScored, p.assists, p.clean_sheets AS cleanSheets,
           p.minutes, p.bonus, p.bps, p.creativity, p.influence, p.threat,
           p.ict_index AS ictIndex, p.expected_goals AS expectedGoals, p.expected_assists AS expectedAssists,
           p.expected_goal_involvements AS expectedGoalInvolvements,
           p.expected_goal_performance AS expectedGoalPerformance,
           p.expected_assist_performance AS expectedAssistPerformance,
           p.expected_goal_involvement_performance AS expectedGoalInvolvementPerformance,
           p.expected_goals_conceded AS expectedGoalsConceded, p.clean_sheets_per_90 AS cleanSheetsPer90,
           p.starts, p.tackles, p.recoveries, p.defensive_contribution AS defensiveContribution, p.status
         FROM my_team_picks mp
         JOIN players p ON p.id = mp.player_id
         JOIN teams t ON t.id = p.team_id
         JOIN positions pos ON pos.id = p.position_id
         LEFT JOIN player_history ph ON ph.player_id = mp.player_id AND ph.round = mp.gameweek_id
         WHERE mp.account_id = ? AND mp.gameweek_id = ?
         ORDER BY mp.position`,
      )
      .all(accountId, gameweek) as MyTeamPickRow[];
    const picks = pickRows.map((row) => this.mapMyTeamPick(row));

    const gw = this.db
      .prepare(
        `SELECT points AS totalPoints, points_on_bench AS pointsOnBench
         FROM my_team_gameweeks
         WHERE account_id = ? AND gameweek_id = ?`,
      )
      .get(accountId, gameweek) as { totalPoints: number; pointsOnBench: number } | undefined;

    return {
      gameweek,
      picks,
      totalPoints: gw?.totalPoints ?? 0,
      pointsOnBench: gw?.pointsOnBench ?? 0,
    };
  }

  private mapGameweek(row: GameweekRow): GameweekSummary {
    return {
      ...row,
      isCurrent: mapBoolean(row.isCurrent),
      isFinished: mapBoolean(row.isFinished),
    };
  }

  private mapFixture(row: FixtureRow): FixtureCard {
    return {
      ...row,
      finished: mapBoolean(row.finished),
      started: mapBoolean(row.started),
    };
  }

  private mapPlayerHistory(row: PlayerHistoryRow): PlayerHistoryPoint {
    return {
      ...row,
      wasHome: mapBoolean(row.wasHome),
    };
  }

  private mapMyTeamPick(row: MyTeamPickRow): MyTeamPick {
    const pick: MyTeamPick = {
      slotId: row.slotId,
      position: row.position,
      multiplier: row.multiplier,
      isCaptain: mapBoolean(row.isCaptain),
      isViceCaptain: mapBoolean(row.isViceCaptain),
      sellingPrice: row.sellingPrice,
      purchasePrice: row.purchasePrice,
      role: row.role,
      benchOrder: row.benchOrder,
      player: this.mapPlayerCard(row),
    };

    if (row.gwPoints !== undefined) {
      pick.gwPoints = row.gwPoints;
    }

    return pick;
  }

  private mapPlayerCard(row: PlayerCardRow): PlayerCard {
    return { ...row };
  }

  private getPrefixedPlayerValue<K extends keyof PlayerCard>(
    row: PlayerTransferRow,
    prefix: PlayerTransferPrefix,
    suffix: string,
  ): PlayerCard[K] {
    return row[`${prefix}${suffix}`] as PlayerCard[K];
  }

  private mapPlayerFromPrefix(row: PlayerTransferRow, prefix: PlayerTransferPrefix): PlayerCard {
    return {
      id: this.getPrefixedPlayerValue<"id">(row, prefix, "Id"),
      webName: this.getPrefixedPlayerValue<"webName">(row, prefix, "WebName"),
      firstName: this.getPrefixedPlayerValue<"firstName">(row, prefix, "FirstName"),
      secondName: this.getPrefixedPlayerValue<"secondName">(row, prefix, "SecondName"),
      teamId: this.getPrefixedPlayerValue<"teamId">(row, prefix, "TeamId"),
      teamName: this.getPrefixedPlayerValue<"teamName">(row, prefix, "TeamName"),
      teamShortName: this.getPrefixedPlayerValue<"teamShortName">(row, prefix, "TeamShortName"),
      imagePath: this.getPrefixedPlayerValue<"imagePath">(row, prefix, "ImagePath"),
      positionId: this.getPrefixedPlayerValue<"positionId">(row, prefix, "PositionId"),
      positionName: this.getPrefixedPlayerValue<"positionName">(row, prefix, "PositionName"),
      nowCost: this.getPrefixedPlayerValue<"nowCost">(row, prefix, "NowCost"),
      totalPoints: this.getPrefixedPlayerValue<"totalPoints">(row, prefix, "TotalPoints"),
      form: this.getPrefixedPlayerValue<"form">(row, prefix, "Form"),
      selectedByPercent: this.getPrefixedPlayerValue<"selectedByPercent">(row, prefix, "SelectedByPercent"),
      pointsPerGame: this.getPrefixedPlayerValue<"pointsPerGame">(row, prefix, "PointsPerGame"),
      goalsScored: this.getPrefixedPlayerValue<"goalsScored">(row, prefix, "GoalsScored"),
      assists: this.getPrefixedPlayerValue<"assists">(row, prefix, "Assists"),
      cleanSheets: this.getPrefixedPlayerValue<"cleanSheets">(row, prefix, "CleanSheets"),
      minutes: this.getPrefixedPlayerValue<"minutes">(row, prefix, "Minutes"),
      bonus: this.getPrefixedPlayerValue<"bonus">(row, prefix, "Bonus"),
      bps: this.getPrefixedPlayerValue<"bps">(row, prefix, "Bps"),
      creativity: this.getPrefixedPlayerValue<"creativity">(row, prefix, "Creativity"),
      influence: this.getPrefixedPlayerValue<"influence">(row, prefix, "Influence"),
      threat: this.getPrefixedPlayerValue<"threat">(row, prefix, "Threat"),
      ictIndex: this.getPrefixedPlayerValue<"ictIndex">(row, prefix, "IctIndex"),
      expectedGoals: this.getPrefixedPlayerValue<"expectedGoals">(row, prefix, "ExpectedGoals"),
      expectedAssists: this.getPrefixedPlayerValue<"expectedAssists">(row, prefix, "ExpectedAssists"),
      expectedGoalInvolvements: this.getPrefixedPlayerValue<"expectedGoalInvolvements">(
        row,
        prefix,
        "ExpectedGoalInvolvements",
      ),
      expectedGoalPerformance: this.getPrefixedPlayerValue<"expectedGoalPerformance">(
        row,
        prefix,
        "ExpectedGoalPerformance",
      ),
      expectedAssistPerformance: this.getPrefixedPlayerValue<"expectedAssistPerformance">(
        row,
        prefix,
        "ExpectedAssistPerformance",
      ),
      expectedGoalInvolvementPerformance: this.getPrefixedPlayerValue<"expectedGoalInvolvementPerformance">(
        row,
        prefix,
        "ExpectedGoalInvolvementPerformance",
      ),
      expectedGoalsConceded: this.getPrefixedPlayerValue<"expectedGoalsConceded">(
        row,
        prefix,
        "ExpectedGoalsConceded",
      ),
      cleanSheetsPer90: this.getPrefixedPlayerValue<"cleanSheetsPer90">(row, prefix, "CleanSheetsPer90"),
      starts: this.getPrefixedPlayerValue<"starts">(row, prefix, "Starts"),
      tackles: this.getPrefixedPlayerValue<"tackles">(row, prefix, "Tackles"),
      recoveries: this.getPrefixedPlayerValue<"recoveries">(row, prefix, "Recoveries"),
      defensiveContribution: this.getPrefixedPlayerValue<"defensiveContribution">(
        row,
        prefix,
        "DefensiveContribution",
      ),
      status: this.getPrefixedPlayerValue<"status">(row, prefix, "Status"),
    };
  }
}
