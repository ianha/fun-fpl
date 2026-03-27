---
title: Fix historical replay xPts inflation from low-minute cameo outliers
type: fix
status: completed
date: 2026-03-27
---

# Fix historical replay xPts inflation from low-minute cameo outliers

## Overview

Retrofit plan capturing the historical replay transfer-decision bug where minute-starved cameo appearances could inflate per-90 event rates, produce implausible one-gameweek xPts, and surface nonsensical transfer recommendations such as `Thiago -> Beto` at `+20.1 xPts`.

## Problem Frame

Historical replay recommendations are meant to be a best-effort deterministic reconstruction of what the transfer engine would have recommended using the data available before that deadline. In practice, replay projections for low-minute attackers could become wildly inflated because recent and seasonal event rates were being computed as averages of match-level per-90 values. That makes one-minute or very short cameo rows disproportionately influential.

The concrete symptom observed on local data was:

- `GW29` historical replay recommended `Thiago -> Beto`
- projected gain was `+20.1 xPts over 1 GW`
- the recommendation was clearly not credible given Beto's profile and expected scoring range

This plan exists to preserve a durable record of the fix and the rationale behind it.

## Requirements Trace

- R1. Historical replay projections must stay within believable FPL xPts ranges for single-fixture horizons.
- R2. Very low-minute cameo rows must not dominate recent or seasonal event-rate estimation.
- R3. The fix must preserve the existing transfer-decision response contract and deterministic guardrails.
- R4. Regression coverage must reproduce the observed failure mode so the issue cannot silently return.

## Scope Boundaries

- No changes to the public REST response shape.
- No changes to MCP tools, sync flow, or model-registry behavior.
- No attempt to redesign the overall xPts model beyond the rate-aggregation bug.

## Context & Research

### Relevant Code and Patterns

- Historical replay projection flow in [queryService.ts](/Users/iha/github/ianha/fplytics/apps/api/src/services/queryService.ts)
- Historical replay regression style in [queryService.test.ts](/Users/iha/github/ianha/fplytics/apps/api/test/queryService.test.ts)
- Existing historical replay plan context in [2026-03-25-002-feat-historical-transfer-decision-view-plan.md](/Users/iha/github/ianha/fplytics/docs/plans/2026-03-25-002-feat-historical-transfer-decision-view-plan.md)

### Institutional Learnings

- Historical replay should remain a deterministic reconstruction, not a separate heuristic mode.
- Transfer-decision credibility matters as much as mathematical correctness; absurd xPts spikes erode trust quickly.

### External References

- No external research required. The fix is driven by local projection math and repo behavior.

## Key Technical Decisions

- Replace average-of-per-90 aggregation with minute-weighted per-90 aggregation for recent-player stats.
  Rationale: minute weighting preserves the intended per-90 semantics while preventing tiny cameo samples from exploding player rates.

- Apply the same minute-weighted aggregation to positional priors.
  Rationale: replay projections blend player-specific and position-level priors, so only fixing one side would leave an inconsistent fallback path.

- Add a regression seed that specifically includes a one-minute historical cameo with high xG.
  Rationale: this mirrors the real bug trigger and makes the guard durable.

- Accept a more conservative replay outcome if the inflated move disappears entirely.
  Rationale: the product bug is the implausible inflation, not the absence of that exact transfer recommendation after correction.

## Open Questions

### Resolved During Planning

- Should this be fixed with a hard xPts clamp?
  Resolution: no. The correct fix is to repair the rate-estimation inputs rather than cap the symptom.

- Should the bug be treated as a learned-model regression?
  Resolution: no. The issue reproduced with no active learned model version and lived in deterministic historical replay math.

### Deferred to Implementation

- None. The bug was sufficiently isolated to the replay rate-aggregation layer.

## Implementation Units

- [x] **Unit 1: Replace replay rate aggregation with minute-weighted per-90 calculations**

**Goal:** Stop low-minute cameo rows from creating implausible replay event rates.

**Requirements:** R1, R2, R3

**Dependencies:** None

**Files:**
- Modify: `apps/api/src/services/queryService.ts`
- Test: `apps/api/test/queryService.test.ts`

**Approach:**
- Update `getRecentPlayerStats()` so recent and seasonal event rates use total-events-over-total-minutes rather than averaging match-level per-90 rows.
- Update `getPositionPriors()` the same way so blended replay priors stay numerically aligned with player-level rates.
- Leave the higher-level transfer-decision contract and deterministic ranking flow unchanged.

**Patterns to follow:**
- Existing replay projection builder in `getHistoricalPlayerProjectionMap()`
- Existing projection decomposition in `projectFixturePoints()`

**Test scenarios:**
- Historical replay for a player with a one-minute cameo and non-zero xG no longer produces double-digit one-fixture attacking projections.
- Normal transfer-decision tests continue to pass with the same contract shape.

**Verification:**
- Replay projections fall back into believable single-fixture ranges without changing the transfer-decision API response format.

- [x] **Unit 2: Add regression coverage for low-minute historical cameo outliers**

**Goal:** Lock in the observed failure mode so the inflation bug cannot silently reappear.

**Requirements:** R1, R4

**Dependencies:** Unit 1

**Files:**
- Modify: `apps/api/test/queryService.test.ts`

**Approach:**
- Seed a historical replay scenario containing:
  - an outgoing forward with stable starter minutes
  - an incoming forward with a one-minute cameo carrying disproportionately large xG
  - finished GW29 fixtures that reproduce replay mode
- Assert that replay no longer emits the absurd `+20.1`-style spike and that the engine falls back to a sane outcome.

**Patterns to follow:**
- Existing historical replay scenario seeds in `queryService.test.ts`
- Existing deterministic recommendation assertions in `queryService.test.ts`

**Test scenarios:**
- The seeded cameo-outlier replay does not exceed a believable one-gameweek projected gain band.
- The recommendation can roll instead of forcing the previously inflated transfer.

**Verification:**
- The test suite contains a stable regression that fails if cameo-driven inflation returns.

## System-Wide Impact

- **Interaction graph:** The change is isolated to projection math used by player xPts and transfer-decision replay flows.
- **Error propagation:** Low risk; this is deterministic SQL aggregation and in-process scoring, not a new failure path.
- **State lifecycle risks:** None; no schema, persistence shape, or queue semantics changed.
- **API surface parity:** Public response fields remain unchanged.
- **Integration coverage:** Full API test coverage is important because the same projection helpers affect multiple recommendation paths.

## Risks & Dependencies

- Over-correcting the bug could suppress some legitimate high-upside replay moves if weighting became too conservative.
- Because the same helper functions feed multiple projection paths, full-suite verification is required after the fix.

## Documentation / Operational Notes

- No production runbook change is required.
- The important historical record is that implausible replay xPts spikes were caused by aggregation math, not by learned model coefficients.

## Sources & References

- Related code: [queryService.ts](/Users/iha/github/ianha/fplytics/apps/api/src/services/queryService.ts)
- Related tests: [queryService.test.ts](/Users/iha/github/ianha/fplytics/apps/api/test/queryService.test.ts)
- Related plan context: [2026-03-25-002-feat-historical-transfer-decision-view-plan.md](/Users/iha/github/ianha/fplytics/docs/plans/2026-03-25-002-feat-historical-transfer-decision-view-plan.md)
