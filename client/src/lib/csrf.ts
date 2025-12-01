import type { Axios } from "axios";
import { logger } from "./logger";

export const fetchCsrfToken = async (instance: Axios) => {
  try {
    logger.debug("[csrf] Fetching CSRF token from /csrf-token");
    const { data } = await instance.get<{ token: string }>("/csrf-token");
    const token = data.token;
    if (!token) {
      logger.warn("[csrf] Received empty/null token from server");
      return null;
    }
    logger.debug({ tokenPrefix: token.substring(0, 10) }, "[csrf] Successfully fetched CSRF token");
    return token;
  } catch (error) {
    logger.error({ error }, "[csrf] Failed to fetch CSRF token");
    return null;
  }
};
