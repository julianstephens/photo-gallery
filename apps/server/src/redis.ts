import { RedisStore } from "connect-redis";
import { createClient } from "redis";
import { appLogger } from "./middleware/logger.ts";
import env from "./schemas/env.ts";

const redisClient = createClient({
  url: `redis://${env.REDIS_USER}:${env.REDIS_PASSWORD}@${env.REDIS_HOST}:${env.REDIS_PORT}/${env.REDIS_DB}`,
});
redisClient.on("error", (err) => appLogger.error({ err }, "Redis Client Error"));
redisClient.connect().catch((err) => {
  appLogger.error({ err }, "Failed to connect to Redis");
});

const redisStore = new RedisStore({ client: redisClient, prefix: "pg:sess:" });

export default { client: redisClient, store: redisStore };
