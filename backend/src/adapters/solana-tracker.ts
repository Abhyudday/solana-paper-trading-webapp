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
} from "./market-data";

const CACHE_TTL_PRICE = 15; // seconds
const CACHE_TTL_INFO = 300;
const CACHE_TTL_TOP = 60;
const CACHE_TTL_CHART = 30;

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
    const memHit = memCache.get<OHLCVBar[]>(cacheKey);
    if (memHit) return memHit;

    const cached = await safeGet(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as OHLCVBar[];
      memCache.set(cacheKey, parsed, 15);
      return parsed;
    }

    const now = Math.floor(Date.now() / 1000);
    const from = now - rangeToSeconds(range);
    const interval = rangeToInterval(range);
    // Shorter cache for sub-minute timeframes
    const isShortRange = ["1s", "5s", "15s", "30s", "1m"].includes(range);
    const chartCacheTtl = isShortRange ? 5 : CACHE_TTL_CHART;

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

      memCache.set(cacheKey, bars, isShortRange ? 3 : 15);
      await safeSet(cacheKey, JSON.stringify(bars), "EX", chartCacheTtl);
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
        .map((a) => ({
          address: a.owner || "",
          amount: a.balance || 0,
          percentage: a.percentage || 0,
          isInsider: a.insider,
        }));

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
        bundled?: boolean;
        bundles?: Array<{
          wallet?: string;
          amount?: number;
          percentage?: number;
          tx?: string;
        }>;
      }>(`tokens/${mint}/bundles`);

      const details = (data.bundles || []).map((b) => ({
        wallet: b.wallet || "",
        amount: b.amount || 0,
        percentage: b.percentage || 0,
        tx: b.tx || "",
      }));

      const result: BundleInfo = {
        bundled: data.bundled || details.length > 0,
        bundleCount: details.length,
        bundlePercentage: details.reduce((sum, d) => sum + d.percentage, 0),
        details,
      };

      memCache.set(cacheKey, result, 60);
      await safeSet(cacheKey, JSON.stringify(result), "EX", 120);
      return result;
    } catch {
      return { bundled: false, bundleCount: 0, bundlePercentage: 0, details: [] };
    }
  }
}
