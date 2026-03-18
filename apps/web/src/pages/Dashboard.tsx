import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { OverviewResponse } from "@fpl/contracts";
import { getOverview, resolveAssetUrl } from "@/api/client";
import { formatCost } from "@/lib/format";
import { GlowCard, BGPattern } from "@/components/ui/glow-card";
import {
  TrendingUp,
  Users,
  Trophy,
  Calendar,
  ChevronRight,
  Star,
  Clock,
  Zap,
} from "lucide-react";

type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

const POSITION_LABELS: Record<number, { short: string; color: string }> = {
  1: { short: "GKP", color: "bg-yellow-500/15 text-yellow-300" },
  2: { short: "DEF", color: "bg-blue-500/15 text-blue-300" },
  3: { short: "MID", color: "bg-emerald-500/15 text-emerald-300" },
  4: { short: "FWD", color: "bg-[#635BFF]/15 text-[#7A73FF]" },
};


export function Dashboard() {
  const [state, setState] = useState<AsyncState<OverviewResponse>>({ status: "loading" });

  useEffect(() => {
    getOverview()
      .then((data) => setState({ status: "ready", data }))
      .catch((e) => setState({ status: "error", message: e.message }));
  }, []);

  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A2540]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#635BFF] border-t-transparent" />
          <p className="text-sm text-[#8899AA]">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-destructive">{state.message}</p>
      </div>
    );
  }

  const { topPlayers, fixtures, gameweeks } = state.data;
  const currentGW = gameweeks.find((gw) => gw.isCurrent) ?? gameweeks[gameweeks.length - 1];
  const nextGW = gameweeks.find((gw) => !gw.isFinished && !gw.isCurrent);

  const heroStats = [
    {
      label: "Gameweek",
      value: currentGW ? `GW ${currentGW.id}` : "—",
      icon: <Trophy className="w-4 h-4" />,
      trend: currentGW?.isFinished ? "Finished" : "Live",
    },
    {
      label: "Next Deadline",
      value: nextGW?.deadlineTime
        ? new Date(nextGW.deadlineTime).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
        : "—",
      icon: <Clock className="w-4 h-4" />,
      trend: nextGW?.deadlineTime
        ? new Date(nextGW.deadlineTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
        : "",
    },
    {
      label: "Top Players",
      value: topPlayers.length,
      icon: <TrendingUp className="w-4 h-4" />,
      trend: "Tracked",
    },
    {
      label: "Fixtures",
      value: fixtures.length,
      icon: <Calendar className="w-4 h-4" />,
      trend: "This GW",
    },
  ];

  return (
    <div className="min-h-screen w-full text-white relative overflow-x-hidden bg-[#0A2540]">
      <BGPattern variant="grid" mask="fade-edges" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <GlowCard className="p-8 md:p-10" glowColor="magenta">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#00D4AA]" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-[#00D4AA]">
                    Fantasy Premier League
                  </span>
                </div>
                <h1 className="font-display text-4xl md:text-5xl font-bold text-white">
                  {currentGW ? `Gameweek ${currentGW.id}` : "FPL Analytics"}
                </h1>
                {nextGW?.deadlineTime && (
                  <p className="text-white/60 text-base">
                    Deadline:{" "}
                    {new Date(nextGW.deadlineTime).toLocaleDateString("en-GB", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                )}
                <div className="flex flex-wrap gap-3 pt-1">
                  <Link to="/players">
                    <button className="px-5 py-2.5 bg-[#635BFF] hover:bg-[#7A73FF] rounded-full transition-all flex items-center gap-2 text-sm font-semibold cursor-pointer">
                      Browse Players
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </Link>
                  <Link to="/fixtures">
                    <button className="px-5 py-2.5 bg-transparent border border-white/30 hover:border-white/50 rounded-full transition-all text-sm font-semibold cursor-pointer">
                      View Fixtures
                    </button>
                  </Link>
                </div>
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-2 gap-3 shrink-0">
                {heroStats.map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 + i * 0.08 }}
                    className="bg-[#0B1D33] border border-white/[0.08] rounded-xl p-4 min-w-[130px]"
                  >
                    <div className="flex items-center gap-1.5 mb-2 text-[#8899AA]">
                      {stat.icon}
                      <span className="text-[10px] uppercase tracking-wider">{stat.label}</span>
                    </div>
                    <div className="font-display text-2xl font-bold text-white">{stat.value}</div>
                    {stat.trend && (
                      <div className="text-[11px] text-accent mt-0.5">{stat.trend}</div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          </GlowCard>
        </motion.div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Top players */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-400" />
                Top Performers
              </h2>
              <Link
                to="/players"
                className="text-xs text-white/50 hover:text-primary transition-colors flex items-center gap-1"
              >
                View all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {topPlayers.slice(0, 6).map((player, i) => {
                const img = resolveAssetUrl(player.imagePath);
                const pos = POSITION_LABELS[player.positionId];
                return (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i }}
                  >
                    <Link to={`/players/${player.id}`}>
                      <GlowCard
                        className="p-5 hover:scale-[1.02] transition-transform cursor-pointer"
                        glowColor="purple"
                      >
                        <div className="flex items-start gap-4">
                          <div className="relative shrink-0">
                            {img ? (
                              <img
                                src={img}
                                alt={player.webName}
                                className="w-14 h-14 rounded-xl object-cover ring-1 ring-white/15"
                              />
                            ) : (
                              <div className="w-14 h-14 rounded-xl bg-white/8 flex items-center justify-center ring-1 ring-white/15">
                                <Users className="w-6 h-6 text-white/40" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-sm truncate">{player.webName}</h3>
                            <div className="flex items-center gap-2 text-xs text-white/50 mb-3 mt-0.5">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pos?.color ?? ""}`}>
                                {pos?.short}
                              </span>
                              <span>{player.teamShortName}</span>
                            </div>
                            <div className="grid grid-cols-4 gap-1 text-xs">
                              {[
                                { label: "Pts", value: player.totalPoints, color: "text-accent" },
                                { label: "Form", value: Number(player.form).toFixed(1), color: "text-primary" },
                                { label: "Price", value: formatCost(player.nowCost), color: "text-white" },
                                { label: "xGI", value: player.expectedGoalInvolvements.toFixed(1), color: "text-white" },
                              ].map(({ label, value, color }) => (
                                <div key={label}>
                                  <div className="text-[10px] text-white/40">{label}</div>
                                  <div className={`font-bold ${color}`}>{value}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </GlowCard>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Fixtures + quick stats */}
          <div className="space-y-4">
            <h2 className="font-display text-xl font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-accent" />
              Fixtures
            </h2>

            <GlowCard className="p-5" glowColor="teal">
              <div className="space-y-2.5">
                {fixtures.slice(0, 6).map((fixture, i) => (
                  <motion.div
                    key={fixture.id}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i }}
                    className="bg-white/5 border border-white/8 rounded-xl px-4 py-3 hover:bg-white/10 transition-colors"
                  >
                    {fixture.kickoffTime && (
                      <div className="mb-1.5">
                        <span className="text-[11px] text-white/40">
                          {new Date(fixture.kickoffTime).toLocaleDateString("en-GB", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{fixture.teamHShortName}</span>
                      {fixture.teamHScore !== null && fixture.teamAScore !== null ? (
                        <span className="font-display font-bold text-accent">
                          {fixture.teamHScore}–{fixture.teamAScore}
                        </span>
                      ) : (
                        <span className="text-white/40 text-xs">vs</span>
                      )}
                      <span className="font-semibold">{fixture.teamAShortName}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </GlowCard>

            {/* Quick stats */}
            <GlowCard className="p-5" glowColor="purple">
              <h3 className="font-bold text-sm mb-3 text-white/80">Season Stats</h3>
              <div className="space-y-2.5">
                {[
                  { label: "Gameweeks played", value: gameweeks.filter((g) => g.isFinished).length },
                  { label: "Total fixtures", value: fixtures.length },
                  { label: "GWs remaining", value: gameweeks.filter((g) => !g.isFinished).length },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-sm text-white/50">{label}</span>
                    <span className="font-display font-bold text-accent">{value}</span>
                  </div>
                ))}
              </div>
            </GlowCard>
          </div>
        </div>
      </div>
    </div>
  );
}
