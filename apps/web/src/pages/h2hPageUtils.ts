import type { H2HPlayerRef } from "@fpl/contracts";

export function formatOverlapLabel(overlapPct: number) {
  return `${overlapPct.toFixed(1)}% overlap`;
}

export function formatPlayerTag(player: H2HPlayerRef) {
  return `${player.webName} · ${player.positionName} · ${player.teamShortName}`;
}
