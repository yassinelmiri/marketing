/**
 * Local-only email campaign scheduler.
 *
 * Next.js calls register() when the Node.js server starts. In development,
 * this polls the existing campaign worker so scheduled campaigns run locally
 * without Vercel Cron or a second terminal.
 */
export async function register() {
  if (process.env.NODE_ENV !== "development") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const globalState = globalThis as typeof globalThis & {
    __localEmailCampaignSchedulerStarted?: boolean;
  };

  // Prevent duplicate timers during development reloads.
  if (globalState.__localEmailCampaignSchedulerStarted) return;
  globalState.__localEmailCampaignSchedulerStarted = true;

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn(
      "[email/scheduler] CRON_SECRET is missing. Local campaign scheduling is disabled."
    );
    return;
  }

  const port = process.env.PORT || "3000";
  const workerUrl = `http://127.0.0.1:${port}/api/cron/email-campaigns`;
  const intervalMs = 60_000;
  let stopped = false;
  let isRunning = false;

  const runWorker = async () => {
    if (stopped || isRunning) return;
    isRunning = true;

    try {
      const response = await fetch(workerUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secret}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(50_000),
      });

      const body = await response.text();
      if (!response.ok) {
        console.error(
          `[email/scheduler] Worker returned HTTP ${response.status}: ${body.slice(0, 500)}`
        );
      } else {
        console.info(`[email/scheduler] Worker checked campaigns: ${body.slice(0, 500)}`);
      }
    } catch (error) {
      console.warn(
        "[email/scheduler] Worker is not reachable yet; it will retry.",
        error
      );
    } finally {
      isRunning = false;
    }
  };

  console.info(
    "[email/scheduler] Active in localhost. Checking scheduled campaigns every 60 seconds."
  );

  // Give Next.js time to finish starting before the first request.
  const initialTimer = setTimeout(() => {
    void runWorker();
  }, 10_000);

  const interval = setInterval(() => {
    void runWorker();
  }, intervalMs);

  const stop = () => {
    stopped = true;
    clearTimeout(initialTimer);
    clearInterval(interval);
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
