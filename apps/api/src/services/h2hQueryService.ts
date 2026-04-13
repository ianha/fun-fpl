import type {
  GmRankHistory,
  H2HComparisonResponse,
  H2HLeagueStanding,
  H2HPlayerRef,
  SquadOverlap,
} from "@fpl/contracts";
import type { AppDatabase } from "../db/database.js";

type RivalEntryRow = {
  entryId: number;
  playerName: string;
  teamName: string;
  rank: number;
  totalPoints: number;
};

type PickRow = {
  playerId: number;
};

type PlayerRefRow = {
  id: number;
  webName: string;
  teamShortName: string;
  nowCost: number;
  positionName: string;
};

export class H2HQueryService {
  constructor(private readonly db: AppDatabase) {}

  getH2HComparison(
    accountId: number,
    leagueId: number,
    rivalEntryId: number,
  ): H2HComparisonResponse {
    const rivalEntry = this.db
      .prepare(
        `SELECT
           entry_id AS entryId,
           player_name AS playerName,
           team_name AS teamName,
           COALESCE(overall_rank, 0) AS rank,
           COALESCE(total_points, 0) AS totalPoints
         FROM rival_entries
         WHERE entry_id = ?`,
      )
      .get(rivalEntryId) as RivalEntryRow | undefined;

    const leagueMembership = this.db
      .prepare(
        `SELECT 1
         FROM rival_leagues
         WHERE league_id = ? AND account_id = ? AND league_type IN ('classic', 'h2h')
         LIMIT 1`,
      )
      .get(leagueId, accountId);

    const rivalHasData = this.db
      .prepare(
        `SELECT 1
         FROM rival_gameweeks
         WHERE entry_id = ?
         LIMIT 1`,
      )
      .get(rivalEntryId);

    if (!leagueMembership || !rivalHasData) {
      return {
        syncRequired: true,
        rivalEntry: rivalEntry ? this.mapRivalEntry(rivalEntry) : null,
        squadOverlap: null,
        gmRankHistory: [],
      };
    }

    const latestOverlapGameweek = this.db
      .prepare(
        `SELECT MAX(mp.gameweek_id) AS gameweek
         FROM my_team_picks mp
         INNER JOIN rival_picks rp
           ON rp.entry_id = @rivalEntryId
          AND rp.gameweek_id = mp.gameweek_id
         WHERE mp.account_id = @accountId`,
      )
      .get({ accountId, rivalEntryId }) as { gameweek: number | null };

    return {
      syncRequired: false,
      rivalEntry: rivalEntry ? this.mapRivalEntry(rivalEntry) : null,
      squadOverlap:
        latestOverlapGameweek.gameweek === null
          ? null
          : this.getSquadOverlap(accountId, rivalEntryId, latestOverlapGameweek.gameweek),
      gmRankHistory: this.getGmRankHistory(accountId, rivalEntryId),
    };
  }

  private getSquadOverlap(
    accountId: number,
    rivalEntryId: number,
    gameweek: number,
  ): SquadOverlap {
    const userPickRows = this.db
      .prepare(
        `SELECT player_id AS playerId
         FROM my_team_picks
         WHERE account_id = ? AND gameweek_id = ?
         ORDER BY position`,
      )
      .all(accountId, gameweek) as PickRow[];
    const rivalPickRows = this.db
      .prepare(
        `SELECT player_id AS playerId
         FROM rival_picks
         WHERE entry_id = ? AND gameweek_id = ?
         ORDER BY position`,
      )
      .all(rivalEntryId, gameweek) as PickRow[];

    const userPlayerIds = userPickRows.map((row) => row.playerId);
    const rivalPlayerIds = rivalPickRows.map((row) => row.playerId);
    const rivalSet = new Set(rivalPlayerIds);
    const userSet = new Set(userPlayerIds);

    const sharedIds = [...new Set(userPlayerIds.filter((playerId) => rivalSet.has(playerId)))];
    const userOnlyIds = [...new Set(userPlayerIds.filter((playerId) => !rivalSet.has(playerId)))];
    const rivalOnlyIds = [...new Set(rivalPlayerIds.filter((playerId) => !userSet.has(playerId)))];

    const comparisonBase = Math.max(userPlayerIds.length, rivalPlayerIds.length, 1);
    return {
      gameweek,
      overlapPct: Number(((sharedIds.length / comparisonBase) * 100).toFixed(1)),
      sharedPlayers: this.getPlayerRefs(sharedIds),
      userOnlyPlayers: this.getPlayerRefs(userOnlyIds),
      rivalOnlyPlayers: this.getPlayerRefs(rivalOnlyIds),
    };
  }

  private getGmRankHistory(accountId: number, rivalEntryId: number): GmRankHistory[] {
    return this.db
      .prepare(
        `SELECT
           mtg.gameweek_id AS gameweek,
           mtg.overall_rank AS userOverallRank,
           rg.overall_rank AS rivalOverallRank
         FROM my_team_gameweeks mtg
         INNER JOIN rival_gameweeks rg
           ON rg.entry_id = @rivalEntryId
          AND rg.gameweek_id = mtg.gameweek_id
         WHERE mtg.account_id = @accountId
         ORDER BY mtg.gameweek_id`,
      )
      .all({ accountId, rivalEntryId }) as GmRankHistory[];
  }

  private getPlayerRefs(playerIds: number[]): H2HPlayerRef[] {
    if (playerIds.length === 0) {
      return [];
    }

    const placeholders = playerIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT
           id,
           web_name AS webName,
           team_short_name AS teamShortName,
           now_cost AS nowCost,
           position_name AS positionName
         FROM (
           SELECT
             p.id,
             p.web_name,
             t.short_name AS team_short_name,
             p.now_cost,
             pos.name AS position_name
           FROM players p
           INNER JOIN teams t ON t.id = p.team_id
           INNER JOIN positions pos ON pos.id = p.position_id
         )
         WHERE id IN (${placeholders})`,
      )
      .all(...playerIds) as PlayerRefRow[];

    const byId = new Map(rows.map((row) => [row.id, row]));
    return playerIds
      .map((playerId) => byId.get(playerId))
      .filter((row): row is PlayerRefRow => Boolean(row))
      .map((row) => ({
        id: row.id,
        webName: row.webName,
        teamShortName: row.teamShortName,
        nowCost: row.nowCost,
        positionName: row.positionName,
      }));
  }

  private mapRivalEntry(row: RivalEntryRow): H2HLeagueStanding {
    return {
      entryId: row.entryId,
      playerName: row.playerName,
      teamName: row.teamName,
      rank: row.rank,
      totalPoints: row.totalPoints,
    };
  }
}
