type SleepFn = (ms: number) => Promise<void>;

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class RequestRateLimiter {
  private lastRunAt = 0;
  private queue = Promise.resolve();

  constructor(
    private readonly minIntervalMs: number,
    private readonly sleep: SleepFn = defaultSleep,
  ) {}

  schedule<T>(task: () => Promise<T>) {
    const run = async () => {
      const waitMs = Math.max(0, this.lastRunAt + this.minIntervalMs - Date.now());
      if (waitMs > 0) {
        await this.sleep(waitMs);
      }

      this.lastRunAt = Date.now();
      return task();
    };

    const queuedRun = this.queue.then(run, run);
    this.queue = queuedRun.then(
      () => undefined,
      () => undefined,
    );
    return queuedRun;
  }
}

export type { SleepFn };
