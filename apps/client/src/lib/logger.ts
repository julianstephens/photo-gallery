import pino from "pino";

// --- Loki Configuration (only used in production) ---
const LOKI_LABELS = {
  service: "photo-gallery-client",
  env: import.meta.env.MODE || "development",
};
const BATCH_INTERVAL_MS = 5000;
const BATCH_SIZE_LIMIT = 100;

// --- Production-only Batching and Sending Logic ---
let logBatch: { ts: string; line: string; level: string }[] = [];
let batchTimeoutId: number | null = null;

async function sendBatchToLoki() {
  if (logBatch.length === 0) {
    logger.trace("[Loki Transport] No logs to send (batch is empty)");
    return;
  }

  const batch = [...logBatch];
  logBatch = [];

  if (batchTimeoutId) {
    clearTimeout(batchTimeoutId);
    batchTimeoutId = null;
  }

  logger.trace({ batchSize: batch.length }, "[Loki Transport] Preparing batch with logs");

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

  logger.trace({ streamCount: Object.keys(streams).length }, "[Loki Transport] Stream groups");

  const lokiEndpoint = `${import.meta.env.VITE_API_URL}/api/loki/api/v1/push`;

  const payload = JSON.stringify({ streams: Object.values(streams) });

  try {
    const response = await fetch(lokiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    });

    if (!response.ok) {
      const responseText = await response.text();
      logger.error(
        {
          status: response.status,
          statusText: response.statusText,
          responseBody: responseText,
        },
        "[Loki Transport] Failed to send log batch",
      );
    }
  } catch (error) {
    logger.error({ error }, "[Loki Transport] Failed to send log batch");
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
    level: "debug", // Send debug and above to Loki
    send: (level, logEvent) => {
      const logLine = logEvent.messages
        .map((msg) => (typeof msg === "object" ? JSON.stringify(msg) : String(msg)))
        .join(" ");

      // pino's logEvent.ts is in milliseconds, convert to nanoseconds for Loki
      const nanoseconds = (logEvent.ts * 1_000_000).toString();

      logBatch.push({
        ts: nanoseconds,
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
    // lokiEndpoint: `${import.meta.env.VITE_API_URL}/api/loki/api/v1/push`,
  },
  "Logger initialized",
);
