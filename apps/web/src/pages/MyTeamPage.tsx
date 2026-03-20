import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRightLeft, Coins, Crown, RefreshCcw, ShieldAlert, Sparkles, Wand2 } from "lucide-react";
import type { MyTeamPageResponse, MyTeamPick, PlayerCard } from "@fpl/contracts";
import { getMyTeam, getPlayers, linkMyTeamAccount, resolveAssetUrl, syncMyTeam } from "@/api/client";
import { BGPattern, GlowCard } from "@/components/ui/glow-card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCost } from "@/lib/format";
import {
  evaluatePlanner,
  getAvailableCandidates,
  replaceSquadPlayer,
  type PlannerChip,
  type SquadEntry,
} from "@/lib/my-team";

type AsyncState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: MyTeamPageResponse; allPlayers: PlayerCard[] };

const POSITION_LABELS: Record<number, string> = {
  1: "GKP",
  2: "DEF",
  3: "MID",
  4: "FWD",
};

const CHIPS: Array<{ id: PlannerChip; label: string }> = [
  { id: "none", label: "No chip" },
  { id: "wildcard", label: "Wildcard" },
  { id: "free-hit", label: "Free Hit" },
  { id: "bench-boost", label: "Bench Boost" },
  { id: "triple-captain", label: "Triple Captain" },
];

function summarizeAuthError(error: string | null) {
  if (!error) {
    return "Please re-enter your FPL password and try the sync again.";
  }

  if (error.includes("no FPL team entry ID")) {
    return "We could sign in, but FPL did not expose your team entry automatically. Add your current season entry ID below, then relink.";
  }

  if (error.includes("FPL login failed")) {
    return "Your saved FPL password is no longer being accepted. Re-enter it below to relink this account.";
  }

  if (error.includes("FPL request failed (401)") || error.includes("FPL request failed (403)")) {
    return "FPL rejected the authenticated session for this account. Re-enter your credentials and try again.";
  }

  return "This account needs to be relinked before it can sync fresh FPL data.";
}

function toSquadEntry(pick: MyTeamPick): SquadEntry {
  return {
    slotId: pick.slotId,
    player: pick.player,
    role: pick.role,
    benchOrder: pick.benchOrder,
    isCaptain: pick.isCaptain,
    isViceCaptain: pick.isViceCaptain,
  };
}

function StatCard({
  label,
  value,
  accent = "text-white",
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div
      className="rounded-xl border border-white/10 bg-white/6 p-4 backdrop-blur-xl"
      role="group"
      aria-label={`${label}: ${value}`}
    >
      <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">{label}</div>
      <div className={cn("mt-2 font-display text-2xl font-bold", accent)}>{value}</div>
    </div>
  );
}

function PitchPlayerCard({
  entry,
  onSelect,
  isSelected,
}: {
  entry: SquadEntry;
  onSelect: (entry: SquadEntry) => void;
  isSelected: boolean;
}) {
  const image = resolveAssetUrl(entry.player.imagePath);

  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      aria-label={`Replace ${entry.player.webName}`}
      className={cn(
        "group flex min-h-28 w-full min-w-[124px] flex-col items-center rounded-2xl border p-3 text-center transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelected
          ? "border-primary/70 bg-primary/12 shadow-[0_0_30px_rgba(233,0,82,0.18)]"
          : "border-white/10 bg-[rgba(17,6,39,0.7)] hover:border-white/20 hover:bg-white/8",
      )}
    >
      <div className="relative mb-2">
        {image ? (
          <img
            src={image}
            alt={entry.player.webName}
            className="h-14 w-14 rounded-2xl object-cover ring-1 ring-white/15"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <ShieldAlert className="h-5 w-5 text-white/40" />
          </div>
        )}
        {entry.isCaptain && (
          <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
            C
          </span>
        )}
        {!entry.isCaptain && entry.isViceCaptain && (
          <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-[11px] font-bold text-white">
            V
          </span>
        )}
      </div>

      <div className="text-xs font-semibold text-white">{entry.player.webName}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/45">
        {POSITION_LABELS[entry.player.positionId]} • {entry.player.teamShortName}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-white/65">
        <span>{formatCost(entry.player.nowCost)}</span>
        <span className="text-accent">{entry.player.form.toFixed(1)} form</span>
      </div>
      <div className="mt-2 text-[10px] font-medium text-white/50 group-hover:text-white/75">
        Tap to swap
      </div>
    </button>
  );
}

