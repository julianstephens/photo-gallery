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

const createHttpClient = (baseURL: string) => {
  const instance = axios.create({
    baseURL,
    withCredentials: true,
  });
  attachRetryAfterInterceptor(instance);
  return instance;
};

const uploadBaseURL = import.meta.env.VITE_UPLOAD_BASE_URL as string | undefined;

// Axios instance with credentials for API calls
export const httpClient = createHttpClient("/api");
export const uploadHttpClient = uploadBaseURL ? createHttpClient(uploadBaseURL) : httpClient;

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
