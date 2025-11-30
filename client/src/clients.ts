import { QueryClient } from "@tanstack/react-query";
import axios, { AxiosError, type AxiosInstance } from "axios";
import { fetchCsrfToken } from "./queries";

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

  let csrfToken: string | null = null;

  instance.interceptors.request.use(
    async (config) => {
      const methodsRequiringCsrf = ["post", "put", "patch", "delete"];
      if (config.method && methodsRequiringCsrf.includes(config.method.toLowerCase())) {
        if (!csrfToken) {
          csrfToken = await fetchCsrfToken(instance);
        }
        if (csrfToken) {
          config.headers["X-CSRF-Token"] = csrfToken;
        }
      }
      return config;
    },
    (error) => Promise.reject(error),
  );

  // Helper to detect CSRF-specific 403 errors (csrf-sync sets error message or header)
  function isCsrfError(error: AxiosError): boolean {
    // Check for common csrf-sync error message in response data
    const data = error.response?.data as { error?: string } | undefined;
    if (typeof data?.error === "string" && data.error.toLowerCase().includes("csrf")) {
      return true;
    }
    // Check for custom header (if your backend sets one, e.g., x-csrf-error)
    const csrfHeader = error.response?.headers?.["x-csrf-error"];
    if (csrfHeader) return true;
    return false;
  }

  // Handle CSRF token invalidation on CSRF-specific 403 responses
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      // Only retry if 403 is due to CSRF token failure
      if (
        error.response?.status === 403 &&
        !error.config._csrfRetried &&
        isCsrfError(error)
      ) {
        csrfToken = null;
        csrfToken = await fetchCsrfToken(instance);
        const retryConfig = { ...error.config, _csrfRetried: true };
        if (csrfToken) {
          retryConfig.headers = { ...retryConfig.headers, "X-CSRF-Token": csrfToken };
        }
        return instance.request(retryConfig);
      }
      return Promise.reject(error);
    },
  );

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

// Axios instance with credentials for API calls
export const httpClient = createHttpClient(defaultBaseURL);

// Export base URLs as strings for use in other modules (login fallback behavior, etc.)
export const API_BASE_URL = defaultBaseURL;

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
      staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 minutes before refetch
      gcTime: 10 * 60 * 1000, // 10 minutes - keep cached data for 10 minutes
      refetchOnWindowFocus: false, // don't refetch when user returns to window
      refetchOnReconnect: true, // refetch when connection restored (user went offline)
      refetchOnMount: false, // don't refetch just because component mounted
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
