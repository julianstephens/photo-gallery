/**
 * Persistence helpers for upload state using localStorage.
 * Uploads are keyed by user ID and guild ID to support multi-user/multi-guild scenarios.
 */

import type { ActiveUpload } from "./uploadProgressStore";

export interface PersistedUpload extends ActiveUpload {
  seen: boolean;
}

const STORAGE_KEY_PREFIX = "photo-gallery:uploads";

/**
 * Generates a storage key for the given user and guild.
 */
export const getStorageKey = (userId: string, guildId: string): string => {
  return `${STORAGE_KEY_PREFIX}:${userId}:${guildId}`;
};

/**
 * Loads persisted uploads from localStorage for the given user and guild.
 * Returns only unseen entries (entries that haven't been cleared by the user).
 */
export const loadPersistedUploads = (userId: string, guildId: string): PersistedUpload[] => {
  try {
    const key = getStorageKey(userId, guildId);
    const stored = localStorage.getItem(key);
    if (!stored) return [];

    const uploads = JSON.parse(stored) as PersistedUpload[];
    // Filter out seen entries - they should not be restored
    return uploads.filter((upload) => !upload.seen);
  } catch (error) {
    console.warn("[uploadPersistence] Failed to load persisted uploads:", error);
    return [];
  }
};

/**
 * Saves uploads to localStorage for the given user and guild.
 */
export const savePersistedUploads = (
  userId: string,
  guildId: string,
  uploads: PersistedUpload[],
): void => {
  try {
    const key = getStorageKey(userId, guildId);
    if (uploads.length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(uploads));
    }
  } catch (error) {
    console.warn("[uploadPersistence] Failed to save persisted uploads:", error);
  }
};

/**
 * Marks an upload as seen (user has cleared it).
 * The upload stays in storage but won't be restored on next load.
 */
export const markUploadAsSeen = (userId: string, guildId: string, uploadId: string): void => {
  try {
    const key = getStorageKey(userId, guildId);
    const stored = localStorage.getItem(key);
    if (!stored) return;

    const uploads = JSON.parse(stored) as PersistedUpload[];
    const updatedUploads = uploads.map((upload) =>
      upload.id === uploadId ? { ...upload, seen: true } : upload,
    );
    localStorage.setItem(key, JSON.stringify(updatedUploads));
  } catch (error) {
    console.warn("[uploadPersistence] Failed to mark upload as seen:", error);
  }
};

/**
 * Marks all uploads as seen for the given user and guild.
 */
export const markAllUploadsAsSeen = (userId: string, guildId: string): void => {
  try {
    const key = getStorageKey(userId, guildId);
    const stored = localStorage.getItem(key);
    if (!stored) return;

    const uploads = JSON.parse(stored) as PersistedUpload[];
    const updatedUploads = uploads.map((upload) => ({ ...upload, seen: true }));
    localStorage.setItem(key, JSON.stringify(updatedUploads));
  } catch (error) {
    console.warn("[uploadPersistence] Failed to mark all uploads as seen:", error);
  }
};

/**
 * Removes an upload from persistence completely.
 */
export const removePersistedUpload = (userId: string, guildId: string, uploadId: string): void => {
  try {
    const key = getStorageKey(userId, guildId);
    const stored = localStorage.getItem(key);
    if (!stored) return;

    const uploads = JSON.parse(stored) as PersistedUpload[];
    const filteredUploads = uploads.filter((upload) => upload.id !== uploadId);
    savePersistedUploads(userId, guildId, filteredUploads);
  } catch (error) {
    console.warn("[uploadPersistence] Failed to remove persisted upload:", error);
  }
};

/**
 * Clears all persisted uploads for the given user and guild.
 */
export const clearPersistedUploads = (userId: string, guildId: string): void => {
  try {
    const key = getStorageKey(userId, guildId);
    localStorage.removeItem(key);
  } catch (error) {
    console.warn("[uploadPersistence] Failed to clear persisted uploads:", error);
  }
};

/**
 * Converts an ActiveUpload to a PersistedUpload with seen flag set to false.
 */
export const toPersistedUpload = (upload: ActiveUpload): PersistedUpload => ({
  ...upload,
  seen: false,
});

/**
 * Loads all persisted uploads for a user across all guilds.
 * Returns a map of guildId -> PersistedUpload[].
 */
export const loadAllPersistedUploadsForUser = (userId: string): Map<string, PersistedUpload[]> => {
  const result = new Map<string, PersistedUpload[]>();
  try {
    const prefix = `${STORAGE_KEY_PREFIX}:${userId}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const guildId = key.slice(prefix.length);
        const uploads = loadPersistedUploads(userId, guildId);
        if (uploads.length > 0) {
          result.set(guildId, uploads);
        }
      }
    }
  } catch (error) {
    console.warn("[uploadPersistence] Failed to load all persisted uploads:", error);
  }
  return result;
};
