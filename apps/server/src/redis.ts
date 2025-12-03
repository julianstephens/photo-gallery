import { RedisStore } from "connect-redis";
import { redisClient } from "utils/redis";

const redisStore = new RedisStore({ client: redisClient, prefix: "pg:sess:" });

export default { client: redisClient, store: redisStore };
