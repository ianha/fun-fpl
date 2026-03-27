---
module: System
date: 2026-03-27
problem_type: logic_error
component: service_object
symptoms:
  - "Historical replay for gameweek 29 recommended Thiago -> Beto at +20.1 xPts over 1 GW"
  - "Replay projections assigned Beto roughly 23.5 expected points for a single fixture"
  - "The inflated recommendation appeared in historical replay even though normal current-GW xPts did not show the same spike"
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [historical-replay, xpts, query-service, per-90-rates, low-minute-outliers]
---

# Troubleshooting: Historical replay xPts inflation from low-minute cameo outliers

## Problem

Historical transfer replay could generate obviously nonsensical one-gameweek recommendations because attacker event rates were being overstated in the replay projection path. The user-visible symptom was a GW29 recommendation of `Thiago -> Beto` at `+20.1 xPts over 1 GW`, which is not credible for a single-fixture forward swap.

## Environment

- Module: System-wide
- Affected Component: `QueryService` historical replay projection path
- Date: 2026-03-27

## Symptoms

- Historical replay returned `best-1ft-136-311-1` for `Thiago -> Beto`.
- The recommendation reasons claimed `+20.1 xPts over 1 GW`.
- Beto's replay projection itself was inflated to `23.5` points for one fixture.
- The same player did not look similarly extreme through the normal current-gameweek xPts surface, which pointed away from active model weights and toward the replay-specific rate math.

## What Didn't Work

**Attempted solution 1:** Assume active learned coefficients were over-weighting goals or bonuses.
- **Why it failed:** There was no active learned model version in the local database when the issue reproduced. The bad output existed entirely in the deterministic replay path.

**Attempted solution 2:** Treat the symptom as a guardrail/ranker problem.
- **Why it failed:** The deterministic ranker was only choosing among already-inflated inputs. The real problem was that Beto's replay projection had already reached `23.5` before ranking logic was applied.

**Attempted solution 3:** Consider hard-capping projected gain or single-fixture xPts.
- **Why it failed:** A clamp would hide the symptom without fixing the underlying projection math, and it would risk suppressing legitimate high-upside results.

## Solution

Change replay rate aggregation from "average of match-level per-90 values" to "minute-weighted per-90 values" in [queryService.ts](/Users/iha/github/ianha/fplytics/apps/api/src/services/queryService.ts).

The important change was applied in two places:

- `getRecentPlayerStats()` now computes recent and seasonal rates as `sum(events) * 90 / sum(minutes)`
- `getPositionPriors()` now uses the same minute-weighted aggregation for prior rates

This prevents extremely small-minute rows from dominating a player's blended rates.

The regression was captured in [queryService.test.ts](/Users/iha/github/ianha/fplytics/apps/api/test/queryService.test.ts) with a seeded historical replay scenario that includes:

- a stable outgoing forward (`Thiago`)
- an incoming forward (`Beto`)
- a one-minute cameo row carrying `0.59 xG`

After the fix:

- the absurd `Thiago -> Beto +20.1` replay recommendation disappeared
- GW29 replay on local data returned a much more plausible move (`Rice -> Mbeumo` at `+2.6`)
- the full API test suite still passed

## Why This Works

The root cause was not the xPts formula itself. It was the way replay inputs were aggregated before the formula ran.

Before the fix, replay rates were built using expressions like:

- `AVG(expected_goals * 90 / minutes)`

That looks reasonable at first, but it gives a one-minute cameo the same weight as a ninety-minute start. If a player logs `0.59 xG` in `1` minute, that row alone contributes an apparent `53.1 xG/90`. Averaging several rows like that can create a replay `xg90` that is wildly detached from the player's actual minute-weighted profile.

In the reproduced case, Beto's replay `xg90` rose to about `7.32`, which then flowed directly into `projectFixturePoints()` and produced a one-fixture attacking projection around `23.0`.

Minute-weighted aggregation fixes the actual statistical bug:

1. Sum all relevant events over the window
2. Sum all relevant minutes over the same window
3. Convert the whole sample to a per-90 rate once

That preserves the intended per-90 semantics while making tiny cameo rows proportionally tiny instead of dominant.

## Prevention

- For football event models, do not average per-match per-90 rates when match minutes vary significantly.
- Prefer `sum(events) / sum(minutes)` style aggregation for replay or historical windows.
- Add seeded regressions for low-minute outliers whenever a rate-based model is introduced or refactored.
- When a transfer recommendation looks absurd, inspect the underlying player projection before changing ranker guardrails or learned model weights.

## Related Issues

- Related plan: [2026-03-27-001-fix-historical-replay-xpts-inflation-plan.md](/Users/iha/github/ianha/fplytics/docs/plans/2026-03-27-001-fix-historical-replay-xpts-inflation-plan.md)
- Related context: [2026-03-25-002-feat-historical-transfer-decision-view-plan.md](/Users/iha/github/ianha/fplytics/docs/plans/2026-03-25-002-feat-historical-transfer-decision-view-plan.md)
