import type { AppDatabase } from "../db/database.js";
import { FplApiClient, type LeagueStandingsResponse } from "../client/fplApiClient.js";

function now() {
  return new Date().toISOString();
}

function toSqliteBoolean(value: boolean | null | undefined) {
  return Number(Boolean(value));
}

export type RivalLeagueType = "classic" | "h2h";

export type RivalStanding = {
  entryId: number;
  playerName: string;
  teamName: string;
  rank: number;
  totalPoints: number;
};

export type RivalStandingsPage = {
  leagueId: number;
  leagueType: RivalLeagueType;
  leagueName: string;
  page: number;
  pageSize: number;
  hasNext: boolean;
  standings: RivalStanding[];
};

export class RivalSyncService {
  constructor(
    private readonly db: AppDatabase,
    private readonly client = new FplApiClient(),
  ) {}

  async getLeagueStandingsPage(
    leagueId: number,
    leagueType: RivalLeagueType,
    page: number,
  ): Promise<RivalStandingsPage> {
    const response = await this.getLeaguePage(leagueType, leagueId, page);
    const standings = response.standings.results.map((row) => ({
      entryId: row.entry,
      playerName: row.player_name,
      teamName: row.entry_name,
      rank: row.rank,
      totalPoints: row.total,
    }));
    return {
      leagueId,
      leagueType,
      leagueName: response.league.name,
      page,
      pageSize: standings.length,
      hasNext: response.standings.has_next,
      standings,
    };
  }

  async syncLeagueStandings(
    leagueId: number,
    leagueType: RivalLeagueType,
    accountId: number,
  ) {
    const standings: RivalStanding[] = [];
    let page = 1;
    let leagueName = "";
    let hasNext = true;

    while (hasNext) {
      const response = await this.getLeaguePage(leagueType, leagueId, page);
      leagueName = response.league.name;
      standings.push(
        ...response.standings.results.map((row) => ({
          entryId: row.entry,
          playerName: row.player_name,
          teamName: row.entry_name,
          rank: row.rank,
          totalPoints: row.total,
        })),
      );
      hasNext = response.standings.has_next;
      page += 1;
    }

    const fetchedAt = now();
    const insertRivalEntry = this.db.prepare(
      `INSERT INTO rival_entries (
        entry_id, player_name, team_name, overall_rank, total_points, last_synced_gw, fetched_at
      ) VALUES (?, ?, ?, ?, ?, COALESCE((SELECT last_synced_gw FROM rival_entries WHERE entry_id = ?), NULL), ?)
      ON CONFLICT(entry_id) DO UPDATE SET
        player_name = excluded.player_name,
        team_name = excluded.team_name,
        overall_rank = excluded.overall_rank,
        total_points = excluded.total_points,
        fetched_at = excluded.fetched_at`,
    );
    const upsertLeague = this.db.prepare(
      `INSERT INTO rival_leagues (league_id, league_type, league_name, account_id, synced_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(league_id, league_type, account_id) DO UPDATE SET
         league_name = excluded.league_name,
         synced_at = excluded.synced_at`,
    );

    this.db.transaction(() => {
      for (const standing of standings) {
        insertRivalEntry.run(
          standing.entryId,
          standing.playerName,
          standing.teamName,
          standing.rank,
          standing.totalPoints,
          standing.entryId,
          fetchedAt,
        );
      }
      upsertLeague.run(leagueId, leagueType, leagueName, accountId, fetchedAt);
    })();

    return {
      leagueId,
      leagueType,
      leagueName,
      rivalCount: standings.length,
      standings,
    };
  }

  private async ensureRivalEntry(entryId: number) {
    const existing = this.db
      .prepare(`SELECT 1 FROM rival_entries WHERE entry_id = ?`)
      .get(entryId);
    if (existing) return;

    const info = await this.client.getEntryInfo(entryId);
    this.db
      .prepare(
        `INSERT INTO rival_entries (entry_id, player_name, team_name, overall_rank, total_points, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(entry_id) DO NOTHING`,
      )
      .run(
        entryId,
        `${info.player_first_name} ${info.player_last_name}`,
        info.name,
        info.summary_overall_rank,
        info.summary_overall_points,
        now(),
      );
  }

  async syncRivalOnDemand(
    _leagueId: number,
    entryId: number,
    _accountId: number,
  ) {
    await this.ensureRivalEntry(entryId);
    const history = await this.client.getRivalEntryHistory(entryId);
    const relevantGameweeks = history.current.filter((row) => row.event > 0);

    const upsertGameweek = this.db.prepare(
      `INSERT INTO rival_gameweeks (
        entry_id, gameweek_id, points, total_points, overall_rank, rank,
        event_transfers, event_transfers_cost, points_on_bench, active_chip
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(entry_id, gameweek_id) DO UPDATE SET
        points = excluded.points,
        total_points = excluded.total_points,
        overall_rank = excluded.overall_rank,
        rank = excluded.rank,
        event_transfers = excluded.event_transfers,
        event_transfers_cost = excluded.event_transfers_cost,
        points_on_bench = excluded.points_on_bench,
        active_chip = excluded.active_chip`,
    );
    const deletePicks = this.db.prepare(
      `DELETE FROM rival_picks WHERE entry_id = ? AND gameweek_id = ?`,
    );
    const insertPick = this.db.prepare(
      `INSERT INTO rival_picks (
        entry_id, gameweek_id, player_id, position, multiplier, is_captain, is_vice_captain, gw_points
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const updateProgress = this.db.prepare(
      `UPDATE rival_entries
       SET last_synced_gw = ?, fetched_at = ?
       WHERE entry_id = ?`,
    );

    for (const gameweek of relevantGameweeks) {
      const [picks, live] = await Promise.all([
        this.client.getPublicEntryPicks(entryId, gameweek.event),
        this.client.getEventLive(gameweek.event),
      ]);
      const pointsByPlayer = new Map(live.elements.map((el) => [el.id, el.stats.total_points]));

      this.db.transaction(() => {
        upsertGameweek.run(
          entryId,
          gameweek.event,
          gameweek.points,
          gameweek.total_points,
          gameweek.overall_rank ?? 0,
          gameweek.rank ?? 0,
          gameweek.event_transfers,
          gameweek.event_transfers_cost,
          gameweek.points_on_bench,
          picks.active_chip,
        );
        deletePicks.run(entryId, gameweek.event);
        for (const pick of picks.picks) {
          insertPick.run(
            entryId,
            gameweek.event,
            pick.element,
            pick.position,
            pick.multiplier,
            toSqliteBoolean(pick.is_captain),
            toSqliteBoolean(pick.is_vice_captain),
            pointsByPlayer.get(pick.element) ?? null,
          );
        }
        updateProgress.run(gameweek.event, now(), entryId);
      })();
    }

    return {
      entryId,
      syncedGameweeks: relevantGameweeks.length,
      lastSyncedGw: relevantGameweeks.at(-1)?.event ?? null,
    };
  }

  private getLeaguePage(
    leagueType: RivalLeagueType,
    leagueId: number,
    page: number,
  ): Promise<LeagueStandingsResponse> {
    if (leagueType === "h2h") {
      return this.client.getH2HLeagueStandings(leagueId, page);
    }

    return this.client.getClassicLeagueStandings(leagueId, page);
  }
}
