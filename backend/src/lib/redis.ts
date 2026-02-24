import Redis from "ioredis";
import { config } from "../config";

function isValidRedisUrl(url: string): boolean {
  if (!url) return false;
  if (url.includes("auto-set") || url.includes("placeholder")) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return url === "redis://localhost:6379";
  }
}

const redisUrl = config.REDIS_URL;
const redisAvailable = isValidRedisUrl(redisUrl);

function createRedisClient(label: string): Redis {
  if (!redisAvailable) {
    console.warn(`[${label}] Redis URL not configured ("${redisUrl}"), creating offline client`);
    const client = new Redis({ lazyConnect: true, enableOfflineQueue: false });
    client.on("error", () => {}); // suppress errors
    return client;
  }

  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 10) return null; // stop retrying after 10 attempts
      return Math.min(times * 500, 5000);
    },
    reconnectOnError() {
      return true;
    },
    lazyConnect: true,
    enableReadyCheck: false, // Disable INFO command that requires auth
    showFriendlyErrorStack: true,
  });

  client.on("error", (err) => {
    console.error(`[${label}] Redis error:`, err.message);
  });
  client.on("connect", () => {
    console.log(`[${label}] Redis connected`);
  });

  return client;
}

export const redis = createRedisClient("redis");
export const redisSub = createRedisClient("redisSub");
export const redisPub = createRedisClient("redisPub");

export let redisConnected = false;

export async function connectRedis(): Promise<boolean> {
  if (!redisAvailable) {
    console.warn("Redis is not configured. Caching and pub/sub are disabled.");
    return false;
  }
  try {
    await Promise.all([redis.connect(), redisSub.connect(), redisPub.connect()]);
    redisConnected = true;
    console.log("All Redis clients connected successfully");
    return true;
  } catch (err: any) {
    console.error("Failed to connect to Redis:", err.message);
    console.warn("Continuing without Redis. Caching and pub/sub are disabled.");
    redisConnected = false;
    return false;
  }
}

/** Safe Redis GET — returns null on failure */
export async function safeGet(key: string): Promise<string | null> {
  if (!redisConnected) return null;
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

/** Safe Redis SET — silently fails */
export async function safeSet(key: string, value: string, ...args: any[]): Promise<void> {
  if (!redisConnected) return;
  try {
    await (redis.set as any)(key, value, ...args);
  } catch {
    // ignore
  }
}

/** Safe Redis PUBLISH — silently fails */
export async function safePublish(channel: string, message: string): Promise<void> {
  if (!redisConnected) return;
  try {
    await redisPub.publish(channel, message);
  } catch {
    // ignore
  }
}

export const CACHE_KEYS = {
  tokenPrice: (mint: string) => `price:${mint}`,
  tokenInfo: (mint: string) => `token_info:${mint}`,
  topTokens: () => "top_tokens",
} as const;

export const CHANNELS = {
  priceUpdate: "price:update",
  portfolioUpdate: (userId: string) => `portfolio:${userId}`,
  tradeExecuted: (userId: string) => `trade:${userId}`,
} as const;
