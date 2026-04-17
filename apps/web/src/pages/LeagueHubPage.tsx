import type { H2HLeagueStanding, LeagueStandingsPage, MyLeague } from "@fpl/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, MotionConfig, useMotionValue, useMotionTemplate, animate } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Medal,
  RefreshCw,
  Search,
  Sparkles,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { discoverMyLeagues, getLeagueStandingsPage, getMyLeagues } from "@/api/client";
import { GlowCard, BGPattern } from "@/components/ui/glow-card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type StandingsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      page: LeagueStandingsPage;
      league: MyLeague;
      fetchingNext: boolean;
    };

function leagueKey(league: MyLeague) {
  return `${league.leagueType}:${league.leagueId}`;
}

export function LeagueHubPage() {
  const [leagues, setLeagues] = useState<MyLeague[] | null>(null);
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [standingsState, setStandingsState] = useState<StandingsState>({ status: "idle" });
  const navigate = useNavigate();

  const color = useMotionValue("#a855f7");
  useEffect(() => {
    animate(color, ["#a855f7", "#e90052", "#00ffbf", "#a855f7"], {
      ease: "easeInOut",
      duration: 14,
      repeat: Infinity,
      repeatType: "mirror",
    });
  }, [color]);
  const backgroundImage = useMotionTemplate`radial-gradient(125% 125% at 50% 0%, #0d0118 55%, ${color})`;

  useEffect(() => {
    getMyLeagues()
      .then((data) => {
        setLeagues(data);
      })
      .catch(() => {
        setLeagues([]);
      })
      .finally(() => {
        setLoadingLeagues(false);
      });
  }, []);

  const sortedLeagues = useMemo(() => {
    if (!leagues) return [];
    return [...leagues].sort((a, b) => {
      if (a.leagueType !== b.leagueType) return a.leagueType === "h2h" ? -1 : 1;
      return a.leagueName.localeCompare(b.leagueName);
    });
  }, [leagues]);

  const classicLeagues = useMemo(
    () => sortedLeagues.filter((l) => l.leagueType === "classic"),
    [sortedLeagues],
  );
  const h2hLeagues = useMemo(
    () => sortedLeagues.filter((l) => l.leagueType === "h2h"),
    [sortedLeagues],
  );

  const selectedLeague = useMemo(
    () => sortedLeagues.find((l) => leagueKey(l) === selectedKey) ?? null,
    [sortedLeagues, selectedKey],
  );

  // auto-select the first league (H2H preferred) once leagues load
  useEffect(() => {
    if (selectedKey || sortedLeagues.length === 0) return;
    setSelectedKey(leagueKey(sortedLeagues[0]));
  }, [sortedLeagues, selectedKey]);

  // reset to page 1 whenever the selected league changes
  useEffect(() => {
    setPage(1);
  }, [selectedKey]);

  // fetch the current page of standings; only one page at a time
  useEffect(() => {
    if (!selectedLeague) return;

    let active = true;
    setStandingsState((prev) =>
      prev.status === "ready" && prev.league.leagueId === selectedLeague.leagueId
        ? { ...prev, fetchingNext: true }
        : { status: "loading" },
    );

    getLeagueStandingsPage(selectedLeague.leagueId, selectedLeague.leagueType, page)
      .then((result) => {
        if (!active) return;
        setStandingsState({
          status: "ready",
          page: result,
          league: selectedLeague,
          fetchingNext: false,
        });
      })
      .catch((error) => {
        if (!active) return;
        setStandingsState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      active = false;
    };
  }, [selectedLeague, page]);

  async function handleDiscover() {
    setDiscovering(true);
    setDiscoverError(null);
    try {
      const data = await discoverMyLeagues();
      setLeagues(data);
    } catch (error) {
      setDiscoverError(error instanceof Error ? error.message : String(error));
    } finally {
      setDiscovering(false);
    }
  }

  const noAnim = useRef(false).current;
  const hasLeagues = sortedLeagues.length > 0;
  const isReady = standingsState.status === "ready";
  const currentPage = isReady ? standingsState.page : null;
  const canPrev = page > 1;
  const canNext = Boolean(currentPage?.hasNext);
  const rangeStart = currentPage ? (currentPage.page - 1) * 50 + 1 : 0;
  const rangeEnd = currentPage ? rangeStart + currentPage.pageSize - 1 : 0;

  return (
    <MotionConfig skipAnimations={noAnim}>
      <motion.div
        style={{ backgroundImage }}
        className="min-h-screen w-full text-white relative overflow-x-hidden"
      >
        <BGPattern variant="grid" mask="fade-edges" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* Hero banner */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <GlowCard className="p-6 md:p-8" glowColor="magenta">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-accent" />
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-accent">
                      Rival scouting
                    </span>
                  </div>
                  <h1 className="font-display text-3xl md:text-4xl font-bold bg-gradient-to-r from-white via-purple-200 to-pink-200 bg-clip-text text-transparent">
                    Mini-League
                  </h1>
                  <p className="max-w-xl text-sm text-white/60">
                    Pick a league to see its managers, then scout a rival head-to-head with captain
                    swings, squad overlap and positional audits.
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-stretch gap-3 md:items-end">
                  <button
                    type="button"
                    onClick={() => {
                      void handleDiscover();
                    }}
                    disabled={discovering || loadingLeagues}
                    className="group inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-all hover:from-primary/90 hover:to-purple-500 hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {discovering ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    {discovering ? "Discovering…" : "Discover my leagues"}
                  </button>
                  {hasLeagues && (
                    <div className="flex items-center gap-2 text-[11px] text-white/45">
                      <StatPill label="Classic" value={classicLeagues.length} />
                      <StatPill label="H2H" value={h2hLeagues.length} accent />
                    </div>
                  )}
                </div>
              </div>
            </GlowCard>
          </motion.div>

          {discoverError && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <GlowCard className="p-4">
                <p className="text-sm text-rose-300">{discoverError}</p>
              </GlowCard>
            </motion.div>
          )}

          {loadingLeagues ? (
            <GlowCard className="p-10">
              <div className="flex items-center justify-center gap-3 text-sm text-white/60">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Loading your leagues…
              </div>
            </GlowCard>
          ) : !hasLeagues ? (
            <EmptyState onDiscover={handleDiscover} discovering={discovering} />
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <GlowCard className="overflow-hidden" glowColor={selectedLeague?.leagueType === "h2h" ? "teal" : "purple"}>
                {/* League picker */}
                <div className="flex flex-col gap-3 border-b border-white/8 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1",
                        selectedLeague?.leagueType === "h2h"
                          ? "bg-accent/15 text-accent ring-accent/25"
                          : "bg-primary/15 text-primary ring-primary/25",
                      )}
                    >
                      {selectedLeague?.leagueType === "h2h" ? (
                        <Swords className="h-4 w-4" />
                      ) : (
                        <Trophy className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                        League
                      </p>
                      <Select
                        value={selectedKey ?? undefined}
                        onValueChange={(v) => setSelectedKey(v)}
                      >
                        <SelectTrigger className="mt-1 h-auto w-full min-w-0 max-w-[280px] border-white/10 bg-white/[0.04] py-1.5 text-[15px] font-semibold text-white hover:bg-white/[0.07] sm:min-w-[240px]">
                          <SelectValue placeholder="Select a league" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[340px]">
                          {h2hLeagues.length > 0 && (
                            <SelectGroup>
                              <SelectLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-accent/80">
                                <Swords className="h-3 w-3" />
                                Head-to-head
                              </SelectLabel>
                              {h2hLeagues.map((l) => (
                                <SelectItem key={leagueKey(l)} value={leagueKey(l)}>
                                  {l.leagueName}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                          {classicLeagues.length > 0 && (
                            <SelectGroup>
                              <SelectLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-primary/80">
                                <Trophy className="h-3 w-3" />
                                Classic
                              </SelectLabel>
                              {classicLeagues.map((l) => (
                                <SelectItem key={leagueKey(l)} value={leagueKey(l)}>
                                  {l.leagueName}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {selectedLeague && (
                    <div className="flex items-center gap-2">
                      <Badge variant={selectedLeague.leagueType === "h2h" ? "teal" : "default"}>
                        {selectedLeague.leagueType === "h2h" ? "H2H" : "Classic"}
                      </Badge>
                      {currentPage && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-white/65">
                          <Users className="h-3 w-3" />
                          {rangeStart}–{rangeEnd}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Members body */}
                {standingsState.status === "loading" && (
                  <div className="flex items-center justify-center gap-3 px-6 py-12 text-sm text-white/60">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                    Loading standings…
                  </div>
                )}

                {standingsState.status === "error" && (
                  <div className="px-6 py-8">
                    <p className="text-sm text-rose-300">{standingsState.message}</p>
                  </div>
                )}

                {isReady && currentPage && (
                  <>
                    <div className="flex items-center justify-between border-b border-white/5 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/35 sm:px-6">
                      <span>Manager</span>
                      <span className="flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        Click to scout
                      </span>
                    </div>
                    <div
                      className={cn(
                        "divide-y divide-white/5 transition-opacity",
                        standingsState.fetchingNext && "opacity-60",
                      )}
                    >
                      {currentPage.standings.map((entry) => (
                        <StandingRow
                          key={entry.entryId}
                          entry={entry}
                          highlight={entry.rank <= 3}
                          onSelect={() => {
                            navigate(
                              `/leagues/${standingsState.league.leagueId}/h2h/${entry.entryId}`,
                            );
                          }}
                        />
                      ))}
                    </div>
                    {(canPrev || canNext) && (
                      <div className="flex items-center justify-between border-t border-white/8 px-5 py-3 sm:px-6">
                        <button
                          type="button"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={!canPrev || standingsState.fetchingNext}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          Previous
                        </button>
                        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
                          Page {currentPage.page}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPage((p) => p + 1)}
                          disabled={!canNext || standingsState.fetchingNext}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Next
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </GlowCard>
            </motion.div>
          )}
        </div>
      </motion.div>
    </MotionConfig>
  );
}

function StatPill({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium backdrop-blur-sm",
        accent
          ? "border-accent/25 bg-accent/10 text-accent"
          : "border-white/10 bg-white/5 text-white/65",
      )}
    >
      <span className="font-display text-sm font-bold tabular-nums text-white">{value}</span>
      <span className="uppercase tracking-wider">{label}</span>
    </span>
  );
}

function EmptyState({
  onDiscover,
  discovering,
}: {
  onDiscover: () => void;
  discovering: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <GlowCard className="p-10 text-center" glowColor="teal">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-accent/20 ring-1 ring-white/15">
          <Sparkles className="h-6 w-6 text-accent" />
        </div>
        <h2 className="mt-4 font-display text-xl font-bold text-white">No leagues synced yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
          Pull your classic and H2H leagues directly from your synced FPL account to start scouting
          rivals. Make sure you've connected your team first.
        </p>
        <button
          type="button"
          onClick={onDiscover}
          disabled={discovering}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:from-primary/90 hover:to-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {discovering ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {discovering ? "Discovering…" : "Discover my leagues"}
        </button>
      </GlowCard>
    </motion.div>
  );
}

function StandingRow({
  entry,
  highlight,
  onSelect,
}: {
  entry: H2HLeagueStanding;
  highlight: boolean;
  onSelect: () => void;
}) {
  const rankBadge = getRankBadge(entry.rank);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-white/[0.04] sm:px-6 sm:gap-4"
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-display text-sm font-bold tabular-nums",
          rankBadge.className,
        )}
      >
        {rankBadge.icon ?? `#${entry.rank}`}
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-white">{entry.teamName}</p>
          {highlight && entry.rank === 1 && (
            <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-widest text-yellow-300/80">
              Leader
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-white/45">{entry.playerName}</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-display text-sm font-bold tabular-nums text-white">
            {entry.totalPoints.toLocaleString()}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-white/35">pts</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/25 transition-all group-hover:translate-x-0.5 group-hover:text-accent" />
      </div>
    </button>
  );
}

function getRankBadge(rank: number): { icon: React.ReactNode | null; className: string } {
  if (rank === 1) {
    return {
      icon: <Crown className="h-4 w-4" />,
      className:
        "bg-gradient-to-br from-yellow-300/25 to-amber-500/15 text-yellow-300 ring-1 ring-yellow-300/30",
    };
  }
  if (rank === 2) {
    return {
      icon: <Medal className="h-4 w-4" />,
      className:
        "bg-gradient-to-br from-slate-200/20 to-slate-400/10 text-slate-100 ring-1 ring-slate-200/25",
    };
  }
  if (rank === 3) {
    return {
      icon: <Medal className="h-4 w-4" />,
      className:
        "bg-gradient-to-br from-orange-400/25 to-amber-700/15 text-orange-300 ring-1 ring-orange-400/30",
    };
  }
  return {
    icon: null,
    className: "bg-white/5 text-white/60 ring-1 ring-white/10",
  };
}
