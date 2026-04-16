import type { H2HComparisonResponse, H2HPositionAuditRow } from "@fpl/contracts";

export const H2H_CHAT_SEED_KEY = "fpl-chat-seed";

export type H2HChatSeedPayload = {
  source: "h2h-rival-summary";
  createdAt: string;
  leagueId: number;
  rivalEntryId: number;
  rivalTeamName: string;
  prompt: string;
};

function formatSigned(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function formatRank(rank: number) {
  return `#${rank.toLocaleString()}`;
}

function summarizeHistory(comparison: H2HComparisonResponse) {
  if (comparison.gmRankHistory.length === 0) {
    return "No shared gameweek rank history is available yet.";
  }

  const first = comparison.gmRankHistory[0];
  const last = comparison.gmRankHistory[comparison.gmRankHistory.length - 1];
  return `Shared GW history spans ${comparison.gmRankHistory.length} weeks, from GW ${first.gameweek} to GW ${last.gameweek}. Your overall rank moved from ${formatRank(first.userOverallRank)} to ${formatRank(last.userOverallRank)}. Rival moved from ${formatRank(first.rivalOverallRank)} to ${formatRank(last.rivalOverallRank)}.`;
}

function summarizePosition(row: H2HPositionAuditRow) {
  return `- ${row.positionName}: points ${row.userPoints} vs ${row.rivalPoints} (${formatSigned(row.pointDelta)} for me), spend £${row.userSpend.toFixed(1)}m vs £${row.rivalSpend.toFixed(1)}m, value ${row.userValuePerMillion.toFixed(1)} vs ${row.rivalValuePerMillion.toFixed(1)} pts/£m, trend ${row.trend}.`;
}

function summarizeLuck(comparison: H2HComparisonResponse) {
  if (!comparison.luckVsSkill) {
    return "Luck vs skill data is unavailable.";
  }

  const luck = comparison.luckVsSkill;
  return `Luck vs skill through GW ${luck.basedOnGameweek}: actual delta ${formatSigned(luck.actualDelta)} pts, expected delta ${luck.expectedDelta === null ? "unavailable" : `${luck.expectedDelta > 0 ? "+" : ""}${luck.expectedDelta.toFixed(1)}`}, variance edge ${luck.varianceEdge === null ? "unavailable" : `${luck.varianceEdge > 0 ? "+" : ""}${luck.varianceEdge.toFixed(1)}`}, verdict ${luck.verdict}, data quality ${luck.dataQuality}, missing projections ${luck.missingPlayerProjections}.`;
}

function summarizeDifferentials(comparison: H2HComparisonResponse) {
  if (!comparison.squadOverlap) {
    return "Current differential data is unavailable.";
  }

  const overlap = comparison.squadOverlap;
  const userDiffs = overlap.userOnlyPlayers.map((player) => player.webName).join(", ") || "none";
  const rivalDiffs = overlap.rivalOnlyPlayers.map((player) => player.webName).join(", ") || "none";

  return `Current squad overlap is ${overlap.overlapPct.toFixed(1)}% in GW ${overlap.gameweek}. My differentials: ${userDiffs}. Rival differentials: ${rivalDiffs}.`;
}

export function buildH2HChatPrompt(
  leagueId: number,
  rivalEntryId: number,
  comparison: H2HComparisonResponse,
) {
  const rival = comparison.rivalEntry;
  if (!rival || !comparison.squadOverlap) {
    throw new Error("Cannot build H2H chat prompt without a synced rival comparison.");
  }

  const attribution = comparison.attribution;
  const syncStatus = comparison.syncStatus;
  const overallGap = attribution
    ? `${formatSigned(attribution.totalPointDelta)} pts`
    : `${formatSigned((comparison.luckVsSkill?.actualDelta ?? 0))} pts`;

  const positionalLines =
    comparison.positionalAudit?.rows.map(summarizePosition).join("\n") ?? "No positional audit rows available.";

  const attributionLines = attribution
    ? [
        `- Captaincy: me ${attribution.captaincy.userPoints}, rival ${attribution.captaincy.rivalPoints}, delta ${formatSigned(attribution.captaincy.delta)}.`,
        `- Transfers: me net ${formatSigned(attribution.transfers.userNetImpact)} with -${attribution.transfers.userHitCost} in hits; rival net ${formatSigned(attribution.transfers.rivalNetImpact)} with -${attribution.transfers.rivalHitCost} in hits; delta ${formatSigned(attribution.transfers.delta)}.`,
        `- Bench: me ${attribution.bench.userPointsOnBench} bench points, rival ${attribution.bench.rivalPointsOnBench}, delta ${formatSigned(attribution.bench.delta)}.`,
      ].join("\n")
    : "No attribution data available.";

  return [
    `Please write a detailed Fantasy Premier League head-to-head rival report for my mini-league comparison.`,
    ``,
    `Context:`,
    `- League ID: ${leagueId}`,
    `- Rival entry ID: ${rivalEntryId}`,
    `- Rival team: ${rival.teamName}`,
    `- Rival manager: ${rival.playerName}`,
    `- Rival rank: ${formatRank(rival.rank)}`,
    `- Rival total points: ${rival.totalPoints}`,
    `- Overall season gap from the H2H page: ${overallGap} in my favor if positive, rival's favor if negative.`,
    `- Snapshot freshness: current GW ${syncStatus.currentGameweek ?? "unknown"}, last synced GW ${syncStatus.lastSyncedGw ?? "unknown"}, stale ${syncStatus.stale ? "yes" : "no"}.`,
    ``,
    `Key H2H data from the page:`,
    attributionLines,
    positionalLines,
    `- ${summarizeLuck(comparison)}`,
    `- ${summarizeDifferentials(comparison)}`,
    `- ${summarizeHistory(comparison)}`,
    ``,
    `Please explain:`,
    `1. Why this rival is overperforming or underperforming relative to me across the season to the current gameweek.`,
    `2. Which factors matter most: captaincy, positions, transfers and hits, bench usage, overlap and differentials, and luck vs skill.`,
    `3. Where my squad process looks stronger or weaker than this rival's.`,
    `4. What concrete changes or strategic adjustments I should consider if I want to improve relative to this rival.`,
    ``,
    `Important constraints:`,
    `- Use only the supplied data and do not invent statistics.`,
    `- If the data is stale or partial, say that clearly.`,
    `- Organize the answer with clear section headings.`,
    `- Make the advice practical for an FPL manager, not generic.`,
  ].join("\n");
}

export function storePendingH2HChatSeed(payload: H2HChatSeedPayload) {
  sessionStorage.setItem(H2H_CHAT_SEED_KEY, JSON.stringify(payload));
}

export function loadPendingH2HChatSeed(): H2HChatSeedPayload | null {
  const raw = sessionStorage.getItem(H2H_CHAT_SEED_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as H2HChatSeedPayload;
  } catch {
    return null;
  }
}

export function clearPendingH2HChatSeed() {
  sessionStorage.removeItem(H2H_CHAT_SEED_KEY);
}
