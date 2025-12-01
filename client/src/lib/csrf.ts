import type { Axios } from "axios";
import { logger } from "./logger";

export const fetchCsrfToken = async (instance: Axios) => {
  try {
    const { data } = await instance.get<{ token: string }>("/csrf-token");
    return data.token;
  } catch (error) {
    logger.error({ error }, "[queries] Failed to fetch CSRF token");
    return null;
  }
};
