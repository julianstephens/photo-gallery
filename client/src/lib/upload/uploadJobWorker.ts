// Web worker for polling upload progress without blocking the main thread.

export type UploadProgressStatus = "pending" | "uploading" | "processing" | "completed" | "failed";
export type UploadProgressPhase =
  | "client-upload"
  | "server-assemble"
  | "server-zip-extract"
  | "server-upload";

// Progress format from /api/uploads/:uploadId/progress
export interface UploadProgress {
  uploadId: string;
  status: UploadProgressStatus;
  phase: UploadProgressPhase;
  progress: {
    totalBytes: number | null;
    uploadedBytes: number | null;
    totalFiles: number | null;
    processedFiles: number | null;
  };
  error: string | null;
}

export type WorkerInMessage =
  | { type: "start_progress"; uploadId: string; baseUrl?: string }
  | { type: "stop" };

export type WorkerOutMessage =
  | { type: "progress_update"; progress: UploadProgress }
  | { type: "progress_complete"; progress: UploadProgress }
  | { type: "progress_failed"; progress: UploadProgress }
  | { type: "timeout" }
  | { type: "not_found" }
  | { type: "error"; error: string };

let activeUploadId: string | null = null;
let aborted = false;
let timeoutId: number | null = null;
let startTime: number | null = null;

const MAX_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const BASE_DELAY_MS = 1500; // 1.5 seconds for upload progress polling
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

// Poll the upload progress endpoint
const pollProgress = async (baseUrl: string) => {
  if (!activeUploadId || aborted) return;
  if (!startTime) startTime = Date.now();
  if (Date.now() - startTime > MAX_DURATION_MS) {
    console.log("[uploadJobWorker] Timeout reached for upload", { uploadId: activeUploadId });
    (self as unknown as Worker).postMessage({ type: "timeout" } satisfies WorkerOutMessage);
    activeUploadId = null;
    return;
  }
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const url = `${normalizedBase}/uploads/${encodeURIComponent(activeUploadId)}/progress`;

  try {
    console.log("[uploadJobWorker] Polling upload progress", { uploadId: activeUploadId, url });
    const res = await fetch(url, { credentials: "include" });
    if (res.status === 404) {
      console.log("[uploadJobWorker] Upload not found (404)", { uploadId: activeUploadId });
      (self as unknown as Worker).postMessage({ type: "not_found" } satisfies WorkerOutMessage);
      activeUploadId = null;
      return;
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      const seconds = retryAfter ? parseInt(retryAfter, 10) : NaN;
      const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : BASE_DELAY_MS * 2;
      console.log("[uploadJobWorker] Rate limited (429)", {
        uploadId: activeUploadId,
        retryAfter,
        delay,
      });
      scheduleNext(() => void pollProgress(baseUrl), Math.min(delay, MAX_DELAY_MS));
      return;
    }

    if (!res.ok) {
      console.warn("[uploadJobWorker] Non-OK response while polling upload progress", {
        uploadId: activeUploadId,
        status: res.status,
      });
      scheduleNext(() => void pollProgress(baseUrl), Math.min(BASE_DELAY_MS * 2, MAX_DELAY_MS));
      return;
    }

    const progress = (await res.json()) as UploadProgress;
    (self as unknown as Worker).postMessage({
      type: "progress_update",
      progress,
    } satisfies WorkerOutMessage);

    if (progress.status === "completed") {
      console.log("[uploadJobWorker] Upload completed", { uploadId: activeUploadId });
      (self as unknown as Worker).postMessage({
        type: "progress_complete",
        progress,
      } satisfies WorkerOutMessage);
      activeUploadId = null;
      return;
    }

    if (progress.status === "failed") {
      console.log("[uploadJobWorker] Upload failed", { uploadId: activeUploadId });
      (self as unknown as Worker).postMessage({
        type: "progress_failed",
        progress,
      } satisfies WorkerOutMessage);
      activeUploadId = null;
      return;
    }

    scheduleNext(() => void pollProgress(baseUrl), BASE_DELAY_MS);
  } catch (err) {
    console.warn("[uploadJobWorker] Network error while polling upload progress", {
      uploadId: activeUploadId,
      error: String(err),
    });
    scheduleNext(() => void pollProgress(baseUrl), Math.min(BASE_DELAY_MS * 2, MAX_DELAY_MS));
  }
};

(self as unknown as Worker).onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;
  if (msg.type === "start_progress") {
    aborted = false;
    startTime = null;
    activeUploadId = msg.uploadId;
    console.log("[uploadJobWorker] Start polling upload progress", { uploadId: activeUploadId });
    const baseUrl = msg.baseUrl ?? "/api";
    void pollProgress(baseUrl);
  } else if (msg.type === "stop") {
    aborted = true;
    console.log("[uploadJobWorker] Stop polling", { uploadId: activeUploadId });
    activeUploadId = null;
    clearTimer();
  }
};
