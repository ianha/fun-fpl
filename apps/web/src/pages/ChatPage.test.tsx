import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPage } from "./ChatPage";

const { getChatProvidersMock, getChatGoogleAuthUrlMock, streamChatMock } = vi.hoisted(() => ({
  getChatProvidersMock: vi.fn(),
  getChatGoogleAuthUrlMock: vi.fn(),
  streamChatMock: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  getChatProviders: getChatProvidersMock,
  getChatGoogleAuthUrl: getChatGoogleAuthUrlMock,
  streamChat: streamChatMock,
}));

function makeReader(events: object[]) {
  const encoder = new TextEncoder();
  const payload = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
  return stream.getReader();
}

describe("ChatPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const localStore = new Map<string, string>();
    const sessionStore = new Map<string, string>();

    Object.defineProperty(window, "localStorage", {
      writable: true,
      value: {
        getItem: vi.fn((key: string) => localStore.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          localStore.set(key, value);
        }),
        removeItem: vi.fn((key: string) => {
          localStore.delete(key);
        }),
      },
    });

    Object.defineProperty(window, "sessionStorage", {
      writable: true,
      value: {
        getItem: vi.fn((key: string) => sessionStore.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          sessionStore.set(key, value);
        }),
        removeItem: vi.fn((key: string) => {
          sessionStore.delete(key);
        }),
      },
    });

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    Element.prototype.scrollIntoView = vi.fn();
  });

  it("auto-sends a seeded H2H prompt exactly once when chat opens", async () => {
    window.sessionStorage.setItem("fpl-chat-seed", JSON.stringify({
      source: "h2h-rival-summary",
      createdAt: "2026-04-16T09:00:00.000Z",
      leagueId: 99,
      rivalEntryId: 501,
      rivalTeamName: "Brad FC",
      prompt: "Analyze my rival Brad FC with focus on captaincy and bench.",
    }));

    getChatProvidersMock.mockResolvedValue([
      {
        id: "openai-main",
        name: "OpenAI",
        provider: "openai",
        model: "gpt-test",
        authType: "apiKey",
        oauthConnected: false,
      },
    ]);
    getChatGoogleAuthUrlMock.mockResolvedValue("https://accounts.test/oauth");
    streamChatMock.mockResolvedValue(
      makeReader([
        { type: "text_delta", content: "Rival summary ready." },
        { type: "done" },
      ]),
    );

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <Routes>
          <Route path="/chat" element={<ChatPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(streamChatMock).toHaveBeenCalledTimes(1);
    });

    expect(streamChatMock).toHaveBeenCalledWith("openai-main", [
      { role: "user", content: "Analyze my rival Brad FC with focus on captaincy and bench." },
    ]);
    expect(window.sessionStorage.getItem("fpl-chat-seed")).toBeNull();
    expect(await screen.findByText(/Rival summary ready\./i)).toBeInTheDocument();

    await waitFor(() => {
      expect(streamChatMock).toHaveBeenCalledTimes(1);
    });
  });
});
