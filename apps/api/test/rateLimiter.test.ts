import { describe, expect, it, vi } from "vitest";
import { RequestRateLimiter } from "../src/lib/rateLimiter.js";

describe("RequestRateLimiter", () => {
  it("waits 3 seconds between queued requests", async () => {
    vi.useFakeTimers();

    const sleep = vi.fn(async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
    });
    const limiter = new RequestRateLimiter(3000, sleep);
    const timestamps: number[] = [];

    const first = limiter.schedule(async () => {
      timestamps.push(Date.now());
      return "first";
    });
    const second = limiter.schedule(async () => {
      timestamps.push(Date.now());
      return "second";
    });

    await Promise.all([first, second]);

    expect(timestamps).toHaveLength(2);
    expect(timestamps[1] - timestamps[0]).toBe(3000);
    expect(sleep).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
