import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPersistedUploads,
  getStorageKey,
  loadAllPersistedUploadsForUser,
  loadPersistedUploads,
  markAllUploadsAsSeen,
  markUploadAsSeen,
  removePersistedUpload,
  savePersistedUploads,
  toPersistedUpload,
  type PersistedUpload,
} from "./uploadPersistence";
import type { ActiveUpload } from "./uploadProgressStore";

describe("uploadPersistence", () => {
  const mockUserId = "user123";
  const mockGuildId = "guild456";

  const createMockUpload = (id: string, seen = false): PersistedUpload => ({
    id,
    fileName: `file-${id}.jpg`,
    galleryName: "test-gallery",
    guildId: mockGuildId,
    progress: 100,
    status: "completed",
    startTime: Date.now() - 1000,
    completedTime: Date.now(),
    seen,
  });

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("getStorageKey", () => {
    it("should generate correct storage key for user and guild", () => {
      const key = getStorageKey(mockUserId, mockGuildId);
      expect(key).toBe(`photo-gallery:uploads:${mockUserId}:${mockGuildId}`);
    });
  });

  describe("loadPersistedUploads", () => {
    it("should return empty array when no data exists", () => {
      const uploads = loadPersistedUploads(mockUserId, mockGuildId);
      expect(uploads).toEqual([]);
    });

    it("should return only unseen uploads", () => {
      const unseenUpload = createMockUpload("1", false);
      const seenUpload = createMockUpload("2", true);
      const key = getStorageKey(mockUserId, mockGuildId);
      localStorage.setItem(key, JSON.stringify([unseenUpload, seenUpload]));

      const uploads = loadPersistedUploads(mockUserId, mockGuildId);

      expect(uploads).toHaveLength(1);
      expect(uploads[0].id).toBe("1");
      expect(uploads[0].seen).toBe(false);
    });

    it("should handle invalid JSON gracefully", () => {
      const key = getStorageKey(mockUserId, mockGuildId);
      localStorage.setItem(key, "invalid json");

      const uploads = loadPersistedUploads(mockUserId, mockGuildId);

      expect(uploads).toEqual([]);
    });
  });

  describe("savePersistedUploads", () => {
    it("should save uploads to localStorage", () => {
      const uploads = [createMockUpload("1")];
      savePersistedUploads(mockUserId, mockGuildId, uploads);

      const key = getStorageKey(mockUserId, mockGuildId);
      const stored = JSON.parse(localStorage.getItem(key)!);
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe("1");
    });

    it("should remove key when uploads array is empty", () => {
      const key = getStorageKey(mockUserId, mockGuildId);
      localStorage.setItem(key, JSON.stringify([createMockUpload("1")]));

      savePersistedUploads(mockUserId, mockGuildId, []);

      expect(localStorage.getItem(key)).toBeNull();
    });
  });

  describe("markUploadAsSeen", () => {
    it("should mark specific upload as seen", () => {
      const uploads = [createMockUpload("1"), createMockUpload("2")];
      const key = getStorageKey(mockUserId, mockGuildId);
      localStorage.setItem(key, JSON.stringify(uploads));

      markUploadAsSeen(mockUserId, mockGuildId, "1");

      const stored = JSON.parse(localStorage.getItem(key)!) as PersistedUpload[];
      expect(stored.find((u) => u.id === "1")?.seen).toBe(true);
      expect(stored.find((u) => u.id === "2")?.seen).toBe(false);
    });

    it("should do nothing when key does not exist", () => {
      // Should not throw
      markUploadAsSeen(mockUserId, mockGuildId, "nonexistent");
      expect(localStorage.getItem(getStorageKey(mockUserId, mockGuildId))).toBeNull();
    });
  });

  describe("markAllUploadsAsSeen", () => {
    it("should mark all uploads as seen", () => {
      const uploads = [createMockUpload("1"), createMockUpload("2")];
      const key = getStorageKey(mockUserId, mockGuildId);
      localStorage.setItem(key, JSON.stringify(uploads));

      markAllUploadsAsSeen(mockUserId, mockGuildId);

      const stored = JSON.parse(localStorage.getItem(key)!) as PersistedUpload[];
      expect(stored.every((u) => u.seen)).toBe(true);
    });
  });

  describe("removePersistedUpload", () => {
    it("should remove specific upload from storage", () => {
      const uploads = [createMockUpload("1"), createMockUpload("2")];
      const key = getStorageKey(mockUserId, mockGuildId);
      localStorage.setItem(key, JSON.stringify(uploads));

      removePersistedUpload(mockUserId, mockGuildId, "1");

      const stored = JSON.parse(localStorage.getItem(key)!) as PersistedUpload[];
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe("2");
    });

    it("should clear storage when last upload is removed", () => {
      const uploads = [createMockUpload("1")];
      const key = getStorageKey(mockUserId, mockGuildId);
      localStorage.setItem(key, JSON.stringify(uploads));

      removePersistedUpload(mockUserId, mockGuildId, "1");

      expect(localStorage.getItem(key)).toBeNull();
    });
  });

  describe("clearPersistedUploads", () => {
    it("should remove all uploads for user and guild", () => {
      const key = getStorageKey(mockUserId, mockGuildId);
      localStorage.setItem(key, JSON.stringify([createMockUpload("1")]));

      clearPersistedUploads(mockUserId, mockGuildId);

      expect(localStorage.getItem(key)).toBeNull();
    });
  });

  describe("toPersistedUpload", () => {
    it("should convert ActiveUpload to PersistedUpload with seen=false", () => {
      const activeUpload: ActiveUpload = {
        id: "test-id",
        fileName: "test.jpg",
        galleryName: "gallery",
        guildId: "guild",
        progress: 50,
        status: "uploading",
        startTime: 1234567890,
      };

      const persisted = toPersistedUpload(activeUpload);

      expect(persisted.seen).toBe(false);
      expect(persisted.id).toBe(activeUpload.id);
      expect(persisted.fileName).toBe(activeUpload.fileName);
    });
  });

  describe("loadAllPersistedUploadsForUser", () => {
    it("should load uploads from all guilds for a user", () => {
      const guild1Upload = createMockUpload("1");
      const guild2Upload = { ...createMockUpload("2"), guildId: "guild789" };

      localStorage.setItem(getStorageKey(mockUserId, mockGuildId), JSON.stringify([guild1Upload]));
      localStorage.setItem(getStorageKey(mockUserId, "guild789"), JSON.stringify([guild2Upload]));

      const allUploads = loadAllPersistedUploadsForUser(mockUserId);

      expect(allUploads.size).toBe(2);
      expect(allUploads.get(mockGuildId)).toHaveLength(1);
      expect(allUploads.get("guild789")).toHaveLength(1);
    });

    it("should not include seen uploads", () => {
      const unseenUpload = createMockUpload("1", false);
      const seenUpload = createMockUpload("2", true);

      localStorage.setItem(
        getStorageKey(mockUserId, mockGuildId),
        JSON.stringify([unseenUpload, seenUpload]),
      );

      const allUploads = loadAllPersistedUploadsForUser(mockUserId);

      expect(allUploads.get(mockGuildId)).toHaveLength(1);
      expect(allUploads.get(mockGuildId)![0].id).toBe("1");
    });

    it("should return empty map when no uploads exist", () => {
      const allUploads = loadAllPersistedUploadsForUser(mockUserId);
      expect(allUploads.size).toBe(0);
    });
  });
});
