import type {
  CaptainRecommendation,
  FdrRow,
  GwCalendarRow,
  H2HComparisonResponse,
  H2HLeagueStanding,
  LeagueStandingsPage,
  LiveGwUpdate,
  MyLeague,
  OverviewResponse,
  PlayerCard,
  PlayerDetail,
  PlayerXpts,
  FixtureCard,
  TeamSummary,
  GameweekSummary,
  MyTeamPageResponse,
  MyTeamGameweekPicksResponse,
  RivalSyncResponse,
  TransferDecisionHorizon,
  TransferDecisionResponse,
} from "@fpl/contracts";
import type { ChatMessage, ProviderInfo } from "@/pages/chatPageUtils";

function resolveApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  if (typeof window !== "undefined") {
    return `${window.location.origin}/api`;
  }

  return "http://localhost:4000/api";
}

const API_BASE_URL = resolveApiBaseUrl();
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

function buildApiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

function buildQueryString(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function withQuery(path: string, params: Record<string, string | number | boolean | undefined>) {
  return `${path}${buildQueryString(params)}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function requestWithBody<T>(path: string, method: string, body: unknown): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) message = payload.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function getOverview() {
  return request<OverviewResponse>("/overview");
}

export function getGameweeks() {
  return request<GameweekSummary[]>("/gameweeks");
}

export function getPlayers(params?: {
  search?: string;
  position?: string;
  sort?: string;
  team?: string;
  fromGW?: number;
  toGW?: number;
}) {
  return request<PlayerCard[]>(withQuery("/players", {
    search: params?.search,
    position: params?.position,
    sort: params?.sort,
    team: params?.team,
    fromGW: params?.fromGW,
    toGW: params?.toGW,
  }));
}

export function getPlayer(playerId: number) {
  return request<PlayerDetail>(`/players/${playerId}`);
}

export function getH2HComparison(
  leagueId: number,
  rivalEntryId: number,
  options?: { accountId?: number; signal?: AbortSignal },
) {
  return request<H2HComparisonResponse>(
    withQuery(`/leagues/${leagueId}/h2h/${rivalEntryId}`, { accountId: options?.accountId }),
    options?.signal ? { signal: options.signal } : undefined,
  );
}

export function syncH2HRival(
  leagueId: number,
  rivalEntryId: number,
  options?: { accountId?: number; type?: "classic" | "h2h" },
) {
  return requestWithBody<RivalSyncResponse>(`/leagues/${leagueId}/sync`, "POST", {
    rivalEntryId,
    accountId: options?.accountId ?? 1,
    type: options?.type ?? "classic",
  });
}

export function getTeams() {
  return request<TeamSummary[]>("/teams");
}

export function getFixtures(params?: { event?: number; team?: number }) {
  return request<FixtureCard[]>(withQuery("/fixtures", { event: params?.event, team: params?.team }));
}

export function resolveAssetUrl(imagePath: string | null) {
  return imagePath ? `${API_ORIGIN}${imagePath}` : null;
}

export function getMyTeam(accountId?: number) {
  return request<MyTeamPageResponse>(withQuery("/my-team", { accountId }));
}

export function linkMyTeamAccount(code: string, codeVerifier: string, entryId?: number) {
  return requestWithBody<MyTeamPageResponse>("/my-team/auth", "POST", {
    code,
    codeVerifier,
    ...(entryId ? { entryId } : {}),
  });
}

export function syncMyTeam(params?: { accountId?: number; gameweek?: number; force?: boolean }) {
  return requestWithBody<MyTeamPageResponse>("/my-team/sync", "POST", params ?? {});
}

export function getMyTeamGameweekPicks(accountId: number, gameweek: number) {
  return request<MyTeamGameweekPicksResponse>(`/my-team/picks?accountId=${accountId}&gameweek=${gameweek}`);
}

export function getFdrData() {
  return request<FdrRow[]>("/fixtures/fdr");
}

export function getGwCalendar() {
  return request<GwCalendarRow[]>("/fixtures/calendar");
}

export function getPlayerXpts(gw?: number) {
  return request<PlayerXpts[]>(withQuery("/players/xpts", { gw }));
}

export function getCaptainRecommendation(accountId: number, gw: number) {
  return request<CaptainRecommendation[]>(withQuery("/my-team/captain-pick", { accountId, gw }));
}

export function getTransferDecision(
  accountId: number,
  params?: {
    gw?: number;
    horizon?: TransferDecisionHorizon;
    includeHits?: boolean;
    maxHit?: 0 | 4 | 8;
  },
) {
  return request<TransferDecisionResponse>(
    withQuery(`/my-team/${accountId}/transfer-decision`, {
      gw: params?.gw,
      horizon: params?.horizon,
      includeHits: params?.includeHits,
      maxHit: params?.maxHit,
    }),
  ).then((response) => ({
    ...response,
    replayState: response.replayState ?? "full",
    replayNotes: response.replayNotes ?? [],
    recommendedOptionId:
      response.recommendedOptionId ??
      response.options?.[0]?.id ??
      null,
    options: response.options ?? [],
  }));
}

export function getMyLeagues(accountId?: number) {
  return request<MyLeague[]>(withQuery("/my-team/leagues", { accountId }));
}

export function discoverMyLeagues(accountId?: number) {
  return requestWithBody<MyLeague[]>("/my-team/leagues/discover", "POST", accountId ? { accountId } : {});
}

export function getLeagueStandingsPage(
  leagueId: number,
  type: "classic" | "h2h",
  page = 1,
) {
  return request<LeagueStandingsPage>(
    withQuery(`/leagues/${leagueId}/standings`, { type, page }),
  );
}

export function getLiveGwSnapshot(gw: number) {
  return request<LiveGwUpdate>(`/live/gw/${gw}`);
}

export function subscribeLiveGw(
  gw: number,
  onUpdate: (u: LiveGwUpdate) => void,
): () => void {
  const es = new EventSource(buildApiUrl(`/live/gw/${gw}/stream`));
  es.onmessage = (e) => {
    try {
      onUpdate(JSON.parse(e.data) as LiveGwUpdate);
    } catch {
      /* ignore parse errors */
    }
  };
  // Suppress unhandled error events — EventSource auto-reconnects on failure
  // so ECONNREFUSED during API startup is recoverable without any action here.
  es.onerror = () => { /* reconnect handled automatically by the browser */ };
  return () => es.close();
}

export function getChatProviders() {
  return request<ProviderInfo[]>("/chat/providers");
}

export async function getChatGoogleAuthUrl(providerId: string) {
  const encodedProviderId = encodeURIComponent(providerId);
  const response = await request<{ url: string }>(`/chat/auth/google/start?providerId=${encodedProviderId}`);
  return response.url;
}

export async function streamChat(
  providerId: string,
  messages: ChatMessage[],
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const response = await fetch(buildApiUrl("/chat/stream"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ providerId, messages }),
  });

  if (!response.ok || !response.body) {
    const message = await response.text().catch(() => `Request failed: ${response.status}`);
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.body.getReader();
}
