import { useAuth } from "@/hooks";
import { uploadProgressStore } from "@/lib/upload";
import { useEffect, useRef, useState } from "react";

/**
 * Hook that initializes upload persistence when the user is authenticated.
 * Returns true if there are persisted uploads that should trigger showing the monitor.
 */
export const useUploadPersistence = (): boolean => {
  const { currentUser, authReady } = useAuth();
  const [hasPersistedUploads, setHasPersistedUploads] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!authReady) return;

    if (currentUser?.id && !initialized.current) {
      initialized.current = true;
      const hasPersisted = uploadProgressStore.enablePersistence(currentUser.id);
      setHasPersistedUploads(hasPersisted);
    } else if (!currentUser && initialized.current) {
      // User logged out, disable persistence
      initialized.current = false;
      uploadProgressStore.disablePersistence();
      setHasPersistedUploads(false);
    }
  }, [currentUser, authReady]);

  return hasPersistedUploads;
};
