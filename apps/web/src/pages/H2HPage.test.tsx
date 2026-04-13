import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { H2HPage, resetH2HPageCacheForTests } from "./H2HPage";

const { getH2HComparisonMock } = vi.hoisted(() => ({
  getH2HComparisonMock: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  getH2HComparison: getH2HComparisonMock,
}));

function buildPayload(overrides: Record<string, unknown> = {}) {
  return {
    syncRequired: false,
    rivalEntry: {
      entryId: 501,
      playerName: "Brad",
      teamName: "Brad FC",
      rank: 1,
      totalPoints: 130,
    },
    squadOverlap: {
      gameweek: 2,
      overlapPct: 86.7,
      sharedPlayers: [
        { id: 10, webName: "Saka", teamShortName: "ARS", nowCost: 105, positionName: "Midfielder" },
      ],
      userOnlyPlayers: [
        { id: 22, webName: "Isak", teamShortName: "CHE", nowCost: 85, positionName: "Forward" },
      ],
      rivalOnlyPlayers: [
        { id: 23, webName: "Palmer", teamShortName: "CHE", nowCost: 105, positionName: "Midfielder" },
      ],
    },
    gmRankHistory: [
      { gameweek: 1, userOverallRank: 120000, rivalOverallRank: 130000 },
      { gameweek: 2, userOverallRank: 90000, rivalOverallRank: 98000 },
    ],
    ...overrides,
  };
}

function renderH2HPage(initialEntries = ["/leagues/99/h2h/501"]) {
  return {
    ...render(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/leagues" element={<H2HPage />} />
          <Route path="/leagues/:leagueId/h2h/:rivalEntryId" element={<H2HPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  };
}

describe("H2HPage", () => {
  beforeEach(() => {
    resetH2HPageCacheForTests();
    vi.clearAllMocks();
  });

  it("renders the first synced h2h slice for a rival route", async () => {
    getH2HComparisonMock.mockResolvedValue(buildPayload());

    renderH2HPage();

    expect(await screen.findByRole("heading", { name: /Brad FC/i })).toBeInTheDocument();
    expect(screen.getByText(/86.7% overlap/i)).toBeInTheDocument();
    expect(screen.getByText(/Isak/i)).toBeInTheDocument();
    expect(screen.getByText(/Palmer/i)).toBeInTheDocument();
    expect(screen.getAllByText(/GW 2/i).length).toBeGreaterThan(0);
  });

  it("shows a sync-required state instead of comparison sections when rival data is missing", async () => {
    getH2HComparisonMock.mockResolvedValue(
      buildPayload({
        syncRequired: true,
        squadOverlap: null,
        gmRankHistory: [],
      }),
    );

    renderH2HPage();

    expect(await screen.findByText(/Sync this rival to load comparison insights/i)).toBeInTheDocument();
    expect(screen.queryByText(/86.7% overlap/i)).not.toBeInTheDocument();
  });

  it("refetches on rival change and does not reuse the previous rival payload", async () => {
    getH2HComparisonMock
      .mockResolvedValueOnce(buildPayload())
      .mockResolvedValueOnce(
        buildPayload({
          rivalEntry: {
            entryId: 502,
            playerName: "Sean",
            teamName: "Sean FC",
            rank: 2,
            totalPoints: 125,
          },
          squadOverlap: {
            gameweek: 2,
            overlapPct: 73.3,
            sharedPlayers: [],
            userOnlyPlayers: [],
            rivalOnlyPlayers: [],
          },
        }),
      );

    const firstRender = renderH2HPage(["/leagues/99/h2h/501"]);

    expect(await screen.findByRole("heading", { name: /Brad FC/i })).toBeInTheDocument();

    firstRender.unmount();
    renderH2HPage(["/leagues/99/h2h/502"]);

    expect(await screen.findByRole("heading", { name: /Sean FC/i })).toBeInTheDocument();
    expect(screen.getByText(/73.3% overlap/i)).toBeInTheDocument();
    expect(getH2HComparisonMock).toHaveBeenNthCalledWith(1, 99, 501);
    expect(getH2HComparisonMock).toHaveBeenNthCalledWith(2, 99, 502);
  });
});
