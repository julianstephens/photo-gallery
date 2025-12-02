import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "@/hooks";
import type { ReactNode } from "react";

// Mock the queries
vi.mock("../queries", () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
}));

// Mock the logger
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getCurrentUser, logout } from "../queries";
import { logger } from "@/lib/logger";

const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;
const mockLogout = logout as ReturnType<typeof vi.fn>;

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initial auth check", () => {
    it("should set loading=true during initial auth check", async () => {
      let resolveUser: (value: unknown) => void;
      mockGetCurrentUser.mockImplementation(
        () => new Promise((resolve) => (resolveUser = resolve)),
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Initially loading should be true, authReady should be false
      expect(result.current.loading).toBe(true);
      expect(result.current.authReady).toBe(false);

      await act(async () => {
        resolveUser({ id: "user1", username: "testuser" });
        await vi.runAllTimersAsync();
      });

      // After resolving, loading should be false, authReady should be true
      expect(result.current.loading).toBe(false);
      expect(result.current.authReady).toBe(true);
    });

    it("should set user when auth check succeeds", async () => {
      const mockUser = { id: "user1", username: "testuser" };
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.currentUser).toEqual(mockUser);
      expect(result.current.isAuthed).toBe(true);
    });
  });

  describe("silentRefreshUser (visibility change)", () => {
    it("should set isRevalidating=true during silent refresh, not loading", async () => {
      const mockUser = { id: "user1", username: "testuser" };
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for initial auth to complete
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.authReady).toBe(true);
      expect(result.current.loading).toBe(false);

      // Simulate visibility change returning to tab
      let resolveRefresh: (value: unknown) => void;
      mockGetCurrentUser.mockImplementation(
        () => new Promise((resolve) => (resolveRefresh = resolve)),
      );

      await act(async () => {
        // Trigger visibility change event
        Object.defineProperty(document, "visibilityState", {
          value: "visible",
          writable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // During silent refresh: isRevalidating should be true, loading should be false
      expect(result.current.isRevalidating).toBe(true);
      expect(result.current.loading).toBe(false);

      await act(async () => {
        resolveRefresh({ id: "user1", username: "testuser" });
        await vi.runAllTimersAsync();
      });

      // After silent refresh completes
      expect(result.current.isRevalidating).toBe(false);
      expect(result.current.loading).toBe(false);
    });

    it("should update user data silently on visibility change", async () => {
      const initialUser = { id: "user1", username: "testuser" };
      mockGetCurrentUser.mockResolvedValue(initialUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.currentUser).toEqual(initialUser);

      // Mock updated user data
      const updatedUser = { id: "user1", username: "updateduser" };
      mockGetCurrentUser.mockResolvedValue(updatedUser);

      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          value: "visible",
          writable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.runAllTimersAsync();
      });

      // User should be updated without showing loading spinner
      expect(result.current.currentUser).toEqual(updatedUser);
      expect(result.current.loading).toBe(false);
    });

    it("should clear user on 401 during silent refresh", async () => {
      const mockUser = { id: "user1", username: "testuser" };
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.isAuthed).toBe(true);

      // Mock 401 error on refresh
      mockGetCurrentUser.mockRejectedValue(new Error("401 Unauthorized"));

      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          value: "visible",
          writable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.runAllTimersAsync();
      });

      // User should be cleared but without loading spinner
      expect(result.current.isAuthed).toBe(false);
      expect(result.current.currentUser).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(logger.debug).toHaveBeenCalledWith(
        "[AuthContext] Silent refresh: session expired or invalid",
      );
    });

    it("should keep current state on non-401 error during silent refresh", async () => {
      const mockUser = { id: "user1", username: "testuser" };
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.isAuthed).toBe(true);

      // Mock network error on refresh
      mockGetCurrentUser.mockRejectedValue(new Error("Network error"));

      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          value: "visible",
          writable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.runAllTimersAsync();
      });

      // User should still be authenticated - we don't disrupt on non-401 errors
      expect(result.current.isAuthed).toBe(true);
      expect(result.current.currentUser).toEqual(mockUser);
      expect(result.current.loading).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        "[AuthContext] Silent refresh failed, keeping current state",
      );
    });

    it("should keep current state when fetchCurrentUser returns null during silent refresh", async () => {
      const mockUser = { id: "user1", username: "testuser" };
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.isAuthed).toBe(true);
      expect(result.current.currentUser).toEqual(mockUser);

      // Mock null response (transient error case)
      mockGetCurrentUser.mockResolvedValue(null);

      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          value: "visible",
          writable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.runAllTimersAsync();
      });

      // User should still be authenticated - null is treated as transient error
      expect(result.current.isAuthed).toBe(true);
      expect(result.current.currentUser).toEqual(mockUser);
      expect(result.current.loading).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        "[AuthContext] Silent refresh: fetchCurrentUser returned null, keeping current state",
      );
    });

    it("should clear error state on 401 during silent refresh", async () => {
      const mockUser = { id: "user1", username: "testuser" };
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.isAuthed).toBe(true);

      // Mock 401 error on refresh
      mockGetCurrentUser.mockRejectedValue(new Error("401 Unauthorized"));

      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          value: "visible",
          writable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.runAllTimersAsync();
      });

      // User should be cleared and error should be null (not an error condition)
      expect(result.current.isAuthed).toBe(false);
      expect(result.current.currentUser).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe("refreshUser (explicit)", () => {
    it("should set loading=true during explicit refresh", async () => {
      const mockUser = { id: "user1", username: "testuser" };
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      let resolveRefresh: (value: unknown) => void;
      mockGetCurrentUser.mockImplementation(
        () => new Promise((resolve) => (resolveRefresh = resolve)),
      );

      await act(async () => {
        result.current.refreshUser();
      });

      // During explicit refresh, loading should be true
      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolveRefresh(mockUser);
        await vi.runAllTimersAsync();
      });

      expect(result.current.loading).toBe(false);
    });
  });

  describe("logout", () => {
    it("should clear user on logout", async () => {
      const mockUser = { id: "user1", username: "testuser" };
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockLogout.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.isAuthed).toBe(true);

      await act(async () => {
        await result.current.logout();
        await vi.runAllTimersAsync();
      });

      expect(result.current.isAuthed).toBe(false);
      expect(result.current.currentUser).toBeNull();
    });
  });

  describe("race condition handling", () => {
    it("should handle concurrent refreshUser and silentRefreshUser calls correctly", async () => {
      // Setup: initial auth complete
      const mockUser = { id: "user1", username: "testuser" };
      mockGetCurrentUser.mockResolvedValue(mockUser);
      const { result } = renderHook(() => useAuth(), { wrapper });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.isAuthed).toBe(true);

      // Start refreshUser (sets loading=true)
      let resolveRefresh: (value: unknown) => void;
      mockGetCurrentUser.mockImplementation(
        () => new Promise((resolve) => (resolveRefresh = resolve)),
      );

      await act(async () => {
        result.current.refreshUser();
      });
      expect(result.current.loading).toBe(true);

      // Start silentRefreshUser while refreshUser is pending
      let resolveSilent: (value: unknown) => void;
      mockGetCurrentUser.mockImplementation(
        () => new Promise((resolve) => (resolveSilent = resolve)),
      );

      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          value: "visible",
          writable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // Resolve the old refreshUser call - should be ignored
      await act(async () => {
        resolveRefresh({ id: "user1", username: "olduser" });
        await vi.runAllTimersAsync();
      });

      // Resolve the newer silentRefreshUser call - should win
      await act(async () => {
        resolveSilent({ id: "user1", username: "newuser" });
        await vi.runAllTimersAsync();
      });

      // Verify only the latest request's result was applied
      expect(result.current.currentUser?.username).toBe("newuser");
      expect(result.current.loading).toBe(false);
      expect(result.current.isRevalidating).toBe(false);
    });

    it("should clear isRevalidating when refreshUser supersedes silentRefreshUser", async () => {
      const mockUser = { id: "user1", username: "testuser" };
      mockGetCurrentUser.mockResolvedValue(mockUser);
      const { result } = renderHook(() => useAuth(), { wrapper });
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Start silentRefreshUser
      let resolveSilent: (value: unknown) => void;
      mockGetCurrentUser.mockImplementation(
        () => new Promise((resolve) => (resolveSilent = resolve)),
      );

      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          value: "visible",
          writable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      expect(result.current.isRevalidating).toBe(true);

      // Start refreshUser which should clear isRevalidating
      let resolveRefresh: (value: unknown) => void;
      mockGetCurrentUser.mockImplementation(
        () => new Promise((resolve) => (resolveRefresh = resolve)),
      );

      await act(async () => {
        result.current.refreshUser();
      });

      // isRevalidating should be cleared by refreshUser
      expect(result.current.isRevalidating).toBe(false);
      expect(result.current.loading).toBe(true);

      // Resolve both - should not cause issues
      await act(async () => {
        resolveSilent({ id: "user1", username: "silent" });
        resolveRefresh({ id: "user1", username: "refresh" });
        await vi.runAllTimersAsync();
      });

      // Only the refresh result should be applied
      expect(result.current.currentUser?.username).toBe("refresh");
      expect(result.current.loading).toBe(false);
      expect(result.current.isRevalidating).toBe(false);
    });
  });
});
