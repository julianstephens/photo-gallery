import { logger } from "@/lib/logger";
import type { AuthContextValue } from "@/lib/types";
import { AuthContext } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "utils";
import {
  login as doLogin,
  logout as doLogout,
  getCurrentUser as fetchCurrentUser,
} from "../queries";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const initRan = useRef(false);

  const setUnauthed = () => {
    setCurrentUser(null);
  };

  const refreshUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = (await fetchCurrentUser()) as User | null;
      if (user) {
        setCurrentUser(user);
        setError(null);
      } else {
        setUnauthed();
      }
    } catch (e) {
      // If we get a 401, the session might not be ready yet.
      // This can happen after OAuth redirect when the session is being persisted to Redis.
      // Implement exponential backoff retry strategy with up to 3 attempts (500ms, 1s, 2s).
      const errorMsg = e instanceof Error ? e.message : String(e);
      if (errorMsg.includes("401")) {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
          const delayMs = 500 * 2 ** (attempt - 1); // 500ms, 1s, 2s
          logger.debug(
            `[AuthContext] Session not yet available (401), retry ${attempt}/3 in ${delayMs}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));

          try {
            const user = (await fetchCurrentUser()) as User | null;
            if (user) {
              logger.debug("[AuthContext] Successfully loaded user after retry");
              setCurrentUser(user);
              setError(null);
              return; // Success, exit the function
            } else {
              // Not authed, but we got a valid response - stop retrying
              logger.debug("[AuthContext] Got valid response confirming user is not authenticated");
              setUnauthed();
              return;
            }
          } catch (retryError) {
            lastError = retryError instanceof Error ? retryError : new Error("Failed to load user");
            if (attempt < 3) {
              logger.debug(`[AuthContext] Retry attempt ${attempt} failed, will try again`);
            }
          }
        }

        // All retries exhausted
        if (lastError) {
          logger.warn(
            `[AuthContext] All 3 retry attempts failed, setting error: ${lastError.message}`,
          );
          setError(lastError);
        }
        setUnauthed();
      } else {
        logger.error({ err: e }, "[AuthContext] Non-401 error loading user");
        setError(e instanceof Error ? e : new Error("Failed to load user"));
        setUnauthed();
      }
    } finally {
      setLoading(false);
      setAuthReady(true);
    }
  }, []);

  // Silent refresh: revalidates auth without showing loading spinner
  // Used for background revalidation (e.g., page visibility changes)
  const silentRefreshUser = useCallback(async () => {
    setIsRevalidating(true);
    try {
      const user = (await fetchCurrentUser()) as User | null;
      if (user) {
        setCurrentUser(user);
        setError(null);
      } else {
        setUnauthed();
      }
    } catch (e) {
      // For silent refresh, we don't retry on 401 - just update state
      // If user is no longer authenticated, update state accordingly
      const errorMsg = e instanceof Error ? e.message : String(e);
      if (errorMsg.includes("401")) {
        logger.debug("[AuthContext] Silent refresh: session expired or invalid");
        setUnauthed();
      } else {
        // For non-401 errors during silent refresh, log but don't disrupt user
        logger.warn({ err: e }, "[AuthContext] Silent refresh failed, keeping current state");
      }
    } finally {
      setIsRevalidating(false);
    }
  }, []);

  useEffect(() => {
    if (!initRan.current) {
      initRan.current = true;
      void refreshUser();
    }
  }, [refreshUser]);

  // Revalidate auth when page becomes visible (user returns to tab)
  // Uses silent refresh to avoid disrupting user experience with loading spinners
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        logger.debug("[AuthContext] Page became visible, silently revalidating auth");
        void silentRefreshUser();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [silentRefreshUser]);

  const login = useCallback(() => {
    doLogin();
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await doLogout();
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Failed to logout"));
    } finally {
      setUnauthed();
      setLoading(false);
      setAuthReady(true);
    }
  }, []);

  const value: AuthContextValue = {
    isAuthed: !!currentUser,
    authReady,
    currentUser,
    loading,
    isRevalidating,
    error,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
