/**
 * Centralized store for tracking chunked upload progress
 * Used by UploadPhotosButton to notify UploadMonitor of active uploads
 */

import {
  clearPersistedUploads,
  loadAllPersistedUploadsForUser,
  markAllUploadsAsSeen,
  markUploadAsSeen,
  savePersistedUploads,
  toPersistedUpload,
  type PersistedUpload,
} from "./uploadPersistence";

export interface ActiveUpload {
  id: string;
  fileName: string;
  galleryName: string;
  guildId: string;
  progress: number; // 0-100
  status: "uploading" | "completed" | "failed";
  error?: string;
  startTime: number;
  completedTime?: number;
  seen?: boolean;
}

type UploadListener = (uploads: ActiveUpload[]) => void;
type PersistenceConfig = {
  userId: string;
  enabled: boolean;
};

// Debounce delay for progress updates (in ms)
const PERSIST_DEBOUNCE_MS = 500;

class UploadProgressStore {
  private uploads = new Map<string, ActiveUpload>();
  private listeners: Set<UploadListener> = new Set();
  private persistenceConfig: PersistenceConfig | null = null;
  private persistDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private knownGuildIds: Set<string> = new Set();

  subscribe(listener: UploadListener): () => void {
    this.listeners.add(listener);
    listener(Array.from(this.uploads.values()));
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const uploads = Array.from(this.uploads.values());
    this.listeners.forEach((listener) => listener(uploads));
  }

  /**
   * Persists current uploads to localStorage if persistence is enabled.
   * Groups uploads by guildId and saves them separately.
   * Also cleans up storage for guilds that no longer have active uploads.
   */
  private persistState(): void {
    if (!this.persistenceConfig?.enabled || !this.persistenceConfig.userId) return;

    const { userId } = this.persistenceConfig;
    const uploadsByGuild = new Map<string, PersistedUpload[]>();
    const currentGuildIds = new Set<string>();

    // Group uploads by guildId
    for (const upload of this.uploads.values()) {
      currentGuildIds.add(upload.guildId);
      const guildUploads = uploadsByGuild.get(upload.guildId) || [];
      guildUploads.push(toPersistedUpload(upload));
      uploadsByGuild.set(upload.guildId, guildUploads);
    }

    // Save each guild's uploads
    for (const [guildId, uploads] of uploadsByGuild) {
      savePersistedUploads(userId, guildId, uploads);
    }

    // Clean up storage for guilds that no longer have active uploads
    for (const guildId of this.knownGuildIds) {
      if (!currentGuildIds.has(guildId)) {
        clearPersistedUploads(userId, guildId);
      }
    }

    // Update known guild IDs
    this.knownGuildIds = currentGuildIds;
  }

  /**
   * Debounced version of persistState for frequent updates like progress.
   */
  private persistStateDebounced(): void {
    if (this.persistDebounceTimer) {
      clearTimeout(this.persistDebounceTimer);
    }
    this.persistDebounceTimer = setTimeout(() => {
      this.persistState();
      this.persistDebounceTimer = null;
    }, PERSIST_DEBOUNCE_MS);
  }

  /**
   * Enables persistence and hydrates state from localStorage.
   * Returns true if there are entries that should trigger showing the monitor.
   */
  enablePersistence(userId: string): boolean {
    // Clear any existing uploads from previous session
    this.uploads.clear();
    this.knownGuildIds.clear();
    this.persistenceConfig = { userId, enabled: true };

    // Load persisted uploads for all guilds
    const allPersistedUploads = loadAllPersistedUploadsForUser(userId);
    let hasEntriesToShow = false;

    for (const [guildId, uploads] of allPersistedUploads) {
      this.knownGuildIds.add(guildId);
      for (const upload of uploads) {
        // loadPersistedUploads already filters out seen entries
        if (!this.uploads.has(upload.id)) {
          this.uploads.set(upload.id, upload);
          hasEntriesToShow = true;
        }
      }
    }

    if (hasEntriesToShow) {
      this.notifyListeners();
    }

    return hasEntriesToShow;
  }

  /**
   * Disables persistence and clears in-memory uploads.
   */
  disablePersistence(): void {
    this.persistenceConfig = null;
    this.uploads.clear();
    this.knownGuildIds.clear();
    if (this.persistDebounceTimer) {
      clearTimeout(this.persistDebounceTimer);
      this.persistDebounceTimer = null;
    }
    this.notifyListeners();
  }

  addUpload(id: string, fileName: string, galleryName: string, guildId: string): void {
    this.knownGuildIds.add(guildId);
    this.uploads.set(id, {
      id,
      fileName,
      galleryName,
      guildId,
      progress: 0,
      status: "uploading",
      startTime: Date.now(),
      seen: false,
    });
    this.notifyListeners();
    this.persistState();
  }

  updateProgress(id: string, progress: number): void {
    const upload = this.uploads.get(id);
    if (upload) {
      upload.progress = Math.min(100, Math.max(0, progress));
      this.notifyListeners();
      // Use debounced persistence for frequent progress updates
      this.persistStateDebounced();
    }
  }

  completeUpload(id: string): void {
    const upload = this.uploads.get(id);
    if (upload) {
      upload.status = "completed";
      upload.progress = 100;
      upload.completedTime = Date.now();
      this.notifyListeners();
      this.persistState();
    }
  }

  failUpload(id: string, error: string): void {
    const upload = this.uploads.get(id);
    if (upload) {
      upload.status = "failed";
      upload.error = error;
      upload.completedTime = Date.now();
      this.notifyListeners();
      this.persistState();
    }
  }

  /**
   * Removes an upload from the store and marks it as seen in persistence.
   * This is called when a user explicitly clears an upload.
   */
  removeUpload(id: string): void {
    const upload = this.uploads.get(id);
    if (upload && this.persistenceConfig?.enabled && this.persistenceConfig.userId) {
      // Mark as seen in storage directly so it won't be restored on next load
      markUploadAsSeen(this.persistenceConfig.userId, upload.guildId, id);
    }
    this.uploads.delete(id);
    this.notifyListeners();
  }

  getUploads(): ActiveUpload[] {
    return Array.from(this.uploads.values());
  }

  /**
   * Clears all non-uploading uploads and marks them as seen.
   */
  clearCompleted(): void {
    const uploadsToRemove: string[] = [];
    for (const upload of this.uploads.values()) {
      if (upload.status !== "uploading") {
        uploadsToRemove.push(upload.id);
        // Mark as seen in storage directly
        if (this.persistenceConfig?.enabled && this.persistenceConfig.userId) {
          markUploadAsSeen(this.persistenceConfig.userId, upload.guildId, upload.id);
        }
      }
    }

    for (const id of uploadsToRemove) {
      this.uploads.delete(id);
    }
    this.notifyListeners();
  }

  clear(): void {
    // Mark all as seen before clearing
    if (this.persistenceConfig?.enabled && this.persistenceConfig.userId) {
      // Group by guildId and mark all as seen
      const guildIds = new Set<string>();
      for (const upload of this.uploads.values()) {
        guildIds.add(upload.guildId);
      }
      for (const guildId of guildIds) {
        markAllUploadsAsSeen(this.persistenceConfig.userId, guildId);
      }
    }

    this.uploads.clear();
    this.notifyListeners();
  }
}

export const uploadProgressStore = new UploadProgressStore();
