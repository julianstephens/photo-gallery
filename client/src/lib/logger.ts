import pino from "pino";

// --- Loki Configuration (only used in production) ---
const LOKI_LABELS = {
  app: "photo-gallery-client",
  env: import.meta.env.MODE || "development",
};
const BATCH_INTERVAL_MS = 5000;
const BATCH_SIZE_LIMIT = 100;

// --- Production-only Batching and Sending Logic ---
let logBatch: { ts: string; line: string; level: string }[] = [];
let batchTimeoutId: number | null = null;

async function sendBatchToLoki() {
  if (logBatch.length === 0) return;

  const batch = [...logBatch];
  logBatch = [];

  if (batchTimeoutId) {
    clearTimeout(batchTimeoutId);
    batchTimeoutId = null;
  }

  const streams = batch.reduce(
    (acc, log) => {
      const streamLabels = { ...LOKI_LABELS, level: log.level };
      const labelsKey = JSON.stringify(streamLabels);

      if (!acc[labelsKey]) {
        acc[labelsKey] = {
          stream: streamLabels,
          values: [],
        };
      }

      acc[labelsKey].values.push([log.ts, log.line]);
      return acc;
    },
    {} as Record<string, { stream: Record<string, string>; values: [string, string][] }>,
  );

  const lokiEndpoint = import.meta.env.VITE_LOKI_ENDPOINT;
  if (!lokiEndpoint) {
    console.warn("[Loki Transport] VITE_LOKI_ENDPOINT not configured, skipping log batch");
    return;
  }

  try {
    const response = await fetch(lokiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streams: Object.values(streams) }),
      keepalive: true,
    });

    if (!response.ok) {
      console.warn(
        "[Loki Transport] Failed to send log batch:",
        response.status,
        response.statusText,
      );
    }
  } catch (error) {
    console.error("[Loki Transport] Failed to send log batch:", error);
  }
}

// --- Dynamic Configuration ---
const isProduction = import.meta.env.MODE === "production";

// Helper to determine the log level
const getLogLevel = (): pino.LevelWithSilent => {
  const validLevels: pino.LevelWithSilent[] = [
    "fatal",
    "error",
    "warn",
    "info",
    "debug",
    "trace",
    "silent",
  ];
  const rawViteLevel = import.meta.env.VITE_LOG_LEVEL?.toLowerCase();

  if (rawViteLevel && validLevels.includes(rawViteLevel as pino.LevelWithSilent)) {
    return rawViteLevel as pino.LevelWithSilent;
  }

  return isProduction ? "info" : "debug";
};

// Conditionally create the Pino browser config
const browserConfig: {
  transmit?: {
    level?: pino.LevelWithSilent;
    send: (level: string, logEvent: pino.LogEvent) => void;
  };
  serialize?: boolean;
} = {};

if (isProduction) {
  browserConfig.serialize = true;
  browserConfig.transmit = {
    level: "info", // You might want this to also be driven by VITE_LOG_LEVEL
    send: (level, logEvent) => {
      const logLine = logEvent.messages
        .map((msg) => (typeof msg === "object" ? JSON.stringify(msg) : String(msg)))
        .join(" ");

      logBatch.push({
        ts: (logEvent.ts * 1_000_000).toString(),
        line: logLine,
        level: level,
      });

      if (logBatch.length >= BATCH_SIZE_LIMIT) {
        void sendBatchToLoki();
      }

      if (!batchTimeoutId) {
        batchTimeoutId = window.setTimeout(() => {
          void sendBatchToLoki();
        }, BATCH_INTERVAL_MS);
      }
    },
  };
}

// --- Pino Logger Instance ---
export const logger = pino({
  level: getLogLevel(),
  browser: browserConfig,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

// --- Log the final configuration for debugging ---
logger.debug(
  {
    mode: import.meta.env.MODE,
    logLevel: getLogLevel(),
    isProduction,
    lokiEndpointConfigured: !!import.meta.env.VITE_LOKI_ENDPOINT,
  },
  "Logger initialized",
);
