import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShareRecapDialog } from "./ShareRecapDialog";

const DEFAULT_PROPS = {
  open: true,
  onOpenChange: vi.fn(),
  accountId: 1,
  gameweek: 7,
  teamName: "Midnight Press FC",
};

describe("ShareRecapDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // jsdom does not implement navigator.canShare — so it should be absent
    // (if it somehow exists, delete it for test isolation)
    if ("canShare" in navigator) {
      Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
    }
  });

  it("renders the preview image with the correct src", () => {
    render(<ShareRecapDialog {...DEFAULT_PROPS} />);
    const img = screen.getByRole("img", { name: /GW7 Recap Card/i });
    expect(img).toHaveAttribute("src", "/api/my-team/1/recap/7");
  });

  it("renders X, WhatsApp, Telegram buttons with correctly encoded URLs", () => {
    render(<ShareRecapDialog {...DEFAULT_PROPS} />);

    const xBtn = screen.getByRole("button", { name: /post to x/i });
    const waBtn = screen.getByRole("button", { name: /send on whatsapp/i });
    const tgBtn = screen.getByRole("button", { name: /send on telegram/i });

    expect(xBtn).toBeInTheDocument();
    expect(waBtn).toBeInTheDocument();
    expect(tgBtn).toBeInTheDocument();

    // Clicking X should call window.open with a twitter intent URL
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(xBtn);
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining("twitter.com/intent/tweet"),
      "_blank",
      "noreferrer",
    );
    openSpy.mockClear();

    fireEvent.click(waBtn);
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining("wa.me"),
      "_blank",
      "noreferrer",
    );
    openSpy.mockClear();

    fireEvent.click(tgBtn);
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining("t.me/share/url"),
      "_blank",
      "noreferrer",
    );
  });

  it("does not render the Share image button when navigator.canShare is unavailable (jsdom)", () => {
    render(<ShareRecapDialog {...DEFAULT_PROPS} />);
    // "Share image" button relies on canShare — should be absent in jsdom
    expect(screen.queryByRole("button", { name: /share image/i })).not.toBeInTheDocument();
    // Instagram/Signal note should also be absent
    expect(screen.queryByText(/instagram/i)).not.toBeInTheDocument();
  });

  it("copies the absolute recap URL and shows Copied! on click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<ShareRecapDialog {...DEFAULT_PROPS} />);
    const copyBtn = screen.getByRole("button", { name: /copy link/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("/api/my-team/1/recap/7"),
      );
    });

    expect(await screen.findByRole("button", { name: /copied!/i })).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when the dialog close button is clicked", () => {
    const onOpenChange = vi.fn();
    render(<ShareRecapDialog {...DEFAULT_PROPS} onOpenChange={onOpenChange} />);
    const closeBtn = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeBtn);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the team name as the dialog description", () => {
    render(<ShareRecapDialog {...DEFAULT_PROPS} />);
    expect(screen.getByText("Midnight Press FC")).toBeInTheDocument();
  });
});
