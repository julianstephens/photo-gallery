// Web worker for polling upload job status without blocking the main thread.

export type UploadJobStatus = "pending" | "processing" | "completed" | "failed";

export interface UploadJobProgress {
  processedFiles: number;
  totalFiles: number;
}

export interface UploadJob {
  id: string;
  status: UploadJobStatus;
  progress?: UploadJobProgress;
  error?: string | null;
  [key: string]: unknown;
}

export type WorkerInMessage = { type: "start"; jobId: string; baseUrl?: string } | { type: "stop" };

export type WorkerOutMessage =
  | { type: "update"; job: UploadJob }
  | { type: "complete"; job: UploadJob }
  | { type: "failed"; job: UploadJob }
  | { type: "timeout" }
  | { type: "not_found" }
  | { type: "error"; error: string };

let activeJobId: string | null = null;
let aborted = false;
let timeoutId: number | null = null;
let startTime: number | null = null;

const MAX_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 30000;

const clearTimer = () => {
  if (timeoutId !== null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
};

const scheduleNext = (fn: () => void, delay: number) => {
  clearTimer();
  timeoutId = setTimeout(fn, delay) as unknown as number;
};

const pollOnce = async (baseUrl: string) => {
  if (!activeJobId || aborted) return;
  if (!startTime) startTime = Date.now();
  if (Date.now() - startTime > MAX_DURATION_MS) {
    console.log("[uploadJobWorker] Timeout reached for job", { jobId: activeJobId });
    (self as unknown as Worker).postMessage({ type: "timeout" } satisfies WorkerOutMessage);
    activeJobId = null;
    return;
  }
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const url = `${normalizedBase}/galleries/upload/${encodeURIComponent(activeJobId)}`;

  try {
    console.log("[uploadJobWorker] Polling job status", { jobId: activeJobId, url });
    const res = await fetch(url, { credentials: "include" });
    if (res.status === 404) {
      console.log("[uploadJobWorker] Job not found (404)", { jobId: activeJobId });
      (self as unknown as Worker).postMessage({ type: "not_found" } satisfies WorkerOutMessage);
      activeJobId = null;
      return;
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      const seconds = retryAfter ? parseInt(retryAfter, 10) : NaN;
      const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : BASE_DELAY_MS * 2;
      console.log("[uploadJobWorker] Rate limited (429)", {
        jobId: activeJobId,
        retryAfter,
        delay,
      });
      scheduleNext(() => void pollOnce(baseUrl), Math.min(delay, MAX_DELAY_MS));
      return;
    }

    if (!res.ok) {
      // transient error, exponential backoff
      console.warn("[uploadJobWorker] Non-OK response while polling job", {
        jobId: activeJobId,
        status: res.status,
      });
      scheduleNext(() => void pollOnce(baseUrl), Math.min(BASE_DELAY_MS * 2, MAX_DELAY_MS));
      return;
    }

    const job = (await res.json()) as UploadJob;
    (self as unknown as Worker).postMessage({ type: "update", job } satisfies WorkerOutMessage);

    if (job.status === "completed") {
      console.log("[uploadJobWorker] Job completed", { jobId: activeJobId });
      (self as unknown as Worker).postMessage({ type: "complete", job } satisfies WorkerOutMessage);
      activeJobId = null;
      return;
    }

    if (job.status === "failed") {
      console.log("[uploadJobWorker] Job failed", { jobId: activeJobId });
      (self as unknown as Worker).postMessage({ type: "failed", job } satisfies WorkerOutMessage);
      activeJobId = null;
      return;
    }

    scheduleNext(() => void pollOnce(baseUrl), BASE_DELAY_MS);
  } catch (err) {
    // network error, retry with backoff
    console.warn("[uploadJobWorker] Network error while polling job", {
      jobId: activeJobId,
      error: String(err),
    });
    scheduleNext(() => void pollOnce(baseUrl), Math.min(BASE_DELAY_MS * 2, MAX_DELAY_MS));
  }
};

(self as unknown as Worker).onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;
  if (msg.type === "start") {
    aborted = false;
    startTime = null;
    activeJobId = msg.jobId;
    console.log("[uploadJobWorker] Start polling job", { jobId: activeJobId });
    const baseUrl = msg.baseUrl ?? "/api";
    void pollOnce(baseUrl);
  } else if (msg.type === "stop") {
    aborted = true;
    console.log("[uploadJobWorker] Stop polling job", { jobId: activeJobId });
    activeJobId = null;
    clearTimer();
  }
};
