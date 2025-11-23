export type UploadJobKey = string; // e.g. `${guildId}:${galleryName}`

export interface ActiveUploadJobEntry {
  key: UploadJobKey;
  jobId: string;
}

class UploadJobStore {
  private activeJobs = new Map<UploadJobKey, string>();

  makeKey(guildId: string, galleryName: string): UploadJobKey {
    return `${guildId}:${galleryName}`;
  }

  setActiveJob(key: UploadJobKey, jobId: string): void {
    this.activeJobs.set(key, jobId);
  }

  getActiveJob(key: UploadJobKey): string | undefined {
    return this.activeJobs.get(key);
  }

  clearActiveJob(key: UploadJobKey): void {
    this.activeJobs.delete(key);
  }

  clearJobId(jobId: string): void {
    const keysToDelete = Array.from(this.activeJobs.entries())
      .filter(([, value]) => value === jobId)
      .map(([key]) => key);
    for (const key of keysToDelete) {
      this.activeJobs.delete(key);
    }
  }
}

export const uploadJobStore = new UploadJobStore();
