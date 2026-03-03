import { config } from "../config";
import { safeGet, safeSet, CACHE_KEYS } from "../lib/redis";
import { memCache } from "../lib/mem-cache";
import type {
  MarketDataAdapter,
  TokenSearchResult,
  TokenInfo,
  OHLCVBar,
  ChartRange,
  TokenTrade,
  TokenFilterParams,
  FilteredTokenItem,
  TokenHolderInfo,
  TokenHolder,
  BundleInfo,
  BundleDetail,
  SniperInfo,
  SniperWallet,
  WalletType,
} from "./market-data";

// Known wallet labels (DEXes, CEXes, contracts)
const KNOWN_WALLETS: Record<string, { type: WalletType; label: string }> = {
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1": { type: "dex", label: "Raydium Authority" },
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": { type: "dex", label: "Raydium AMM" },
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": { type: "dex", label: "Jupiter v6" },
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc": { type: "dex", label: "Orca Whirlpool" },
  "TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hAsbdwmHbN": { type: "dex", label: "Tensor Swap" },
  "GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp": { type: "cex", label: "Coinbase" },
  // Liquidity pool wallets
  "39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg": { type: "liquidity_pool", label: "Raydium LP" },
  "7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eSTaEroHBjLiQ": { type: "liquidity_pool", label: "Meteora LP" },
  "FRhB8L7Y9Qq41qZXYLtC2nw8An1RJfLLMjAxrnT1DDh1": { type: "liquidity_pool", label: "Raydium CLMM" },
  "3XXuUFfweXBwFgFfYaejLvZE4cGZiHgKiGfMtdxNzYmv": { type: "liquidity_pool", label: "Raydium CPMM" },
};

function classifyWallet(address: string, percentage: number, isInsider?: boolean): { type: WalletType; label?: string } {
  const known = KNOWN_WALLETS[address];
  if (known) return known;
  if (isInsider) return { type: "team", label: "Insider" };
  // Large holders (>40%) that aren't known wallets are likely liquidity pools
  if (percentage >= 40) return { type: "liquidity_pool", label: "Liquidity Pool" };
  if (percentage >= 5) return { type: "whale" };
  return { type: "unknown" };
}

function calculateRiskScore(bundled: boolean, bundlePercentage: number, bundleCount: number, sniperPercentage: number): { score: number; level: "low" | "medium" | "high" | "critical" } {
  let score = 0;
  if (bundled) score += 20;
  score += Math.min(bundlePercentage * 1.5, 40);
  score += Math.min(bundleCount * 3, 15);
  score += Math.min(sniperPercentage * 2, 25);
  score = Math.min(Math.round(score), 100);
  const level = score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : "low";
  return { score, level };
}

const CACHE_TTL_PRICE = 5; // seconds
const CACHE_TTL_INFO = 300;
const CACHE_TTL_TOP = 30;
const CACHE_TTL_CHART = 5;

async function fetchApi<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, config.SOLANA_TRACKER_BASE_URL);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
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
    case "1s": return 300;       // 5 min window for 1s candles
    case "5s": return 900;       // 15 min window
    case "15s": return 1800;     // 30 min window
    case "30s": return 3600;     // 1h window
    case "1m": return 3600;      // 1h window
    case "5m": return 14400;     // 4h window
    case "15m": return 43200;    // 12h window
    case "30m": return 86400;    // 24h window
    case "1h": return 172800;    // 48h window
    case "6h": return 604800;    // 7d window
    case "1d": return 2592000;   // 30d window
    case "7d": return 7776000;   // 90d window
    case "30d": return 31536000; // 365d window
  }
}

