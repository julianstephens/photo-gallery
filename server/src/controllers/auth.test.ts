import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockEnvModule } from "../utils/test-mocks.ts";
import { AuthController } from "./auth.ts";

// Mock axios
vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

// Mock env
vi.mock("../schemas/env.ts", () => mockEnvModule());

describe("AuthController", () => {
  let controller: AuthController;
  let mockAxios: typeof import("axios").default;

  beforeEach(async () => {
    controller = new AuthController();
    mockAxios = (await import("axios")).default;
    vi.clearAllMocks();
  });

  describe("login", () => {
    it("should successfully login with valid code", async () => {
      const mockTokenResponse = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_in: 3600,
      };

      const mockUserData = {
        id: "user-123",
        username: "testuser",
        discriminator: "1234",
        avatar: "avatar-hash",
      };

      const mockGuildsData = [
        { id: "guild-1", name: "Test Guild 1" },
        { id: "guild-2", name: "Test Guild 2" },
      ];

      mockAxios.post.mockResolvedValueOnce({ data: mockTokenResponse });
      mockAxios.get
        .mockResolvedValueOnce({ data: mockUserData })
        .mockResolvedValueOnce({ data: mockGuildsData });

      const result = await controller.login("test-code");

      expect(result).toMatchObject({
        userId: "user-123",
        username: "testuser",
        accessToken: "test-access-token",
        refreshToken: "test-refresh-token",
        isAdmin: false,
      });
      expect(result.expiresAt).toBeGreaterThan(Date.now());
      expect(mockAxios.post).toHaveBeenCalledWith(
        "https://discord.com/api/oauth2/token",
        expect.any(String),
        expect.objectContaining({
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }),
      );
    });

    it("should mark admin users correctly", async () => {
      const mockTokenResponse = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_in: 3600,
      };

      const mockUserData = {
        id: "admin-user-1",
        username: "adminuser",
        discriminator: "0001",
        avatar: "admin-avatar",
      };

      const mockGuildsData = [];

      mockAxios.post.mockResolvedValueOnce({ data: mockTokenResponse });
      mockAxios.get
        .mockResolvedValueOnce({ data: mockUserData })
        .mockResolvedValueOnce({ data: mockGuildsData });

      const result = await controller.login("test-code");

      expect(result.isAdmin).toBe(true);
    });
  });

  describe("logout", () => {
    it("should be defined", () => {
      expect(controller.logout).toBeDefined();
      expect(typeof controller.logout).toBe("function");
    });

    it("should complete without error", () => {
      expect(() => controller.logout()).not.toThrow();
    });
  });

  describe("getCurrentUser", () => {
    it("should fetch current user with access token", async () => {
      const mockUserData = {
        id: "user-456",
        username: "currentuser",
        discriminator: "5678",
        avatar: "current-avatar",
      };

      const mockGuildsData = [{ id: "guild-3", name: "User Guild" }];

      mockAxios.get
        .mockResolvedValueOnce({ data: mockUserData })
        .mockResolvedValueOnce({ data: mockGuildsData });

      const result = await controller.getCurrentUser({ accessToken: "test-token" });

      expect(result).toMatchObject({
        id: "user-456",
        username: "currentuser",
        isAdmin: false,
        guilds: mockGuildsData,
      });
      expect(mockAxios.get).toHaveBeenCalledWith("https://discord.com/api/users/@me", {
        headers: { Authorization: "Bearer test-token" },
      });
      expect(mockAxios.get).toHaveBeenCalledWith("https://discord.com/api/users/@me/guilds", {
        headers: { Authorization: "Bearer test-token" },
      });
    });

    it("should correctly identify admin users", async () => {
      const mockUserData = {
        id: "admin-user-2",
        username: "adminuser2",
        discriminator: "0002",
        avatar: "admin2-avatar",
      };

      const mockGuildsData = [];

      mockAxios.get
        .mockResolvedValueOnce({ data: mockUserData })
        .mockResolvedValueOnce({ data: mockGuildsData });

      const result = await controller.getCurrentUser({ accessToken: "admin-token" });

      expect(result.isAdmin).toBe(true);
    });
  });

  describe("getUserGuilds", () => {
    it("should fetch user guilds with access token", async () => {
      const mockGuildsData = [
        { id: "guild-a", name: "Guild A", icon: "icon-a" },
        { id: "guild-b", name: "Guild B", icon: "icon-b" },
        { id: "guild-c", name: "Guild C", icon: null },
      ];

      mockAxios.get.mockResolvedValueOnce({ data: mockGuildsData });

      const result = await controller.getUserGuilds({ accessToken: "test-token" });

      expect(result).toEqual(mockGuildsData);
      expect(mockAxios.get).toHaveBeenCalledWith("https://discord.com/api/users/@me/guilds", {
        headers: { Authorization: "Bearer test-token" },
      });
    });

    it("should return empty array when user has no guilds", async () => {
      mockAxios.get.mockResolvedValueOnce({ data: [] });

      const result = await controller.getUserGuilds({ accessToken: "test-token" });

      expect(result).toEqual([]);
    });
  });
});
