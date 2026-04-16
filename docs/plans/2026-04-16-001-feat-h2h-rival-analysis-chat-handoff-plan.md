---
title: feat: H2H Rival Analysis Chat Handoff
type: feat
status: proposed
date: 2026-04-16
---

# feat: H2H Rival Analysis Chat Handoff

## Summary

Add an `Ask AI about this rival` action on the H2H Mini-League page that routes the user to `/chat` and automatically sends a pre-seeded rival-analysis prompt built from the already-loaded `H2HComparisonResponse`. This reuses the existing Chat provider setup, OAuth flow, streaming UI, and provider selection instead of building a second LLM surface on the H2H page.

The seeded prompt should include the structured summary data already shown on the rival page so the LLM can generate a detailed season-to-date report explaining why the rival is overperforming or underperforming relative to the user, with actionable suggestions.

## Key Changes

### 1. Add H2H-to-Chat handoff on the rival page

Files:
- Modify: `apps/web/src/pages/H2HPage.tsx`
- Modify: `apps/web/src/pages/H2HPage.test.tsx`

Changes:
- Add a prominent button in the H2H page header: `Ask AI about this rival`
- Only show it when a synced, non-empty `H2HComparisonResponse` is available
- On click, build a seeded chat payload from the current H2H page data
- Store that payload in `sessionStorage`
- Navigate to `/chat`

Behavior rules:
- Replace any prior seeded rival-analysis payload before navigation
- Do not expose the action in `syncRequired` or missing-data states
- Clear page-specific transient state on rival switch so the wrong rival cannot be handed off

### 2. Add seeded auto-send support to ChatPage

Files:
- Modify: `apps/web/src/pages/ChatPage.tsx`
- Modify: `apps/web/src/pages/chatPageUtils.ts`
- Create or modify: `apps/web/src/pages/ChatPage.test.tsx`

Changes:
- On Chat page load, check `sessionStorage` for a pending H2H seeded payload
- If found, create the first user message from that payload
- Auto-send it once using the currently selected provider
- Remove the seeded payload as soon as the send begins so reload/back does not replay it unintentionally

Implementation constraints:
- Preserve all existing manual chat behavior when no seeded payload exists
- Reuse the existing `fpl-chat-provider` selected provider logic
- If no provider is configured, preserve current Chat behavior and leave the drafted seeded message visible only if needed for recovery
- If the selected provider requires OAuth and is not connected, preserve current OAuth gating behavior rather than bypassing it

### 3. Add a dedicated H2H chat prompt builder

Files:
- Create: `apps/web/src/pages/h2hChatPrompt.ts`

Changes:
- Add a pure helper that converts route params plus `H2HComparisonResponse` into a deterministic seeded prompt
- The helper should return a human-readable prompt, not raw JSON-only output

Prompt contents:
- league id and rival entry id
- rival team and manager name
- total points and rank context
- sync freshness and current GW / last synced GW
- overall point-gap framing
- attribution summary:
  - captaincy
  - transfers and hits
  - bench
- positional audit rows
- luck-vs-skill verdict and underlying numbers
- latest overlap percentage and differentials
- concise GM-rank-history summary

Prompt instructions should explicitly ask the model to:
- explain why the rival is ahead or behind across the season to the current GW
- call out whether the rival appears overperforming or underperforming where supported by the data
- cover captaincy, positions, transfers/hits, bench, differentials, and luck-vs-skill
- give concrete ways the user can improve relative to this rival
- avoid inventing numbers or unsupported claims

### 4. Keep backend/provider integration unchanged for v1

Files:
- Reuse as-is:
  - `apps/api/src/chat/chatRouter.ts`
  - `apps/api/src/chat/providerConfig.ts`
  - `apps/api/src/chat/providers/openai.ts`
  - `apps/api/src/chat/providers/anthropic.ts`
  - `apps/api/src/chat/providers/gemini.ts`

Decision:
- Do not add a new backend endpoint or H2H-specific chat tool in v1
- Reuse the existing `/api/chat/stream` path exactly as it exists
- Treat the H2H page as the source of truth for the summary context passed into Chat

Rationale:
- Lowest implementation cost
- Uses already-proven provider and streaming behavior
- Avoids duplicating data-fetch logic or building a second summary surface

## Public Interfaces / Behavior Changes

No new backend API is required.

Frontend behavior additions:
- H2H page gains an `Ask AI about this rival` action
- ChatPage supports one-time seeded auto-send from client-side storage

Internal interface:
- Add a small seeded-chat payload format in `sessionStorage` with:
  - `source: "h2h-rival-summary"`
  - route identifiers
  - generated prompt text
  - optional metadata like rival name and created timestamp

## Test Plan

Frontend tests:
- H2H page shows the AI action only when rival comparison data is ready
- Clicking the AI action stores the seeded payload and routes to `/chat`
- ChatPage detects the seeded H2H payload and auto-sends exactly once
- Seeded payload is cleared after the send begins
- Rival switching does not reuse stale seeded context
- Sync-required states do not expose the AI handoff
- Existing manual Chat flows still work when no seeded payload exists
- Provider/OAuth gating still behaves the same with seeded auto-send

Manual verification:
- Open `/leagues/436722/h2h/2199934`
- Click `Ask AI about this rival`
- Confirm Chat opens and immediately starts generating the report
- Confirm the generated response references captaincy, positions, transfers/hits, bench, overlap/differentials, and luck-vs-skill from the H2H data
- Refresh `/chat` and confirm it does not auto-submit the same rival summary again

## Assumptions and Defaults

- The handoff should auto-send on arrival in Chat.
- The existing H2H page payload is sufficient for v1; no additional backend tool is needed yet.
- Seeded context should be passed via `sessionStorage`, not URL query params.
- The prompt should be readable, structured prose built from page data, not a raw JSON blob.
- Existing provider selection and OAuth flows remain the only LLM configuration path.
