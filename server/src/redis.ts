import { createClient } from "redis";
import env from "./schemas/env.ts";
import { RedisStore } from "connect-redis";

const redisClient = createClient({
  url: `redis://${env.REDIS_USER}:${env.REDIS_PASSWORD}@${env.REDIS_HOST}:${env.REDIS_PORT}/1`,
});
redisClient.connect().catch(console.error);

const redisStore = new RedisStore({ client: redisClient, prefix: "pg:sess:" });

export default { client: redisClient, store: redisStore };
