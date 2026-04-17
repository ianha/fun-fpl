import { env } from "../config/env.js";
import { fetchJson } from "../lib/http.js";
import { RequestRateLimiter } from "../lib/rateLimiter.js";

type BootstrapResponse = {
  events: Array<{
    id: number;
    name: string;
    deadline_time: string;
    average_entry_score: number | null;
    highest_score: number | null;
    is_current: boolean;
    finished: boolean;
  }>;
  teams: Array<{
    id: number;
    code: number;
    name: string;
    short_name: string;
    strength: number;
  }>;
  element_types: Array<{
    id: number;
    singular_name: string;
    singular_name_short: string;
  }>;
  elements: Array<{
    id: number;
    code: number;
    web_name: string;
    first_name: string;
    second_name: string;
    team: number;
    element_type: number;
    now_cost: number;
    total_points: number;
    form: string;
    selected_by_percent: string;
    points_per_game: string;
    goals_scored: number;
    assists: number;
    clean_sheets: number;
    minutes: number;
    bonus: number;
    bps: number;
    creativity: string;
    influence: string;
    threat: string;
    ict_index: string;
    expected_goals: string;
    expected_assists: string;
    expected_goal_involvements: string;
    expected_goals_conceded: string;
    clean_sheets_per_90: number | string;
    starts: number;
    tackles: number;
    recoveries: number;
    defensive_contribution: number;
    photo: string;
    team_code: number;
    status: string;
  }>;
};

type FixturesResponse = Array<{
  id: number;
  code: number;
  event: number | null;
  kickoff_time: string | null;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  finished: boolean | null;
  started: boolean | null;
}>;

type ElementSummaryResponse = {
  history: Array<{
    element: number;
    round: number;
    total_points: number;
    minutes: number;
    goals_scored: number;
    assists: number;
    clean_sheets: number;
    bonus: number;
    bps: number;
    creativity: string;
    influence: string;
    threat: string;
    ict_index: string;
    expected_goals: string;
    expected_assists: string;
    expected_goal_involvements: string;
    expected_goals_conceded: string;
    tackles: number;
    recoveries: number;
    clearances_blocks_interceptions: number;
    defensive_contribution: number;
    saves: number;
    yellow_cards: number;
    red_cards: number;
    own_goals: number;
    penalties_saved: number;
    penalties_missed: number;
    goals_conceded: number;
    starts: number;
    opponent_team: number;
    value: number;
    was_home: boolean;
    kickoff_time: string;
  }>;
  fixtures: Array<{
    id: number;
    code: number;
    event: number | null;
    kickoff_time: string | null;
    team_h: number;
    team_a: number;
    team_h_score: number | null;
    team_a_score: number | null;
    finished: boolean | null;
    started: boolean | null;
  }>;
};

type LeagueStandingsResult = {
  entry: number;
  player_name: string;
  entry_name: string;
  rank: number;
  total: number;
};

type LeagueStandingsResponse = {
  league: {
    id: number;
    name: string;
  };
  standings: {
    has_next: boolean;
    results: LeagueStandingsResult[];
  };
};

type PublicEntryHistoryResponse = {
  current: Array<{
    event: number;
    points: number;
    total_points: number;
    overall_rank: number;
    rank: number;
    event_transfers: number;
    event_transfers_cost: number;
    points_on_bench: number;
  }>;
};

type EntryLeagueItem = {
  id: number;
  name: string;
};

export type EntryInfoResponse = {
  id: number;
  player_first_name: string;
  player_last_name: string;
  name: string;
  summary_overall_rank: number;
  summary_overall_points: number;
  leagues: {
    classic: EntryLeagueItem[];
    h2h: EntryLeagueItem[];
  };
};

type PublicEntryPicksResponse = {
  active_chip: string | null;
  automatic_subs: Array<{
    element_in: number;
    element_out: number;
  }>;
  picks: Array<{
    element: number;
    position: number;
    multiplier: number;
    is_captain: boolean;
    is_vice_captain: boolean;
    element_type: number;
  }>;
};

export class FplApiClient {
  private readonly rateLimiter: RequestRateLimiter;

  constructor(rateLimiter = new RequestRateLimiter(env.fplMinRequestIntervalMs)) {
    this.rateLimiter = rateLimiter;
  }

  async getBootstrap() {
    return this.rateLimiter.schedule(() =>
      fetchJson<BootstrapResponse>(`${env.baseUrl}/bootstrap-static/`),
    );
  }

  async getFixtures() {
    return this.rateLimiter.schedule(() =>
      fetchJson<FixturesResponse>(`${env.baseUrl}/fixtures/`),
    );
  }

  async getElementSummary(playerId: number) {
    return this.rateLimiter.schedule(() =>
      fetchJson<ElementSummaryResponse>(
        `${env.baseUrl}/element-summary/${playerId}/`,
      ),
    );
  }

  async getClassicLeagueStandings(leagueId: number, page = 1) {
    return this.rateLimiter.schedule(() =>
      fetchJson<LeagueStandingsResponse>(
        `${env.baseUrl}/leagues-classic/${leagueId}/standings/?page_standings=${page}`,
      ),
    );
  }

  async getH2HLeagueStandings(leagueId: number, page = 1) {
    return this.rateLimiter.schedule(() =>
      fetchJson<LeagueStandingsResponse>(
        `${env.baseUrl}/leagues-h2h/${leagueId}/standings/?page_standings=${page}`,
      ),
    );
  }

  async getPublicEntryPicks(entryId: number, gameweekId: number) {
    return this.rateLimiter.schedule(() =>
      fetchJson<PublicEntryPicksResponse>(
        `${env.baseUrl}/entry/${entryId}/event/${gameweekId}/picks/`,
      ),
    );
  }

  async getRivalEntryHistory(entryId: number) {
    return this.rateLimiter.schedule(() =>
      fetchJson<PublicEntryHistoryResponse>(
        `${env.baseUrl}/entry/${entryId}/history/`,
      ),
    );
  }

  async getEntryInfo(entryId: number) {
    return this.rateLimiter.schedule(() =>
      fetchJson<EntryInfoResponse>(`${env.baseUrl}/entry/${entryId}/`),
    );
  }

  async getEventLive(gameweek: number) {
    return this.rateLimiter.schedule(() =>
      fetchJson<{ elements: Array<{ id: number; stats: { total_points: number; minutes: number } }> }>(
        `${env.baseUrl}/event/${gameweek}/live/`,
      ),
    );
  }
}

export type {
  BootstrapResponse,
  ElementSummaryResponse,
  FixturesResponse,
  LeagueStandingsResponse,
  LeagueStandingsResult,
  PublicEntryHistoryResponse,
  PublicEntryPicksResponse,
};
