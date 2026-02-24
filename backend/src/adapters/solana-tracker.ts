import { config } from "../config";
import { redis, CACHE_KEYS } from "../lib/redis";
import type {
  MarketDataAdapter,
  TokenSearchResult,
  TokenInfo,
  OHLCVBar,
  ChartRange,
  TokenTrade,
  TokenFilterParams,
  FilteredTokenItem,
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

  async getTokenTrades(mint: string): Promise<TokenTrade[]> {
    const cacheKey = `trades:${mint}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as TokenTrade[];

    try {
      const data = await fetchApi<{
        trades?: Array<{
          tx?: string;
          type?: string;
          amount?: number;
          volume?: number;
          volumeSol?: number;
          priceUsd?: number;
          wallet?: string;
          time?: number;
        }>;
      }>(`trades/${mint}`);

      const trades: TokenTrade[] = (data.trades || []).slice(0, 50).map((t) => ({
        tx: t.tx || "",
        type: (t.type === "buy" ? "buy" : "sell") as "buy" | "sell",
        amountUsd: t.volume || 0,
        volumeSol: t.volumeSol || 0,
        priceUsd: t.priceUsd || 0,
        marketCap: 0,
        wallet: t.wallet || "",
        time: t.time || 0,
      }));

      await redis.set(cacheKey, JSON.stringify(trades), "EX", 5);
      return trades;
    } catch {
      return [];
    }
  }

  async getGraduatingTokens(limit: number): Promise<TokenInfo[]> {
    const cacheKey = "market:graduating";
    const cached = await redis.get(cacheKey);
    if (cached) return (JSON.parse(cached) as TokenInfo[]).slice(0, limit);

    try {
      const data = await fetchApi<Array<{
        token?: { mint?: string; symbol?: string; name?: string; decimals?: number; image?: string };
        pools?: Array<{
          price?: { usd?: number };
          liquidity?: { usd?: number };
          marketCap?: { usd?: number };
          volume?: { h24?: number };
        }>;
      }>>("tokens/multi/graduating");

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

      await redis.set(cacheKey, JSON.stringify(tokens), "EX", 15);
      return tokens;
    } catch {
      return [];
    }
  }

  async getGraduatedTokens(limit: number): Promise<TokenInfo[]> {
    const cacheKey = "market:graduated";
    const cached = await redis.get(cacheKey);
    if (cached) return (JSON.parse(cached) as TokenInfo[]).slice(0, limit);

    try {
      const data = await fetchApi<Array<{
        token?: { mint?: string; symbol?: string; name?: string; decimals?: number; image?: string };
        pools?: Array<{
          price?: { usd?: number };
          liquidity?: { usd?: number };
          marketCap?: { usd?: number };
          volume?: { h24?: number };
        }>;
      }>>("tokens/multi/graduated");

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

      await redis.set(cacheKey, JSON.stringify(tokens), "EX", 15);
      return tokens;
    } catch {
      return [];
    }
  }

  async getFilteredTokens(filters: TokenFilterParams): Promise<FilteredTokenItem[]> {
    const params: Record<string, string> = {
      limit: String(filters.limit || 30),
      sortBy: filters.sortBy || "createdAt",
      sortOrder: filters.sortOrder || "desc",
    };

    if (filters.status) params.status = filters.status;
    if (filters.minLiquidity !== undefined) params.minLiquidity = String(filters.minLiquidity);
    if (filters.maxLiquidity !== undefined) params.maxLiquidity = String(filters.maxLiquidity);
    if (filters.minMarketCap !== undefined) params.minMarketCap = String(filters.minMarketCap);
    if (filters.maxMarketCap !== undefined) params.maxMarketCap = String(filters.maxMarketCap);
    if (filters.minVolume !== undefined) params.minVolume = String(filters.minVolume);
    if (filters.maxVolume !== undefined) params.maxVolume = String(filters.maxVolume);
    if (filters.volumeTimeframe) params.volumeTimeframe = filters.volumeTimeframe;
    if (filters.minBuys !== undefined) params.minBuys = String(filters.minBuys);
    if (filters.maxBuys !== undefined) params.maxBuys = String(filters.maxBuys);
    if (filters.minSells !== undefined) params.minSells = String(filters.minSells);
    if (filters.maxSells !== undefined) params.maxSells = String(filters.maxSells);
    if (filters.minTotalTransactions !== undefined) params.minTotalTransactions = String(filters.minTotalTransactions);
    if (filters.maxTotalTransactions !== undefined) params.maxTotalTransactions = String(filters.maxTotalTransactions);
    if (filters.minHolders !== undefined) params.minHolders = String(filters.minHolders);
    if (filters.maxHolders !== undefined) params.maxHolders = String(filters.maxHolders);
    if (filters.minCurvePercentage !== undefined) params.minCurvePercentage = String(filters.minCurvePercentage);
    if (filters.maxCurvePercentage !== undefined) params.maxCurvePercentage = String(filters.maxCurvePercentage);
    if (filters.minFeesTotal !== undefined) params.minFeesTotal = String(filters.minFeesTotal);
    if (filters.maxFeesTotal !== undefined) params.maxFeesTotal = String(filters.maxFeesTotal);
    if (filters.minCreatedAt !== undefined) params.minCreatedAt = String(filters.minCreatedAt);
    if (filters.maxCreatedAt !== undefined) params.maxCreatedAt = String(filters.maxCreatedAt);

    try {
      const data = await fetchApi<{
        status?: string;
        data?: Array<{
          mint?: string;
          symbol?: string;
          name?: string;
          image?: string;
          priceUsd?: number;
          marketCapUsd?: number;
          liquidityUsd?: number;
          volume_24h?: number;
          volume?: number;
          buys?: number;
          sells?: number;
          totalTransactions?: number;
          holders?: number;
          launchpad?: { curvePercentage?: number };
          fees?: { total?: number };
          createdAt?: number;
        }>;
      }>("search", params);

      const items = data.data || (Array.isArray(data) ? data as unknown[] : []);
      return (items as Array<{
        mint?: string;
        symbol?: string;
        name?: string;
        image?: string;
        priceUsd?: number;
        marketCapUsd?: number;
        liquidityUsd?: number;
        volume_24h?: number;
        volume?: number;
        buys?: number;
        sells?: number;
        totalTransactions?: number;
        holders?: number;
        launchpad?: { curvePercentage?: number };
        fees?: { total?: number };
        createdAt?: number;
      }>)
        .filter((item) => item.mint && item.symbol)
        .map((item) => ({
          mint: item.mint || "",
          symbol: item.symbol || "",
          name: item.name || "",
          image: item.image,
          price: item.priceUsd || 0,
          marketCap: item.marketCapUsd || 0,
          liquidity: item.liquidityUsd || 0,
          volume24h: item.volume_24h || item.volume || 0,
          buys: item.buys || 0,
          sells: item.sells || 0,
          totalTransactions: item.totalTransactions || 0,
          holders: item.holders || 0,
          curvePercentage: item.launchpad?.curvePercentage,
          feesTotal: item.fees?.total,
          createdAt: item.createdAt,
        }));
    } catch {
      return [];
    }
  }
}
