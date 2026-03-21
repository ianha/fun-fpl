import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, MotionConfig } from "framer-motion";
import type { PlayerCard, FixtureCard, TeamSummary } from "@fpl/contracts";
import { getOverview, getPlayers, getFixtures, resolveAssetUrl } from "@/api/client";
import { formatCost } from "@/lib/format";
import { GlowCard, BGPattern } from "@/components/ui/glow-card";
import { ArrowLeft, Users, Shield, Calendar } from "lucide-react";

type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

const POSITIONS: Record<number, { label: string; short: string; color: string }> = {
  1: { label: "Goalkeepers", short: "GKP", color: "bg-yellow-500/20 text-yellow-300" },
  2: { label: "Defenders", short: "DEF", color: "bg-blue-500/20 text-blue-300" },
  3: { label: "Midfielders", short: "MID", color: "bg-green-500/20 text-green-300" },
  4: { label: "Forwards", short: "FWD", color: "bg-pink-500/20 text-pink-300" },
};

interface TeamData {
  team: TeamSummary;
  players: PlayerCard[];
  upcomingFixtures: FixtureCard[];
}

const _teamDetailCache = new Map<number, TeamData>();

export function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<AsyncState<TeamData>>(() => {
    const numId = Number(id);
    const cached = _teamDetailCache.get(numId);
    return cached ? { status: "ready", data: cached } : { status: "loading" };
  });
  // Skip entrance animations when data was already in cache at mount time
  const noAnim = useRef(state.status === "ready").current;

  useEffect(() => {
    if (!id) return;
    const teamId = Number(id);
    const cached = _teamDetailCache.get(teamId);
    if (cached) {
      setState({ status: "ready", data: cached });
      return;
    }
    setState({ status: "loading" });

    Promise.all([
      getOverview(),
      getPlayers({ team: String(teamId) }),
      getFixtures({ team: teamId }),
    ])
      .then(([overview, players, fixtures]) => {
        const team = overview.teams.find((t) => t.id === teamId);
        if (!team) {
          setState({ status: "error", message: "Team not found" });
          return;
        }
        const data = { team, players, upcomingFixtures: fixtures.filter((f) => !f.finished) };
        _teamDetailCache.set(teamId, data);
        setState({ status: "ready", data });
      })
      .catch((e) => setState({ status: "error", message: e.message }));
  }, [id]);

  if (state.status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3">
        <p className="text-destructive">{state.message}</p>
        <Link to="/" className="text-sm text-primary underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const { team, players, upcomingFixtures } = state.data;
  const teamImg = resolveAssetUrl(team.imagePath);

  // Group players by position
  const byPosition = [1, 2, 3, 4]
    .map((posId) => ({
      posId,
      ...POSITIONS[posId],
      players: players.filter((p) => p.positionId === posId),
    }))
    .filter((g) => g.players.length > 0);

  return (
    <MotionConfig skipAnimations={noAnim}>
    <div className="relative min-h-screen text-white">
      <BGPattern variant="grid" mask="fade-edges" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Back */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Team Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <GlowCard className="p-8" glowColor="magenta">
            <div className="relative overflow-hidden">
              {/* Background decoration */}
              <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-accent/10 blur-2xl pointer-events-none" />

              <div className="relative flex items-center gap-6">
                {teamImg ? (
                  <img src={teamImg} alt={team.name} className="w-20 h-20 object-contain shrink-0" />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-white/8 flex items-center justify-center shrink-0">
                    <Shield className="w-10 h-10 text-white/20" />
                  </div>
                )}
                <div>
                  <h1 className="font-display text-3xl md:text-4xl font-bold">{team.name}</h1>
                  <p className="text-white/50 mt-1 text-sm">
                    {team.shortName} · Strength {team.strength}
                  </p>
                </div>
              </div>

              <div className="relative mt-6 grid grid-cols-3 gap-4">
                <div className="text-center bg-white/5 rounded-xl p-3">
                  <div className="font-display text-2xl font-bold text-accent">{players.length}</div>
                  <div className="text-[10px] uppercase tracking-wider text-white/40 mt-0.5">
                    Squad Players
                  </div>
                </div>
                <div className="text-center bg-white/5 rounded-xl p-3">
                  <div className="font-display text-2xl font-bold text-primary">
                    {upcomingFixtures.length}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-white/40 mt-0.5">
                    Upcoming
                  </div>
                </div>
                <div className="text-center bg-white/5 rounded-xl p-3">
                  <div className="font-display text-2xl font-bold text-white">{team.strength}</div>
                  <div className="text-[10px] uppercase tracking-wider text-white/40 mt-0.5">
                    Strength
                  </div>
                </div>
              </div>
            </div>
          </GlowCard>
        </motion.div>

        {/* Squad by position */}
        <div className="space-y-6">
          {byPosition.map((group, gi) => (
            <motion.div
              key={group.posId}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + gi * 0.08 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${group.color}`}>
                  {group.short}
                </span>
                <h2 className="font-display text-base font-bold text-white/80">{group.label}</h2>
                <span className="text-xs text-white/30">({group.players.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {group.players.map((player, pi) => {
                  const img = resolveAssetUrl(player.imagePath);
                  return (
                    <motion.div
                      key={player.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.05 * pi }}
                    >
                      <Link to={`/players/${player.id}`}>
                        <GlowCard
                          className="p-3.5 hover:scale-[1.02] transition-transform cursor-pointer"
                          glowColor="purple"
                        >
                          <div className="flex items-center gap-3">
                            {img ? (
                              <img
                                src={img}
                                alt={player.webName}
                                className="w-10 h-10 rounded-lg object-cover ring-1 ring-white/15 shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-white/8 flex items-center justify-center ring-1 ring-white/15 shrink-0">
                                <Users className="w-4 h-4 text-white/30" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm truncate">{player.webName}</p>
                              <div className="flex items-center gap-3 mt-0.5 text-xs">
                                <span className="text-accent font-bold">{player.totalPoints} pts</span>
                                <span className="text-white/40">{formatCost(player.nowCost)}</span>
                                <span className="text-white/40">
                                  Form {player.form.toFixed(1)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </GlowCard>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Upcoming fixtures */}
        {upcomingFixtures.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-5 h-5 text-accent" />
              <h2 className="font-display text-base font-bold text-white/80">Upcoming Fixtures</h2>
            </div>
            <GlowCard className="p-4" glowColor="teal">
              <div className="space-y-2">
                {upcomingFixtures.slice(0, 8).map((fixture) => {
                  const isHome = fixture.teamH === Number(id);
                  const opponent = isHome ? fixture.teamAName : fixture.teamHName;
                  const opponentShort = isHome ? fixture.teamAShortName : fixture.teamHShortName;
                  return (
                    <div
                      key={fixture.id}
                      className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2.5"
                    >
                      <span className="font-semibold text-sm flex-1">{opponentShort}</span>
                      <span className="text-xs text-white/40 flex-1 truncate">{opponent}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          isHome
                            ? "bg-accent/15 text-accent"
                            : "bg-white/10 text-white/50"
                        }`}
                      >
                        {isHome ? "H" : "A"}
                      </span>
                      {fixture.kickoffTime && (
                        <span className="text-[11px] text-white/30 shrink-0">
                          {new Date(fixture.kickoffTime).toLocaleDateString("en-GB", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </GlowCard>
          </motion.div>
        )}
      </div>
    </div>
    </MotionConfig>
  );
}
