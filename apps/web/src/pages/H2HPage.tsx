import type { H2HComparisonResponse } from "@fpl/contracts";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getH2HComparison } from "@/api/client";
import { GlowCard } from "@/components/ui/glow-card";
import { formatOverlapLabel, formatPlayerTag } from "./h2hPageUtils";

type AsyncState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: H2HComparisonResponse };

const _h2hCache = new Map<string, H2HComparisonResponse>();

export function resetH2HPageCacheForTests() {
  _h2hCache.clear();
}

export function H2HPage() {
  const { leagueId, rivalEntryId } = useParams<{ leagueId?: string; rivalEntryId?: string }>();
  const [state, setState] = useState<AsyncState>({ status: "loading" });

  useEffect(() => {
    if (!leagueId || !rivalEntryId) {
      setState({
        status: "ready",
        payload: {
          syncRequired: true,
          rivalEntry: null,
          squadOverlap: null,
          gmRankHistory: [],
        },
      });
      return;
    }

    const cacheKey = `${leagueId}:${rivalEntryId}`;
    const cached = _h2hCache.get(cacheKey);
    if (cached) {
      setState({ status: "ready", payload: cached });
      return;
    }

    let active = true;
    setState({ status: "loading" });

    getH2HComparison(Number(leagueId), Number(rivalEntryId))
      .then((payload) => {
        if (!active) return;
        _h2hCache.set(cacheKey, payload);
        setState({ status: "ready", payload });
      })
      .catch((error) => {
        if (!active) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      active = false;
    };
  }, [leagueId, rivalEntryId]);

  if (state.status === "loading") {
    return <div className="p-6 text-white/80">Loading mini-league comparison…</div>;
  }

  if (state.status === "error") {
    return <div className="p-6 text-red-300">{state.message}</div>;
  }

  if (!leagueId || !rivalEntryId || !state.payload.rivalEntry) {
    return (
      <div className="p-6">
        <GlowCard className="p-6">
          <h1 className="font-display text-2xl font-bold text-white">Mini-League</h1>
          <p className="mt-3 text-sm text-white/70">
            Open a synced rival comparison route to view overlap and manager history.
          </p>
          <p className="mt-2 text-xs text-white/45">
            Example path: <code>/leagues/99/h2h/501</code>
          </p>
        </GlowCard>
      </div>
    );
  }

  if (state.payload.syncRequired || !state.payload.squadOverlap) {
    return (
      <div className="p-6">
        <GlowCard className="p-6">
          <h1 className="font-display text-2xl font-bold text-white">{state.payload.rivalEntry.teamName}</h1>
          <p className="mt-3 text-sm text-white/70">
            Sync this rival to load comparison insights.
          </p>
          <p className="mt-2 text-xs text-white/45">
            Rival: {state.payload.rivalEntry.playerName}
          </p>
        </GlowCard>
      </div>
    );
  }

  const { rivalEntry, squadOverlap, gmRankHistory } = state.payload;

  return (
    <div className="space-y-6 p-6">
      <GlowCard className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-white">{rivalEntry.teamName}</h1>
            <p className="mt-1 text-sm text-white/65">
              {rivalEntry.playerName} · Rank #{rivalEntry.rank} · {rivalEntry.totalPoints} pts
            </p>
          </div>
          <Link to="/leagues" className="text-sm text-accent underline-offset-4 hover:underline">
            Mini-League hub
          </Link>
        </div>
      </GlowCard>

      <GlowCard className="p-6">
        <h2 className="font-display text-xl font-semibold text-white">Squad overlap</h2>
        <p className="mt-2 text-lg font-semibold text-accent">{formatOverlapLabel(squadOverlap.overlapPct)}</p>
        <p className="mt-1 text-sm text-white/55">GW {squadOverlap.gameweek}</p>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white/55">Shared players</h3>
            <ul className="mt-2 space-y-2 text-sm text-white/80">
              {squadOverlap.sharedPlayers.map((player) => (
                <li key={`shared-${player.id}`}>{formatPlayerTag(player)}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white/55">Your differentials</h3>
            <ul className="mt-2 space-y-2 text-sm text-white/80">
              {squadOverlap.userOnlyPlayers.map((player) => (
                <li key={`user-${player.id}`}>{formatPlayerTag(player)}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white/55">Rival differentials</h3>
            <ul className="mt-2 space-y-2 text-sm text-white/80">
              {squadOverlap.rivalOnlyPlayers.map((player) => (
                <li key={`rival-${player.id}`}>{formatPlayerTag(player)}</li>
              ))}
            </ul>
          </section>
        </div>
      </GlowCard>

      <GlowCard className="p-6">
        <h2 className="font-display text-xl font-semibold text-white">Manager history</h2>
        <div className="mt-4 space-y-2">
          {gmRankHistory.map((row) => (
            <div key={row.gameweek} className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-3 text-sm text-white/80">
              <span>GW {row.gameweek}</span>
              <span>You #{row.userOverallRank.toLocaleString()}</span>
              <span>Rival #{row.rivalOverallRank.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </GlowCard>
    </div>
  );
}
