import Redis from "ioredis";
import { config } from "../config";

export const redis = new Redis(config.REDIS_URL);
export const redisSub = new Redis(config.REDIS_URL);
export const redisPub = new Redis(config.REDIS_URL);

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