function rangeToInterval(range: ChartRange): string {
  switch (range) {
    case "1s": return "1s";
    case "5s": return "5s";
    case "15s": return "15s";
    case "30s": return "30s";
    case "1m": return "1m";
    case "5m": return "5m";
    case "15m": return "15m";
    case "30m": return "30m";
    case "1h": return "1h";
    case "6h": return "6h";
    case "1d": return "1h";
    case "7d": return "4h";
    case "30d": return "1d";
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
    const memHit = memCache.get<TokenInfo>(`ti:${mint}`);
    if (memHit) return memHit;

    const cached = await safeGet(CACHE_KEYS.tokenInfo(mint));
    if (cached) {
      const parsed = JSON.parse(cached);
      memCache.set(`ti:${mint}`, parsed, 15);
      return parsed;
    }

    try {
      const data = await fetchApi<{
        token?: {
          mint?: string; symbol?: string; name?: string; decimals?: number; image?: string;
          twitter?: string; telegram?: string; website?: string; discord?: string;
        };
        pools?: Array<{
          price?: { usd?: number };
          liquidity?: { usd?: number };
          marketCap?: { usd?: number };
          volume?: { h24?: number };
        }>;
        supply?: number;
      }>(`/tokens/${mint}`);

      const pool = data.pools?.[0];
      const socials: Record<string, string> = {};
      if (data.token?.twitter) socials.twitter = data.token.twitter;
      if (data.token?.telegram) socials.telegram = data.token.telegram;
      if (data.token?.website) socials.website = data.token.website;
      if (data.token?.discord) socials.discord = data.token.discord;

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
        socials: Object.keys(socials).length > 0 ? socials : undefined,
      };

      memCache.set(`ti:${mint}`, info, 15);
      await safeSet(CACHE_KEYS.tokenInfo(mint), JSON.stringify(info), "EX", CACHE_TTL_INFO);
      await safeSet(CACHE_KEYS.tokenPrice(mint), String(info.price), "EX", CACHE_TTL_PRICE);

      return info;
    } catch {
      return null;
    }
  }

  async getOHLCV(mint: string, range: ChartRange): Promise<OHLCVBar[]> {
    const cacheKey = `chart:${mint}:${range}`;
    const isUltraShort = ["1s", "5s", "15s"].includes(range);
    const isShortRange = ["30s", "1m"].includes(range);
    const memTtl = isUltraShort ? 0 : isShortRange ? 1 : 8;
    const redisTtl = isUltraShort ? 1 : isShortRange ? 3 : CACHE_TTL_CHART;

    // Skip memCache for ultra-short to always get freshest from Redis/API
    if (!isUltraShort) {
      const memHit = memCache.get<OHLCVBar[]>(cacheKey);
      if (memHit) return memHit;
    }

    const cached = await safeGet(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as OHLCVBar[];
      if (memTtl > 0) memCache.set(cacheKey, parsed, memTtl);
      return parsed;
    }

    const now = Math.floor(Date.now() / 1000);
    const from = now - rangeToSeconds(range);
    const interval = rangeToInterval(range);

    try {
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

      const bars = (data.oclhv || []).map((b) => ({
        time: b.time || b.unixTime || 0,
        open: b.open || 0,
        high: b.high || 0,
        low: b.low || 0,
        close: b.close || 0,
        volume: b.volume || 0,
      }));

      if (memTtl > 0) memCache.set(cacheKey, bars, memTtl);
      await safeSet(cacheKey, JSON.stringify(bars), "EX", redisTtl);
      return bars;
    } catch {
      return [];
    }
  }

  async getTopTokens(limit: number): Promise<TokenInfo[]> {
    const memHit = memCache.get<TokenInfo[]>("market:top");
    if (memHit) return memHit.slice(0, limit);

    const cached = await safeGet(CACHE_KEYS.topTokens());
    if (cached) {
      const parsed = JSON.parse(cached) as TokenInfo[];
      memCache.set("market:top", parsed, 10);
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

      memCache.set("market:top", tokens, 10);
      await safeSet(CACHE_KEYS.topTokens(), JSON.stringify(tokens), "EX", CACHE_TTL_TOP);
      return tokens;
    } catch {
      return [];
    }
  }

  async getLatestTokens(limit: number): Promise<TokenInfo[]> {
    const cacheKey = "market:latest";
    const memHit = memCache.get<TokenInfo[]>(cacheKey);
    if (memHit) return memHit.slice(0, limit);

    const cached = await safeGet(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as TokenInfo[];
      memCache.set(cacheKey, parsed, 5);
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

      memCache.set(cacheKey, tokens, 5);
      await safeSet(cacheKey, JSON.stringify(tokens), "EX", 30);
      return tokens;
    } catch {
      const stale = await safeGet(cacheKey);
      if (stale) return (JSON.parse(stale) as TokenInfo[]).slice(0, limit);
      return [];
    }
  }

  async getTrendingTokens(limit: number): Promise<TokenInfo[]> {
    const cacheKey = "market:trending";
    const memHit = memCache.get<TokenInfo[]>(cacheKey);
    if (memHit) return memHit.slice(0, limit);

    const cached = await safeGet(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as TokenInfo[];
      memCache.set(cacheKey, parsed, 5);
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

      memCache.set(cacheKey, tokens, 5);
      await safeSet(cacheKey, JSON.stringify(tokens), "EX", 30);
      return tokens;
    } catch {
      const stale = await safeGet(cacheKey);
      if (stale) return (JSON.parse(stale) as TokenInfo[]).slice(0, limit);
      return [];
    }
  }

  async getTokenTrades(mint: string): Promise<TokenTrade[]> {
    const cacheKey = `trades:${mint}`;
    const memHit = memCache.get<TokenTrade[]>(cacheKey);
    if (memHit) return memHit;

    const cached = await safeGet(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as TokenTrade[];
      memCache.set(cacheKey, parsed, 10);
      return parsed;
    }

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

      memCache.set(cacheKey, trades, 10);
      await safeSet(cacheKey, JSON.stringify(trades), "EX", 15);
      return trades;
    } catch {
      return [];
    }
  }

  async getGraduatingTokens(limit: number): Promise<TokenInfo[]> {
    const cacheKey = "market:graduating";
    const memHit = memCache.get<TokenInfo[]>(cacheKey);
    if (memHit) return memHit.slice(0, limit);

    const cached = await safeGet(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as TokenInfo[];
      memCache.set(cacheKey, parsed, 5);
      return parsed.slice(0, limit);
    }

    // Strategy: try tokens/multi/graduating first, then fall back to search endpoint
    let tokens: TokenInfo[] = [];

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
      tokens = items
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
      // Sort by market cap descending — tokens closest to graduation threshold appear first
      tokens.sort((a, b) => b.marketCap - a.marketCap);
    } catch {
      // tokens/multi/graduating not available, fall back to search endpoint
    }

    // Fallback: use search endpoint with status=graduating
    if (tokens.length === 0) {
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
          }>;
        }>("search", {
          status: "graduating",
          sortBy: "marketCap",
          sortOrder: "desc",
          limit: String(limit),
        });

        const items = data.data || (Array.isArray(data) ? (data as unknown[]) : []);
        tokens = (items as Array<{
          mint?: string;
          symbol?: string;
          name?: string;
          image?: string;
          priceUsd?: number;
          marketCapUsd?: number;
          liquidityUsd?: number;
          volume_24h?: number;
          volume?: number;
        }>)
          .filter((item) => item.mint && item.symbol)
          .slice(0, limit)
          .map((item) => ({
            mint: item.mint || "",
            symbol: item.symbol || "",
            name: item.name || "",
            decimals: 9,
            supply: 0,
            liquidity: item.liquidityUsd || 0,
            price: item.priceUsd || 0,
            marketCap: item.marketCapUsd || 0,
            image: item.image,
            volume24h: item.volume_24h || item.volume || 0,
          }));
      } catch {
        // search fallback also failed
      }
    }

    // Final fallback: use filtered endpoint with graduating status
    if (tokens.length === 0) {
      try {
        const filtered = await this.getFilteredTokens({
          status: "graduating",
          sortBy: "marketCap",
          sortOrder: "desc",
          limit,
        });
        tokens = filtered.map((item) => ({
          mint: item.mint,
          symbol: item.symbol,
          name: item.name,
          decimals: 9,
          supply: 0,
          liquidity: item.liquidity,
          price: item.price,
          marketCap: item.marketCap,
          image: item.image,
          volume24h: item.volume24h,
        }));
      } catch {
        // all methods failed
      }
    }

    if (tokens.length > 0) {
      memCache.set(cacheKey, tokens, 5);
      await safeSet(cacheKey, JSON.stringify(tokens), "EX", 15);
    } else {
      const stale = await safeGet(cacheKey);
      if (stale) return (JSON.parse(stale) as TokenInfo[]).slice(0, limit);
    }
    return tokens;
  }

  async getGraduatedTokens(limit: number): Promise<TokenInfo[]> {
    const cacheKey = "market:graduated";
    const memHit = memCache.get<TokenInfo[]>(cacheKey);
    if (memHit) return memHit.slice(0, limit);

    const cached = await safeGet(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as TokenInfo[];
      memCache.set(cacheKey, parsed, 5);
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

      if (tokens.length > 0) {
        memCache.set(cacheKey, tokens, 5);
        await safeSet(cacheKey, JSON.stringify(tokens), "EX", 30);
      }
      return tokens;
    } catch {
      const stale = await safeGet(cacheKey);
      if (stale) return (JSON.parse(stale) as TokenInfo[]).slice(0, limit);
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

  async getTokenHolders(mint: string): Promise<TokenHolderInfo> {
    const cacheKey = `holders:${mint}`;
    const memHit = memCache.get<TokenHolderInfo>(cacheKey);
    if (memHit) return memHit;

    const cached = await safeGet(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as TokenHolderInfo;
      memCache.set(cacheKey, parsed, 30);
      return parsed;
    }

    try {
      const data = await fetchApi<{
        total?: number;
        accounts?: Array<{
          owner?: string;
          balance?: number;
          percentage?: number;
          insider?: boolean;
        }>;
      }>(`tokens/${mint}/holders`);

      const accounts = data.accounts || [];
      const topHolders: TokenHolder[] = accounts
        .slice(0, 20)
        .map((a) => {
          const addr = a.owner || "";
          const pct = a.percentage || 0;
          const classification = classifyWallet(addr, pct, a.insider);
          return {
            address: addr,
            amount: a.balance || 0,
            percentage: pct,
            isInsider: a.insider,
            walletType: classification.type,
            label: classification.label,
          };
        });

      const top10Pct = topHolders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0);
      const top20Pct = topHolders.reduce((sum, h) => sum + h.percentage, 0);

      const result: TokenHolderInfo = {
        totalHolders: data.total || accounts.length,
        topHolders,
        top10Pct,
        top20Pct,
      };

      memCache.set(cacheKey, result, 30);
      await safeSet(cacheKey, JSON.stringify(result), "EX", 60);
      return result;
    } catch {
      return { totalHolders: 0, topHolders: [], top10Pct: 0, top20Pct: 0 };
    }
  }

  async getTokenBundles(mint: string): Promise<BundleInfo> {
    const cacheKey = `bundles:${mint}`;
    const memHit = memCache.get<BundleInfo>(cacheKey);
    if (memHit) return memHit;

    const cached = await safeGet(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as BundleInfo;
      memCache.set(cacheKey, parsed, 60);
      return parsed;
    }

    try {
      const data = await fetchApi<{
        total?: number;
        balance?: number;
        percentage?: number;
        initialBalance?: number;
        initialPercentage?: number;
        wallets?: Array<{
          wallet?: string;
          balance?: number;
          percentage?: number;
          initialBalance?: number;
          initialPercentage?: number;
          bundleTime?: number;
        }>;
      }>(`/tokens/${mint}/bundlers`);

      const details: BundleDetail[] = (data.wallets || []).map((w) => ({
        wallet: w.wallet || "",
        balance: w.balance || 0,
        percentage: w.percentage || 0,
        initialBalance: w.initialBalance || 0,
        initialPercentage: w.initialPercentage || 0,
        bundleTime: w.bundleTime || 0,
      }));

      const bundleCount = data.total || 0;
      const bundlePercentage = data.percentage || 0;
      const initialPercentage = data.initialPercentage || 0;
      const bundled = bundleCount > 0;

      // Fetch sniper info to include in bundle analysis
      let sniperInfo: SniperInfo | undefined;
      try {
        sniperInfo = await this.getTokenSnipers(mint);
      } catch {
        // sniper info is optional
      }

      // Risk uses the higher of current or initial percentage (conservative)
      const sniperPct = sniperInfo?.sniperPercentage || 0;
      const riskPct = Math.max(bundlePercentage, initialPercentage);
      const { score, level } = calculateRiskScore(bundled, riskPct, bundleCount, sniperPct);

      const result: BundleInfo = {
        bundled,
        bundleCount,
        bundlePercentage,
        initialPercentage,
        totalBalance: data.balance || 0,
        initialBalance: data.initialBalance || 0,
        riskScore: score,
        riskLevel: level,
        details,
        sniperInfo,
      };

      memCache.set(cacheKey, result, 60);
      await safeSet(cacheKey, JSON.stringify(result), "EX", 120);
      return result;
    } catch {
      return { bundled: false, bundleCount: 0, bundlePercentage: 0, initialPercentage: 0, totalBalance: 0, initialBalance: 0, riskScore: 0, riskLevel: "low", details: [] };
    }
  }

  async getTokenSnipers(mint: string): Promise<SniperInfo> {
    const cacheKey = `snipers:${mint}`;
    const memHit = memCache.get<SniperInfo>(cacheKey);
    if (memHit) return memHit;

    const cached = await safeGet(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as SniperInfo;
      memCache.set(cacheKey, parsed, 60);
      return parsed;
    }

    try {
      // Use early trades data to detect snipers
      // Snipers are wallets that bought in the first few seconds/blocks
      const tradesData = await fetchApi<{
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

      const allTrades = tradesData.trades || [];
      const buyTrades = allTrades.filter((t) => t.type === "buy" && t.time && t.time > 0);

      if (buyTrades.length === 0) {
        const empty: SniperInfo = { hasSnipers: false, sniperCount: 0, sniperPercentage: 0, snipers: [] };
        memCache.set(cacheKey, empty, 60);
        await safeSet(cacheKey, JSON.stringify(empty), "EX", 120);
        return empty;
      }

      // Sort by time, find earliest trade
      buyTrades.sort((a, b) => (a.time || 0) - (b.time || 0));
      const earliestTime = buyTrades[0].time || 0;

      // Snipers = wallets that bought within first 60 seconds
      const SNIPER_WINDOW_SECONDS = 60;
      const sniperTrades = buyTrades.filter(
        (t) => (t.time || 0) - earliestTime <= SNIPER_WINDOW_SECONDS
      );

      // Aggregate by wallet
      const walletMap = new Map<string, { totalUsd: number; firstTime: number; tx: string }>();
      for (const t of sniperTrades) {
        const w = t.wallet || "";
        if (!w) continue;
        const existing = walletMap.get(w);
        if (existing) {
          existing.totalUsd += t.volume || 0;
        } else {
          walletMap.set(w, {
            totalUsd: t.volume || 0,
            firstTime: t.time || 0,
            tx: t.tx || "",
          });
        }
      }

      // Get holder data to estimate percentage
      let holderMap = new Map<string, number>();
      try {
        const holders = await this.getTokenHolders(mint);
        for (const h of holders.topHolders) {
          holderMap.set(h.address, h.percentage);
        }
      } catch {}

      const snipers: SniperWallet[] = [];
      let totalSniperPct = 0;
      for (const [addr, data] of walletMap.entries()) {
        const pct = holderMap.get(addr) || 0;
        totalSniperPct += pct;
        snipers.push({
          address: addr,
          buyTime: data.firstTime,
          blockOffset: Math.round((data.firstTime - earliestTime)),
          amountUsd: data.totalUsd,
          percentage: pct,
          tx: data.tx,
        });
      }

      // Sort by amount descending
      snipers.sort((a, b) => b.amountUsd - a.amountUsd);

      const result: SniperInfo = {
        hasSnipers: snipers.length > 0,
        sniperCount: snipers.length,
        sniperPercentage: totalSniperPct,
        snipers: snipers.slice(0, 20),
      };

      memCache.set(cacheKey, result, 60);
      await safeSet(cacheKey, JSON.stringify(result), "EX", 120);
      return result;
    } catch {
      return { hasSnipers: false, sniperCount: 0, sniperPercentage: 0, snipers: [] };
    }
  }
}
