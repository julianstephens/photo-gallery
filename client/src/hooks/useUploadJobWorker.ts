import { uploadHttpClient } from "@/clients";
import { uploadJobStore } from "@/uploadJobStore";
import type { UploadJob, WorkerInMessage, WorkerOutMessage } from "@/workers/uploadJobWorker";
import { useEffect, useMemo, useRef, useState } from "react";

export interface UploadJobWorkerState {
  job: UploadJob | null;
  status: "idle" | "running" | "completed" | "failed" | "timeout" | "not_found";
  error: string | null;
}

export const useUploadJobWorker = () => {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<UploadJobWorkerState>({
    job: null,
    status: "idle",
    error: null,
  });

  // Lazy-init worker instance (Vite web worker import)
  useEffect(() => {
    const WorkerCtor = new URL("../workers/uploadJobWorker.ts", import.meta.url);
    const worker = new Worker(WorkerCtor, { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;
      console.log("[useUploadJobWorker] Received message from worker", msg);
      if (msg.type === "update") {
        setState((prev) => ({ ...prev, job: msg.job, status: "running" }));
      } else if (msg.type === "complete") {
        if (msg.job.id) uploadJobStore.clearJobId(msg.job.id);
        setState({ job: msg.job, status: "completed", error: null });
      } else if (msg.type === "failed") {
        if (msg.job.id) uploadJobStore.clearJobId(msg.job.id);
        setState({ job: msg.job, status: "failed", error: msg.job.error ?? "Upload failed" });
      } else if (msg.type === "timeout") {
        setState({ job: null, status: "timeout", error: "Upload timed out" });
      } else if (msg.type === "not_found") {
        setState({ job: null, status: "not_found", error: "Upload job not found" });
      } else if (msg.type === "error") {
        setState({ job: null, status: "failed", error: msg.error });
      }
    };

    return () => {
      console.log("[useUploadJobWorker] Terminating worker");
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const controls = useMemo(() => {
    const uploadBase = (uploadHttpClient.defaults.baseURL ?? "/api/").replace(/\/$/, "");
    return {
      start: (jobId: string) => {
        if (!workerRef.current) return;
        const msg: WorkerInMessage = { type: "start", jobId, baseUrl: uploadBase };
        console.log("[useUploadJobWorker] Sending start to worker", msg);
        workerRef.current.postMessage(msg);
        setState({ job: null, status: "running", error: null });
      },
      stop: () => {
        if (!workerRef.current) return;
        const msg: WorkerInMessage = { type: "stop" };
        console.log("[useUploadJobWorker] Sending stop to worker", msg);
        workerRef.current.postMessage(msg);
        setState({ job: null, status: "idle", error: null });
      },
    };
  }, []);

  return { ...controls, state };
};
