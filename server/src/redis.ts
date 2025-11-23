import { RedisStore } from "connect-redis";
import { createClient } from "redis";
import env from "./schemas/env.ts";

const redisClient = createClient({
  url: `redis://${env.REDIS_USER}:${env.REDIS_PASSWORD}@${env.REDIS_HOST}:${env.REDIS_PORT}/${env.REDIS_DB}`,
});
redisClient.connect().catch(console.error);

const redisStore = new RedisStore({ client: redisClient, prefix: "pg:sess:" });

export default { client: redisClient, store: redisStore };
