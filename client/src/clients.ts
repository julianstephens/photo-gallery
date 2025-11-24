import { QueryClient } from "@tanstack/react-query";
import axios, { AxiosError, type AxiosInstance } from "axios";

type RetriableAxiosError = AxiosError & { retryAfterMs?: number };

const attachRetryAfterInterceptor = (client: AxiosInstance) => {
  client.interceptors.response.use(
    (res) => res,
    (error: AxiosError) => {
      const retriableError = error as RetriableAxiosError;
      const retryAfterHeader = error.response?.headers?.["retry-after"];
      if (retryAfterHeader) {
        const seconds = parseInt(String(retryAfterHeader), 10);
        if (Number.isFinite(seconds) && seconds > 0) {
          retriableError.retryAfterMs = seconds * 1000;
        }
      }
      return Promise.reject(retriableError);
    },
  );
};

const needsAbsolutePathNormalization = (baseURL: string) => /^https?:\/\//i.test(baseURL);

const createHttpClient = (baseURL: string) => {
  const instance = axios.create({
    baseURL,
    withCredentials: true,
  });
  attachRetryAfterInterceptor(instance);
  if (needsAbsolutePathNormalization(baseURL)) {
    instance.interceptors.request.use((config) => {
      if (typeof config.url === "string" && config.url.startsWith("/")) {
        config.url = config.url.replace(/^\//, "");
      }
      return config;
    });
  }
  return instance;
};

const appendTrailingSlash = (val: string) => (val.endsWith("/") ? val : `${val}/`);

const computeApiBaseUrl = (value?: string) => {
  if (!value) {
    return "/api/";
  }

  if (value.startsWith("/")) {
    return appendTrailingSlash(value);
  }

  try {
    const url = new URL(value);
    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/api";
    }
    url.pathname = appendTrailingSlash(url.pathname);
    return url.toString();
  } catch {
    const normalized = value.endsWith("/api") ? value : `${value.replace(/\/$/, "")}/api`;
    return appendTrailingSlash(normalized);
  }
};

const defaultBaseURL = computeApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);
const uploadBaseURL = (import.meta.env.VITE_UPLOAD_BASE_URL as string | undefined)?.trim();
const resolvedUploadBaseURL =
  uploadBaseURL && uploadBaseURL.length > 0 ? computeApiBaseUrl(uploadBaseURL) : undefined;

// Axios instance with credentials for API calls
export const httpClient = createHttpClient(defaultBaseURL);
export const uploadHttpClient = resolvedUploadBaseURL
  ? createHttpClient(resolvedUploadBaseURL)
  : httpClient;

// Debug: log which base URLs are being used
if (typeof window !== "undefined") {
  console.debug("[clients] API base URL:", defaultBaseURL);
  console.debug("[clients] Upload base URL:", resolvedUploadBaseURL ?? "using default");
}

// Exponential backoff with jitter (±20%) capped
const computeBackoffMs = (attempt: number, base = 1000, max = 30000) => {
  const exp = Math.min(max, base * 2 ** (attempt - 1));
  const jitter = exp * 0.2 * (Math.random() - 0.5);
  return Math.max(500, Math.round(exp + jitter));
};

// QueryClient with intelligent retry honoring Retry-After header and HTTP status semantics
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Decide whether to retry based on status & attempt count
      retry: (failureCount, error) => {
        const axErr = error as AxiosError | undefined;
        const status = axErr?.response?.status;
        if (!status) return failureCount < 3; // network/timeout -> limited retries
        // Do not retry client errors (except rate limit 429)
        if (status >= 400 && status < 500 && status !== 429) return false;
        // Allow a few more retries for 429 & transient 5xx
        if (status === 429) return failureCount < 6;
        if (status >= 500) return failureCount < 5;
        return false;
      },
      // Dynamic delay: prefer server Retry-After header if present
      retryDelay: (attempt, error) => {
        const axErr = error as RetriableAxiosError | undefined;
        const retryAfterMs: number | undefined = axErr?.retryAfterMs;
        if (retryAfterMs && Number.isFinite(retryAfterMs)) {
          return Math.min(retryAfterMs, 30000); // cap to 30s
        }
        return computeBackoffMs(attempt);
      },
      staleTime: 30_000, // reduce refetch pressure
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: (failureCount, error) => {
        const axErr = error as AxiosError | undefined;
        const status = axErr?.response?.status;
        if (status === 429) return failureCount < 4;
        if (status && status >= 500) return failureCount < 3;
        return false;
      },
      retryDelay: (attempt, error) => {
        const axErr = error as RetriableAxiosError | undefined;
        const retryAfterMs: number | undefined = axErr?.retryAfterMs;
        if (retryAfterMs && Number.isFinite(retryAfterMs)) {
          return Math.min(retryAfterMs, 30000);
        }
        return computeBackoffMs(attempt, 750);
      },
    },
  },
});
