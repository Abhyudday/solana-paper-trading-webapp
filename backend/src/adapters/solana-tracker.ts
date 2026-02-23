import { config } from "../config";
import { redis, CACHE_KEYS } from "../lib/redis";
import type {
  MarketDataAdapter,
  TokenSearchResult,
  TokenInfo,
  OHLCVBar,
  ChartRange,
} from "./market-data";

const CACHE_TTL_PRICE = 15; // seconds
const CACHE_TTL_INFO = 300;
const CACHE_TTL_TOP = 60;

async function fetchApi<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, config.SOLANA_TRACKER_BASE_URL);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const res = await fetch(url.toString(), {
    headers: {
      "x-api-key": config.SOLANA_TRACKER_API_KEY,
      Accept: "application/json",
    },
    signal: controller.signal,
  });
  clearTimeout(timeout);
  if (!res.ok) {
    throw new Error(`SolanaTracker API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function rangeToSeconds(range: ChartRange): number {
  switch (range) {
    case "1d": return 86400;
    case "7d": return 604800;
    case "30d": return 2592000;
  }
}

export class SolanaTrackerAdapter implements MarketDataAdapter {
  async searchTokens(query: string): Promise<TokenSearchResult[]> {
    const data = await fetchApi<Array<{
      mint?: string;
      address?: string;
      token?: { mint?: string; symbol?: string; name?: string; image?: string };
      symbol?: string;
      name?: string;
      image?: string;
      pools?: Array<{ price?: { usd?: number }; marketCap?: { usd?: number } }>;
    }>>("/search", { query });

    const items = Array.isArray(data) ? data : [];
    return items
      .map((item) => ({
        mint: item.token?.mint || item.mint || item.address || "",
        symbol: item.token?.symbol || item.symbol || "",
        name: item.token?.name || item.name || "",
        image: item.token?.image || item.image,
        price: item.pools?.[0]?.price?.usd,
        marketCap: item.pools?.[0]?.marketCap?.usd,
      }))
      .filter((r) => r.mint.length >= 32)
      .slice(0, 10);
  }

  async getTokenInfo(mint: string): Promise<TokenInfo | null> {
    const cached = await redis.get(CACHE_KEYS.tokenInfo(mint));
    if (cached) return JSON.parse(cached);

    try {
      const data = await fetchApi<{
        token?: { mint?: string; symbol?: string; name?: string; decimals?: number; image?: string };
        pools?: Array<{
          price?: { usd?: number };
          liquidity?: { usd?: number };
          marketCap?: { usd?: number };
          volume?: { h24?: number };
        }>;
        supply?: number;
      }>(`/tokens/${mint}`);

      const pool = data.pools?.[0];
      const info: TokenInfo = {
        mint: data.token?.mint || mint,
        symbol: data.token?.symbol || "",
        name: data.token?.name || "",
        decimals: data.token?.decimals || 9,
        supply: data.supply || 0,
        liquidity: pool?.liquidity?.usd || 0,
        price: pool?.price?.usd || 0,
        marketCap: pool?.marketCap?.usd || 0,
        image: data.token?.image,
        volume24h: pool?.volume?.h24 || 0,
      };

      await redis.set(CACHE_KEYS.tokenInfo(mint), JSON.stringify(info), "EX", CACHE_TTL_INFO);
      await redis.set(CACHE_KEYS.tokenPrice(mint), String(info.price), "EX", CACHE_TTL_PRICE);

      return info;
    } catch {
      return null;
    }
  }

  async getOHLCV(mint: string, range: ChartRange): Promise<OHLCVBar[]> {
    const now = Math.floor(Date.now() / 1000);
    const from = now - rangeToSeconds(range);
    const interval = range === "1d" ? "1m" : range === "7d" ? "15m" : "1h";

    const data = await fetchApi<{
      oclhv?: Array<{
        time?: number;
        unixTime?: number;
        open?: number;
        close?: number;
        low?: number;
        high?: number;
        volume?: number;
      }>;
    }>(`/chart/${mint}`, {
      type: interval,
      time_from: String(from),
      time_to: String(now),
    });

    const bars = data.oclhv || [];
    return bars.map((b) => ({
      time: b.time || b.unixTime || 0,
      open: b.open || 0,
      high: b.high || 0,
      low: b.low || 0,
      close: b.close || 0,
      volume: b.volume || 0,
    }));
  }

  async getTopTokens(limit: number): Promise<TokenInfo[]> {
    const cached = await redis.get(CACHE_KEYS.topTokens());
    if (cached) {
      const parsed = JSON.parse(cached) as TokenInfo[];
      return parsed.slice(0, limit);
    }

    try {
      const data = await fetchApi<Array<{
        token?: { mint?: string; symbol?: string; name?: string; decimals?: number; image?: string };
        pools?: Array<{
          price?: { usd?: number };
          liquidity?: { usd?: number };
          marketCap?: { usd?: number };
          volume?: { h24?: number };
        }>;
      }>>("tokens/volume");

      const items = Array.isArray(data) ? data : [];
      const tokens: TokenInfo[] = items
        .filter((item) => item.token?.mint && item.token?.symbol)
        .slice(0, limit)
        .map((item) => {
          const pool = item.pools?.[0];
          return {
            mint: item.token?.mint || "",
            symbol: item.token?.symbol || "",
            name: item.token?.name || "",
            decimals: item.token?.decimals || 9,
            supply: 0,
            liquidity: pool?.liquidity?.usd || 0,
            price: pool?.price?.usd || 0,
            marketCap: pool?.marketCap?.usd || 0,
            image: item.token?.image,
            volume24h: pool?.volume?.h24 || 0,
          };
        });

      await redis.set(CACHE_KEYS.topTokens(), JSON.stringify(tokens), "EX", CACHE_TTL_TOP);
      return tokens;
    } catch {
      return [];
    }
  }

  async getLatestTokens(limit: number): Promise<TokenInfo[]> {
    const cacheKey = "market:latest";
    const cached = await redis.get(cacheKey);
    if (cached) {
      return (JSON.parse(cached) as TokenInfo[]).slice(0, limit);
    }

    try {
      const data = await fetchApi<Array<{
        token?: { mint?: string; symbol?: string; name?: string; decimals?: number; image?: string };
        pools?: Array<{
          price?: { usd?: number };
          liquidity?: { usd?: number };
          marketCap?: { usd?: number };
          volume?: { h24?: number };
        }>;
      }>>("tokens/latest");

      const items = Array.isArray(data) ? data : [];
      const tokens: TokenInfo[] = items
        .filter((item) => item.token?.mint && item.token?.symbol)
        .slice(0, limit)
        .map((item) => {
          const pool = item.pools?.[0];
          return {
            mint: item.token?.mint || "",
            symbol: item.token?.symbol || "",
            name: item.token?.name || "",
            decimals: item.token?.decimals || 9,
            supply: 0,
            liquidity: pool?.liquidity?.usd || 0,
            price: pool?.price?.usd || 0,
            marketCap: pool?.marketCap?.usd || 0,
            image: item.token?.image,
            volume24h: pool?.volume?.h24 || 0,
          };
        });

      await redis.set(cacheKey, JSON.stringify(tokens), "EX", 30);
      return tokens;
    } catch {
      return [];
    }
  }

  async getTrendingTokens(limit: number): Promise<TokenInfo[]> {
    const cacheKey = "market:trending";
    const cached = await redis.get(cacheKey);
    if (cached) {
      return (JSON.parse(cached) as TokenInfo[]).slice(0, limit);
    }

    try {
      const data = await fetchApi<Array<{
        token?: { mint?: string; symbol?: string; name?: string; decimals?: number; image?: string };
        pools?: Array<{
          price?: { usd?: number };
          liquidity?: { usd?: number };
          marketCap?: { usd?: number };
          volume?: { h24?: number };
        }>;
      }>>("tokens/trending");

      const items = Array.isArray(data) ? data : [];
      const tokens: TokenInfo[] = items
        .filter((item) => item.token?.mint && item.token?.symbol)
        .slice(0, limit)
        .map((item) => {
          const pool = item.pools?.[0];
          return {
            mint: item.token?.mint || "",
            symbol: item.token?.symbol || "",
            name: item.token?.name || "",
            decimals: item.token?.decimals || 9,
            supply: 0,
            liquidity: pool?.liquidity?.usd || 0,
            price: pool?.price?.usd || 0,
            marketCap: pool?.marketCap?.usd || 0,
            image: item.token?.image,
            volume24h: pool?.volume?.h24 || 0,
          };
        });

      await redis.set(cacheKey, JSON.stringify(tokens), "EX", 30);
      return tokens;
    } catch {
      return [];
    }
  }
}