export function MyTeamPage() {
  const [state, setState] = useState<AsyncState>({ status: "loading" });
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedGameweek, setSelectedGameweek] = useState("");
  const [selectedChip, setSelectedChip] = useState<PlannerChip>("none");
  const [workingSquad, setWorkingSquad] = useState<SquadEntry[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [entryIdInput, setEntryIdInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitAccountCredentials(emailValue: string, passwordValue: string, entryIdValue?: string) {
    setSubmitting(true);
    try {
      const parsedEntryId =
        entryIdValue && entryIdValue.trim()
          ? Number(entryIdValue.trim())
          : undefined;
      await linkMyTeamAccount(emailValue, passwordValue, parsedEntryId);
      setPassword("");
      await load(selectedAccountId ?? undefined);
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function load(accountId?: number) {
    try {
      const [payload, allPlayers] = await Promise.all([getMyTeam(accountId), getPlayers()]);
      setState({ status: "ready", payload, allPlayers });
      const resolvedAccountId = payload.selectedAccountId ?? payload.accounts[0]?.id ?? null;
      setSelectedAccountId(resolvedAccountId);
      setEmail(
        payload.accounts.find((account) => account.id === resolvedAccountId)?.email ??
          payload.accounts[0]?.email ??
          "",
      );
      setEntryIdInput(
        String(
          payload.accounts.find((account) => account.id === resolvedAccountId)?.entryId ??
            payload.accounts[0]?.entryId ??
            "",
        ),
      );
      setSelectedGameweek(String(payload.currentGameweek ?? 1));
      setWorkingSquad(payload.picks.map(toSquadEntry));
      setSelectedSlotId(null);
      setSelectedChip("none");
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  useEffect(() => {
    load();
  }, []);

  const payload = state.status === "ready" ? state.payload : null;
  const selectedAccount =
    payload?.accounts.find((account) => account.id === selectedAccountId) ??
    payload?.accounts[0] ??
    null;
  const sourceSquad = payload?.picks.map(toSquadEntry) ?? [];
  const needsRelogin = selectedAccount?.authStatus === "relogin_required";
  const relinkMessage = summarizeAuthError(selectedAccount?.authError ?? null);
  const selectedSlot = useMemo(
    () => workingSquad.find((entry) => entry.slotId === selectedSlotId) ?? null,
    [selectedSlotId, workingSquad],
  );

  const evaluation = useMemo(() => {
    if (!payload) return null;
    return evaluatePlanner(
      sourceSquad,
      workingSquad,
      payload.bank,
      payload.freeTransfers,
      payload.currentGameweek ?? 1,
      Number(selectedGameweek || payload.currentGameweek || 1),
      selectedChip,
    );
  }, [payload, selectedChip, selectedGameweek, sourceSquad, workingSquad]);

  const candidates = useMemo(() => {
    if (state.status !== "ready") return [];
    return getAvailableCandidates(state.allPlayers, workingSquad, selectedSlot);
  }, [selectedSlot, state, workingSquad]);

  const starters = workingSquad.filter((entry) => entry.role === "starter");
  const bench = workingSquad.filter((entry) => entry.role === "bench");
  const groupedStarters = [1, 2, 3, 4].map((positionId) =>
    starters.filter((entry) => entry.player.positionId === positionId),
  );

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-white/50">Loading My Team…</p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <GlowCard className="max-w-md p-6 text-center">
          <p className="text-sm text-destructive">{state.message}</p>
        </GlowCard>
      </div>
    );
  }

  if (!payload || !selectedAccount || payload.accounts.length === 0) {
    return (
      <div className="relative min-h-screen overflow-x-hidden bg-background text-white">
        <BGPattern variant="grid" mask="fade-edges" className="opacity-70" />
        <div className="relative z-10 mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
          <GlowCard className="p-6 md:p-8" glowColor="magenta">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
                My Team Authentication
              </span>
            </div>
            <h1 className="mt-4 font-display text-4xl font-bold text-white">Link your real FPL account</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
              Enter the same FPL email and password you use on the official website. If FPL blocks automatic entry detection for your account, add your current season entry ID here too so the app can sync your squad, transfers, and history reliably.
            </p>

            <div className="mt-6 grid gap-4">
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-white/45">Email</label>
                <Input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="min-h-11 border-white/10 bg-white/5"
                />
              </div>
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-white/45">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="FPL password"
                  className="min-h-11 border-white/10 bg-white/5"
                />
              </div>
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-white/45">Entry ID (optional)</label>
                <Input
                  aria-label="Entry ID (optional)"
                  inputMode="numeric"
                  value={entryIdInput}
                  onChange={(event) => setEntryIdInput(event.target.value.replace(/[^\d]/g, ""))}
                  placeholder="Current season team entry ID"
                  className="min-h-11 border-white/10 bg-white/5"
                />
              </div>
              <Button
                type="button"
                disabled={submitting || !email || !password}
                onClick={() => submitAccountCredentials(email, password, entryIdInput)}
                className="min-h-11"
              >
                {submitting ? "Linking account…" : "Link and sync account"}
              </Button>
            </div>
          </GlowCard>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-white">
      <BGPattern variant="grid" mask="fade-edges" className="opacity-70" />
      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
          <GlowCard className="overflow-hidden p-6 md:p-8" glowColor="magenta">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,255,191,0.08),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(233,0,82,0.10),transparent_35%)]" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                    <Sparkles className="h-3.5 w-3.5" />
                    My Team
                  </span>
                  <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/50">
                    Live FPL sync + scratchpad planner
                  </span>
                </div>
                <div>
                  <h1 className="font-display text-4xl font-bold tracking-tight text-white md:text-5xl">
                    {payload.teamName}
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-white/65 md:text-base">
                    Synced from your linked FPL account, then layered with a local planner so you can test ideas without committing transfers on the official site.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {payload.accounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => {
                        setSelectedAccountId(account.id);
                        load(account.id);
                      }}
                      className={cn(
                        "min-h-11 rounded-xl border px-4 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selectedAccountId === account.id
                          ? "border-primary/60 bg-primary/15 text-white"
                          : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10 hover:text-white",
                      )}
                    >
                      <div className="text-sm font-semibold">{account.managerName || account.email}</div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">{account.email}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label="Overall Rank" value={`#${payload.overallRank.toLocaleString()}`} accent="text-accent" />
                <StatCard label="Overall Points" value={payload.overallPoints} />
                <StatCard label="Bank" value={formatCost(payload.bank)} />
                <StatCard label="Free Transfers" value={payload.freeTransfers} />
              </div>
            </div>

            {needsRelogin && (
              <div className="relative mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-50">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                  <div className="space-y-2">
                    <div className="font-semibold">This account needs to be relinked before the next sync.</div>
                    <p className="leading-6 text-amber-50/85">
                      Your last synced team is still visible, but fresh FPL data is blocked until you re-enter the account password.
                    </p>
                    <p className="leading-6 text-amber-50/85">{relinkMessage}</p>
                    <p className="leading-6 text-amber-50/75">
                      If automatic entry lookup is being blocked, add your current season entry ID below before relinking.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-amber-100/75">Email</label>
                    <Input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="min-h-11 border-amber-200/20 bg-black/20"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-amber-100/75">Password</label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Re-enter FPL password"
                      className="min-h-11 border-amber-200/20 bg-black/20"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-amber-100/75">Entry ID (optional)</label>
                    <Input
                      aria-label="Entry ID (optional)"
                      inputMode="numeric"
                      value={entryIdInput}
                      onChange={(event) => setEntryIdInput(event.target.value.replace(/[^\d]/g, ""))}
                      placeholder="Current season team entry ID"
                      className="min-h-11 border-amber-200/20 bg-black/20"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Button
                      type="button"
                      className="min-h-11 w-full md:w-auto"
                      disabled={submitting || !email || !password}
                      onClick={() => submitAccountCredentials(email, password, entryIdInput)}
                    >
                      {submitting ? "Relinking…" : "Relink and sync"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </GlowCard>
        </motion.section>

        <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
          <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.45 }}>
            <GlowCard className="overflow-hidden p-5 sm:p-6" glowColor="teal">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-bold text-white">Pitch View</h2>
                  <p className="mt-1 text-sm text-white/55">
                    Your synced squad is shown here first. Planner swaps stay local and visible on top of the real team shape.
                  </p>
                </div>
                <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/50">
                  GW {selectedGameweek}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(0,255,191,0.08),rgba(0,0,0,0)),linear-gradient(180deg,rgba(10,43,31,0.8),rgba(8,28,24,0.95))] p-4 sm:p-5">
                <div className="rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_50%),linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.2))] p-4 shadow-inner shadow-black/20">
                  <div className="space-y-4">
                    {groupedStarters.map((row, index) => (
                      <div
                        key={`row-${index}`}
                        className="grid gap-3"
                        style={{ gridTemplateColumns: `repeat(${Math.max(row.length, 1)}, minmax(0, 1fr))` }}
                      >
                        {row.map((entry) => (
                          <PitchPlayerCard
                            key={entry.slotId}
                            entry={entry}
                            onSelect={(nextEntry) => setSelectedSlotId(nextEntry.slotId)}
                            isSelected={selectedSlotId === entry.slotId}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="font-display text-lg font-bold">Bench</h3>
                      <p className="text-xs text-white/45">Still touch-first, still readable, now fed by your actual synced squad.</p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {bench.map((entry) => (
                      <PitchPlayerCard
                        key={entry.slotId}
                        entry={entry}
                        onSelect={(nextEntry) => setSelectedSlotId(nextEntry.slotId)}
                        isSelected={selectedSlotId === entry.slotId}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </GlowCard>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.45 }} className="space-y-6">
            <GlowCard className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-bold">Transfer Planner</h2>
                  <p className="mt-1 text-sm text-white/55">
                    Planner mode is local-only. You can test legal moves and chips here, then make the final transfer on the official site by hand.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setWorkingSquad(sourceSquad)}>
                    <RefreshCcw className="h-3.5 w-3.5" />
                    Reset
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      setSubmitting(true);
                      try {
                        await syncMyTeam({ accountId: selectedAccount.id });
                        await load(selectedAccount.id);
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    disabled={submitting || needsRelogin}
                  >
                    {needsRelogin ? "Relink required" : submitting ? "Syncing…" : "Sync now"}
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-[0.18em] text-white/45">Planning week</label>
                  <Select value={selectedGameweek} onValueChange={setSelectedGameweek}>
                    <SelectTrigger className="min-h-11 border-white/10 bg-white/5">
                      <SelectValue placeholder="Select gameweek" />
                    </SelectTrigger>
                    <SelectContent>
                      {payload.history.map((row) => (
                        <SelectItem key={row.gameweek} value={String(row.gameweek)}>
                          GW {row.gameweek}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-[0.18em] text-white/45">Chip simulation</label>
                  <Select value={selectedChip} onValueChange={(value) => setSelectedChip(value as PlannerChip)}>
                    <SelectTrigger className="min-h-11 border-white/10 bg-white/5">
                      <SelectValue placeholder="Choose chip" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHIPS.map((chip) => (
                        <SelectItem key={chip.id} value={chip.id}>
                          {chip.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {evaluation && (
                <>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <StatCard label="Planned transfers" value={evaluation.transferCount} accent="text-primary" />
                    <StatCard label="Projected hit" value={`-${evaluation.hitCost}`} accent={evaluation.hitCost ? "text-destructive" : "text-accent"} />
                    <StatCard label="Free Transfers" value={evaluation.freeTransfers} />
                    <StatCard label="Bank after moves" value={formatCost(evaluation.remainingBank)} accent={evaluation.remainingBank < 0 ? "text-destructive" : "text-accent"} />
                  </div>

                  <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <ArrowRightLeft className="h-4 w-4 text-accent" />
                      {selectedSlot ? `Replace ${selectedSlot.player.webName}` : "Pick a player from the pitch"}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-white/50">
                      Candidate swaps stay in-position to keep the planner legal and easier to explore on small screens.
                    </p>

                    {selectedSlot ? (
                      <div className="mt-4 grid gap-3">
                        {candidates.slice(0, 8).map((candidate) => (
                          <div
                            key={candidate.id}
                            className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                          >
                            <div>
                              <div className="text-sm font-semibold text-white">{candidate.webName}</div>
                              <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                                {candidate.teamShortName} • {POSITION_LABELS[candidate.positionId]} • {formatCost(candidate.nowCost)}
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="teal"
                              onClick={() => {
                                setWorkingSquad((current) => replaceSquadPlayer(current, selectedSlot.slotId, candidate));
                                setSelectedSlotId(selectedSlot.slotId);
                              }}
                            >
                              <Wand2 className="h-3.5 w-3.5" />
                              Bring in
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-5 text-sm text-white/45">
                        Select a starter or bench player from the pitch to open the shortlist.
                      </div>
                    )}
                  </div>

                  <div className="mt-5 space-y-2" aria-label="Planner warnings">
                    {evaluation.warnings.map((warning) => (
                      <div
                        key={warning}
                        className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2.5 text-sm text-amber-100"
                      >
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                        <span>{warning}</span>
                      </div>
                    ))}
                    {evaluation.warnings.length === 0 && (
                      <div className="rounded-xl border border-accent/20 bg-accent/10 px-3 py-2.5 text-sm text-accent">
                        Planner looks legal for the selected week. Nothing here commits to the real FPL site.
                      </div>
                    )}
                  </div>
                </>
              )}
            </GlowCard>

            <GlowCard className="p-5 sm:p-6">
              <h2 className="font-display text-2xl font-bold">Recent Transfers</h2>
              <p className="mt-1 text-sm text-white/55">This is pulled from synced FPL transfer history when it is available for your current season.</p>
              <div className="mt-4 space-y-3">
                {payload.transfers.map((transfer) => (
                  <div key={transfer.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-white">Gameweek {transfer.gameweek ?? "—"}</div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                        {new Date(transfer.madeAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                      <div>
                        <div className="text-white/45">Out</div>
                        <div className="font-semibold text-white">{transfer.playerOut.webName}</div>
                      </div>
                      <ArrowRightLeft className="h-4 w-4 text-primary" />
                      <div className="text-right">
                        <div className="text-white/45">In</div>
                        <div className="font-semibold text-white">{transfer.playerIn.webName}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-white/45">
                      <span>Cost {transfer.cost}</span>
                    </div>
                  </div>
                ))}
              </div>
            </GlowCard>
          </motion.section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14, duration: 0.45 }}>
            <GlowCard className="p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-accent" />
                <h2 className="font-display text-2xl font-bold">Season Archive</h2>
              </div>
              <p className="mt-1 text-sm text-white/55">Past season summaries persist here once they have been synced into the local database.</p>
              <div className="mt-4 grid gap-3">
                {payload.seasons.map((season) => (
                  <div key={season.season} className="grid min-h-11 gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:grid-cols-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">Season</div>
                      <div className="mt-1 font-display text-xl font-bold text-white">{season.season}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">Points</div>
                      <div className="mt-1 text-sm font-semibold text-white">{season.overallPoints}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">Final rank</div>
                      <div className="mt-1 text-sm font-semibold text-white">#{season.overallRank.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">Season rank</div>
                      <div className="mt-1 text-sm font-semibold text-accent">#{season.rank.toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </GlowCard>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.45 }}>
            <GlowCard className="p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-primary" />
                <h2 className="font-display text-2xl font-bold">Recent Gameweeks</h2>
              </div>
              <p className="mt-1 text-sm text-white/55">Current-season snapshots from your synced manager history, restyled to fit the app’s card system.</p>
              <div className="mt-4 grid gap-3">
                {payload.history.map((row) => (
                  <div key={`${row.gameweek}-${row.rank}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">Gameweek {row.gameweek}</div>
                        <div className="mt-1 font-display text-2xl font-bold text-white">{row.points} pts</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">Rank</div>
                        <div className="mt-1 text-sm font-semibold text-accent">#{row.overallRank.toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">Overall</div>
                        <div className="mt-1 text-white">{row.totalPoints}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">Value</div>
                        <div className="mt-1 text-white">{formatCost(row.value)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">Bank</div>
                        <div className="mt-1 text-white">{formatCost(row.bank)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </GlowCard>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
