import { beforeEach, describe, expect, it } from "vitest";
import { getStorageKey, type PersistedUpload } from "./uploadPersistence";
import { uploadProgressStore } from "./uploadProgressStore";

describe("uploadProgressStore with persistence", () => {
  const mockUserId = "user123";
  const mockGuildId = "guild456";

  beforeEach(() => {
    localStorage.clear();
    // Reset the store between tests
    uploadProgressStore.disablePersistence();
    uploadProgressStore.clear();
  });

  describe("enablePersistence", () => {
    it("should hydrate state from localStorage", () => {
      const persistedUpload: PersistedUpload = {
        id: "persisted-1",
        fileName: "test.jpg",
        galleryName: "gallery",
        guildId: mockGuildId,
        progress: 100,
        status: "completed",
        startTime: Date.now() - 1000,
        completedTime: Date.now(),
        seen: false,
      };

      localStorage.setItem(
        getStorageKey(mockUserId, mockGuildId),
        JSON.stringify([persistedUpload]),
      );

      const hasUploads = uploadProgressStore.enablePersistence(mockUserId);

      expect(hasUploads).toBe(true);
      const uploads = uploadProgressStore.getUploads();
      expect(uploads).toHaveLength(1);
      expect(uploads[0].id).toBe("persisted-1");
    });

    it("should not restore seen uploads", () => {
      const seenUpload: PersistedUpload = {
        id: "seen-1",
        fileName: "seen.jpg",
        galleryName: "gallery",
        guildId: mockGuildId,
        progress: 100,
        status: "completed",
        startTime: Date.now() - 1000,
        completedTime: Date.now(),
        seen: true,
      };

      localStorage.setItem(getStorageKey(mockUserId, mockGuildId), JSON.stringify([seenUpload]));

      const hasUploads = uploadProgressStore.enablePersistence(mockUserId);

      expect(hasUploads).toBe(false);
      expect(uploadProgressStore.getUploads()).toHaveLength(0);
    });

    it("should return false when no persisted uploads exist", () => {
      const hasUploads = uploadProgressStore.enablePersistence(mockUserId);
      expect(hasUploads).toBe(false);
    });
  });

  describe("persistence on state changes", () => {
    beforeEach(() => {
      uploadProgressStore.enablePersistence(mockUserId);
    });

    it("should persist when adding upload", () => {
      uploadProgressStore.addUpload("new-1", "new.jpg", "gallery", mockGuildId);

      const key = getStorageKey(mockUserId, mockGuildId);
      const stored = JSON.parse(localStorage.getItem(key)!) as PersistedUpload[];
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe("new-1");
    });

    it("should persist when updating progress", () => {
      uploadProgressStore.addUpload("new-1", "new.jpg", "gallery", mockGuildId);
      uploadProgressStore.updateProgress("new-1", 50);

      const key = getStorageKey(mockUserId, mockGuildId);
      const stored = JSON.parse(localStorage.getItem(key)!) as PersistedUpload[];
      expect(stored[0].progress).toBe(50);
    });

    it("should persist when completing upload", () => {
      uploadProgressStore.addUpload("new-1", "new.jpg", "gallery", mockGuildId);
      uploadProgressStore.completeUpload("new-1");

      const key = getStorageKey(mockUserId, mockGuildId);
      const stored = JSON.parse(localStorage.getItem(key)!) as PersistedUpload[];
      expect(stored[0].status).toBe("completed");
      expect(stored[0].completedTime).toBeDefined();
    });

    it("should persist when failing upload", () => {
      uploadProgressStore.addUpload("new-1", "new.jpg", "gallery", mockGuildId);
      uploadProgressStore.failUpload("new-1", "Test error");

      const key = getStorageKey(mockUserId, mockGuildId);
      const stored = JSON.parse(localStorage.getItem(key)!) as PersistedUpload[];
      expect(stored[0].status).toBe("failed");
      expect(stored[0].error).toBe("Test error");
    });

    it("should mark as seen when removing upload", () => {
      uploadProgressStore.addUpload("new-1", "new.jpg", "gallery", mockGuildId);
      uploadProgressStore.completeUpload("new-1");
      uploadProgressStore.removeUpload("new-1");

      // Upload should be removed from store
      expect(uploadProgressStore.getUploads()).toHaveLength(0);

      // The storage should have the upload marked as seen
      const key = getStorageKey(mockUserId, mockGuildId);
      const stored = JSON.parse(localStorage.getItem(key)!) as PersistedUpload[];
      expect(stored).toHaveLength(1);
      expect(stored[0].seen).toBe(true);
    });
  });

  describe("clearCompleted", () => {
    beforeEach(() => {
      uploadProgressStore.enablePersistence(mockUserId);
    });

    it("should clear only completed/failed uploads", () => {
      uploadProgressStore.addUpload("uploading-1", "uploading.jpg", "gallery", mockGuildId);
      uploadProgressStore.addUpload("completed-1", "completed.jpg", "gallery", mockGuildId);
      uploadProgressStore.addUpload("failed-1", "failed.jpg", "gallery", mockGuildId);

      uploadProgressStore.completeUpload("completed-1");
      uploadProgressStore.failUpload("failed-1", "Error");

      uploadProgressStore.clearCompleted();

      const uploads = uploadProgressStore.getUploads();
      expect(uploads).toHaveLength(1);
      expect(uploads[0].id).toBe("uploading-1");
    });

    it("should mark cleared uploads as seen in persistence", () => {
      uploadProgressStore.addUpload("completed-1", "completed.jpg", "gallery", mockGuildId);
      uploadProgressStore.completeUpload("completed-1");
      uploadProgressStore.clearCompleted();

      // After clearing, the storage should contain only the seen entry
      const key = getStorageKey(mockUserId, mockGuildId);
      const stored = JSON.parse(localStorage.getItem(key)!) as PersistedUpload[];
      expect(stored).toHaveLength(1);
      expect(stored[0].seen).toBe(true);
    });
  });

  describe("clear", () => {
    beforeEach(() => {
      uploadProgressStore.enablePersistence(mockUserId);
    });

    it("should clear all uploads and mark them as seen", () => {
      uploadProgressStore.addUpload("1", "1.jpg", "gallery", mockGuildId);
      uploadProgressStore.addUpload("2", "2.jpg", "gallery", mockGuildId);

      uploadProgressStore.clear();

      expect(uploadProgressStore.getUploads()).toHaveLength(0);
    });
  });
});
