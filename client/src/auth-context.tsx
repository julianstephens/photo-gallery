import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "utils";
import {
  login as doLogin,
  logout as doLogout,
  getCurrentUser as fetchCurrentUser,
} from "./queries";
import type { AuthContextValue } from "./types";
import { AuthContext } from "./utils";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(false);
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
      } else {
        setUnauthed();
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Failed to load user"));
      setUnauthed();
    } finally {
      setLoading(false);
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    if (!initRan.current) {
      initRan.current = true;
      void refreshUser();
    }
  }, [refreshUser]);

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
    error,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
