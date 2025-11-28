import { useAuth } from "@/hooks";
import { uploadProgressStore } from "@/lib/upload";
import { useEffect, useRef } from "react";

/**
 * Hook that initializes upload persistence when the user is authenticated.
 * Returns true if there are persisted uploads that should trigger showing the monitor.
 */
export const useUploadPersistence = (): boolean => {
  const { currentUser, authReady } = useAuth();
  const hasPersistedUploads = useRef(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!authReady) return;

    if (currentUser?.id && !initialized.current) {
      initialized.current = true;
      hasPersistedUploads.current = uploadProgressStore.enablePersistence(currentUser.id);
    } else if (!currentUser && initialized.current) {
      // User logged out, disable persistence
      initialized.current = false;
      uploadProgressStore.disablePersistence();
    }
  }, [currentUser, authReady]);

  return hasPersistedUploads.current;
};
