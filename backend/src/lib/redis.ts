import Redis from "ioredis";
import { config } from "../config";

function isValidRedisUrl(url: string): boolean {
  if (!url) return false;
  if (url.includes("auto-set") || url.includes("placeholder")) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

const redisUrl = config.REDIS_URL;
const redisAvailable = isValidRedisUrl(redisUrl);

// Log sanitized URL for debugging (mask password)
try {
  const u = new URL(redisUrl);
  if (u.password) u.password = "****";
  console.log(`Redis URL: ${u.toString()} (available: ${redisAvailable})`);
} catch {
  console.log(`Redis URL: ${redisUrl} (available: ${redisAvailable})`);
}

function createRedisClient(label: string): Redis {
  if (!redisAvailable) {
    console.warn(`[${label}] Redis not configured, creating offline client`);
    const client = new Redis({ lazyConnect: true, enableOfflineQueue: false });
    client.on("error", () => {}); // suppress errors
    return client;
  }

  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) return null; // stop retrying after 5 attempts
      return Math.min(times * 500, 3000);
    },
    reconnectOnError(err) {
      // Do NOT reconnect on auth errors — it will just loop forever
      if (err.message.includes("NOAUTH")) return false;
      return true;
    },
    lazyConnect: true,
    enableReadyCheck: false,
  });

  client.on("error", (err) => {
    if (err.message.includes("NOAUTH")) {
      console.error(`[${label}] Redis NOAUTH — password missing or wrong in REDIS_URL. Disconnecting.`);
      client.disconnect();
      return;
    }
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
    // Quick ping to verify auth works
    await redis.ping();
    redisConnected = true;
    console.log("All Redis clients connected and authenticated successfully");
    return true;
  } catch (err: any) {
    console.error("Failed to connect to Redis:", err.message);
    console.warn("Continuing without Redis. Caching and pub/sub are disabled.");
    // Disconnect all clients to stop retry loops
    redis.disconnect();
    redisSub.disconnect();
    redisPub.disconnect();
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
