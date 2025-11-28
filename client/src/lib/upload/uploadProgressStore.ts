/**
 * Centralized store for tracking chunked upload progress
 * Used by UploadPhotosButton to notify UploadMonitor of active uploads
 */

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
}

type UploadListener = (uploads: ActiveUpload[]) => void;

class UploadProgressStore {
  private uploads = new Map<string, ActiveUpload>();
  private listeners: Set<UploadListener> = new Set();

  subscribe(listener: UploadListener): () => void {
    this.listeners.add(listener);
    listener(Array.from(this.uploads.values()));
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const uploads = Array.from(this.uploads.values());
    this.listeners.forEach((listener) => listener(uploads));
  }

  addUpload(id: string, fileName: string, galleryName: string, guildId: string): void {
    this.uploads.set(id, {
      id,
      fileName,
      galleryName,
      guildId,
      progress: 0,
      status: "uploading",
      startTime: Date.now(),
    });
    this.notifyListeners();
  }

  updateProgress(id: string, progress: number): void {
    const upload = this.uploads.get(id);
    if (upload) {
      upload.progress = Math.min(100, Math.max(0, progress));
      this.notifyListeners();
    }
  }

  completeUpload(id: string): void {
    const upload = this.uploads.get(id);
    if (upload) {
      upload.status = "completed";
      upload.progress = 100;
      upload.completedTime = Date.now();
      this.notifyListeners();
    }
  }

  failUpload(id: string, error: string): void {
    const upload = this.uploads.get(id);
    if (upload) {
      upload.status = "failed";
      upload.error = error;
      upload.completedTime = Date.now();
      this.notifyListeners();
    }
  }

  removeUpload(id: string): void {
    this.uploads.delete(id);
    this.notifyListeners();
  }

  getUploads(): ActiveUpload[] {
    return Array.from(this.uploads.values());
  }

  clear(): void {
    this.uploads.clear();
    this.notifyListeners();
  }
}

export const uploadProgressStore = new UploadProgressStore();
