function getBaseUrl(): string {
  // Build-time env var (set via NEXT_PUBLIC_BACKEND_URL)
  if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;
  // Runtime detection: if running on Railway, derive backend URL from window location
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host.includes("railway.app")) {
      return `https://paper-trading-backend-production.up.railway.app`;
    }
  }
  return "http://localhost:4000";
}

const BASE_URL = getBaseUrl();

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

const responseCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_FRESH_MS = 2_000;   // serve instantly without background fetch
const CACHE_STALE_MS = 30_000;  // serve stale data for up to 30s while refreshing
const CACHE_MAX_SIZE = 300;
const inflight = new Map<string, Promise<unknown>>();

function getCached<T>(key: string): { data: T; fresh: boolean } | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.ts;
  // Never delete entries with non-empty token data — always return as stale
  if (age > CACHE_STALE_MS) {
    if (!isEmptyTokenResponse(entry.data) && hasTokensKey(entry.data)) {
      return { data: entry.data as T, fresh: false };
    }
    responseCache.delete(key);
    return null;
  }
  return { data: entry.data as T, fresh: age <= CACHE_FRESH_MS };
}

function hasTokensKey(data: unknown): boolean {
  return data !== null && typeof data === "object" && data !== undefined && "tokens" in data;
}

function isEmptyTokenResponse(data: unknown): boolean {
  if (hasTokensKey(data)) {
    const tokens = (data as { tokens?: unknown[] }).tokens;
    return Array.isArray(tokens) && tokens.length === 0;
  }
  return false;
}

function setCache(key: string, data: unknown): void {
  const existing = responseCache.get(key);
  // Don't overwrite a non-empty token list with an empty one
  if (existing && isEmptyTokenResponse(data) && !isEmptyTokenResponse(existing.data)) {
    // Refresh the timestamp so the good entry stays alive
    existing.ts = Date.now();
    return;
  }
  if (responseCache.size >= CACHE_MAX_SIZE) {
    const oldest = responseCache.keys().next().value;
    if (oldest) responseCache.delete(oldest);
  }
  responseCache.set(key, { data, ts: Date.now() });
}

function doFetch<T>(url: string, headers: Record<string, string>, options: RequestInit, cacheKey: string): Promise<T> {
  const promise = (async () => {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${res.status}`);
    }
    const data = await res.json();
    // If response is empty tokens but we have good cached data, keep the cached data
    const existing = responseCache.get(cacheKey);
    if (isEmptyTokenResponse(data) && existing && !isEmptyTokenResponse(existing.data)) {
      existing.ts = Date.now();
      inflight.delete(cacheKey);
      return existing.data as T;
    }
    setCache(cacheKey, data);
    inflight.delete(cacheKey);
    return data as T;
  })();

  inflight.set(cacheKey, promise);
  promise.catch(() => { inflight.delete(cacheKey); });
  return promise;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const method = options.method?.toUpperCase() || "GET";
  const isGet = method === "GET";
  const cacheKey = path;

  if (isGet) {
    const cached = getCached<T>(cacheKey);
    if (cached) {
      // Fresh: return immediately, no background fetch
      if (cached.fresh) return cached.data;
      // Stale: return immediately + kick off background refresh
      doFetch<T>(`${BASE_URL}${path}`, headers, options, cacheKey);
      return cached.data;
    }

    // Dedupe identical inflight requests
    const pending = inflight.get(cacheKey);
    if (pending) return pending as Promise<T>;
  }

  if (!isGet) {
    const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${res.status}`);
    }
    return res.json();
  }

  return doFetch<T>(`${BASE_URL}${path}`, headers, options, cacheKey);
}

export const api = {
  auth: {
    connect: (walletAddress: string) =>
      request<{ token: string; user: { id: string; walletAddress: string } }>("/api/auth/connect", {
        method: "POST",
        body: JSON.stringify({ walletAddress }),
      }),
  },
  market: {
    search: (query: string) =>
      request<{ results: TokenSearchResult[] }>(`/api/market/search?query=${encodeURIComponent(query)}`),
    getToken: (mint: string) => request<TokenInfo>(`/api/market/tokens/${mint}`),
    getChart: (mint: string, range: string) =>
      request<{ bars: OHLCVBar[] }>(`/api/market/tokens/${mint}/chart?range=${range}`),
    getOrderBook: (mint: string) => request<OrderBook>(`/api/market/tokens/${mint}/orderbook`),
    getTopTokens: () => request<{ tokens: TokenInfo[] }>("/api/market/top"),
    getLatestTokens: () => request<{ tokens: TokenInfo[] }>("/api/market/latest"),
    getTrendingTokens: () => request<{ tokens: TokenInfo[] }>("/api/market/trending"),
    getTokenTrades: (mint: string) => request<{ trades: TokenTrade[] }>(`/api/market/tokens/${mint}/trades`),
    getTokenHolders: (mint: string) => request<TokenHolderInfo>(`/api/market/tokens/${mint}/holders`),
    getTokenBundles: (mint: string) => request<BundleInfo>(`/api/market/tokens/${mint}/bundles`),
    getTokenSnipers: (mint: string) => request<SniperInfo>(`/api/market/tokens/${mint}/snipers`),
    getGraduatingTokens: () => request<{ tokens: TokenInfo[] }>("/api/market/graduating"),
    getGraduatedTokens: () => request<{ tokens: TokenInfo[] }>("/api/market/graduated"),
    getFilteredTokens: (filters: TokenFilterParams) => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== "") params.set(k, String(v));
      });
      return request<{ tokens: FilteredTokenItem[] }>(`/api/market/filtered?${params.toString()}`);
    },
  },
  trade: {
    execute: (mint: string, amount: number, side: "buy" | "sell") =>
      request<TradeResult>("/api/trades", {
        method: "POST",
        body: JSON.stringify({ mint, amount, side }),
      }),
  },
  portfolio: {
    get: () => request<Portfolio>("/api/portfolio"),
    getTrades: (limit = 50, offset = 0) =>
      request<{ trades: Trade[] }>(`/api/portfolio/trades?limit=${limit}&offset=${offset}`),
    getAnalytics: () => request<PortfolioAnalytics>("/api/portfolio/analytics"),
  },
  orders: {
    create: (params: CreateLimitOrderParams) =>
      request<LimitOrderResult>("/api/orders", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    getAll: (status?: "open" | "filled" | "cancelled") =>
      request<{ orders: LimitOrderResult[] }>(`/api/orders${status ? `?status=${status}` : ""}`),
    cancel: (orderId: string) =>
      request<{ success: boolean }>(`/api/orders/${orderId}`, { method: "DELETE" }),
  },
};

export interface TokenSearchResult {
  mint: string;
  symbol: string;
  name: string;
  image?: string;
  price?: number;
  marketCap?: number;
}

export interface TokenSocials {
  twitter?: string;
  telegram?: string;
  website?: string;
  discord?: string;
}

export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  supply: number;
  liquidity: number;
  price: number;
  marketCap: number;
  image?: string;
  volume24h?: number;
  socials?: TokenSocials;
}

export type WalletType = "whale" | "sniper" | "team" | "dex" | "cex" | "contract" | "liquidity_pool" | "unknown";

export interface TokenHolder {
  address: string;
  amount: number;
  percentage: number;
  isInsider?: boolean;
  walletType?: WalletType;
  label?: string;
  firstBuyTime?: number;
  holdingSince?: number;
}

export interface TokenHolderInfo {
  totalHolders: number;
  topHolders: TokenHolder[];
  top10Pct: number;
  top20Pct: number;
}

export interface BundleDetail {
  wallet: string;
  balance: number;
  percentage: number;
  initialBalance: number;
  initialPercentage: number;
  bundleTime: number;
}

export interface BundleInfo {
  bundled: boolean;
  bundleCount: number;
  bundlePercentage: number;
  currentBundlePercentage: number;
  totalBalance: number;
  initialBalance: number;
  initialPercentage: number;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  details: BundleDetail[];
  sniperInfo?: SniperInfo;
}

export interface SniperWallet {
  address: string;
  buyTime: number;
  blockOffset: number;
  amountUsd: number;
  percentage: number;
  currentPnl?: number;
  tx: string;
}

export interface SniperInfo {
  hasSnipers: boolean;
  sniperCount: number;
  sniperPercentage: number;
  snipers: SniperWallet[];
}

export interface OHLCVBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookLevel {
  price: number;
  qty: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  midPrice: number;
  spread: number;
}

export interface TradeResult {
  tradeId: string;
  mint: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  fee: number;
  slippage: number;
  totalCost: number;
}

export interface PositionWithPrice {
  mint: string;
  symbol?: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  value: number;
}

export interface Portfolio {
  totalValue: number;
  pnl24h: number;
  overallPnl: number;
  roi: number;
  usdcBalance: number;
  positions: PositionWithPrice[];
}

export interface Trade {
  id: string;
  userId: string;
  mint: string;
  side: string;
  qty: number;
  price: number;
  fee: number;
  slippage: number;
  timestamp: string;
}

export interface TokenTrade {
  tx: string;
  type: "buy" | "sell";
  amountUsd: number;
  volumeSol: number;
  priceUsd: number;
  marketCap: number;
  wallet: string;
  time: number;
}

export interface TokenFilterParams {
  status?: "graduating" | "graduated" | "default";
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  minLiquidity?: number;
  maxLiquidity?: number;
  minMarketCap?: number;
  maxMarketCap?: number;
  minVolume?: number;
  maxVolume?: number;
  volumeTimeframe?: string;
  minBuys?: number;
  maxBuys?: number;
  minSells?: number;
  maxSells?: number;
  minTotalTransactions?: number;
  maxTotalTransactions?: number;
  minHolders?: number;
  maxHolders?: number;
  minCurvePercentage?: number;
  maxCurvePercentage?: number;
  minFeesTotal?: number;
  maxFeesTotal?: number;
  minCreatedAt?: number;
  maxCreatedAt?: number;
  limit?: number;
}

export interface FilteredTokenItem {
  mint: string;
  symbol: string;
  name: string;
  image?: string;
  price: number;
  marketCap: number;
  liquidity: number;
  volume24h: number;
  buys: number;
  sells: number;
  totalTransactions: number;
  holders: number;
  curvePercentage?: number;
  feesTotal?: number;
  createdAt?: number;
}

export interface PortfolioAnalytics {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  bestTrade: { mint: string; pnl: number; date: string } | null;
  worstTrade: { mint: string; pnl: number; date: string } | null;
  dailyPnl: { date: string; pnl: number; cumulative: number }[];
}

export interface CreateLimitOrderParams {
  mint: string;
  side: "buy" | "sell";
  orderType: "limit" | "stop_loss" | "take_profit";
  qty: number;
  triggerPrice: number;
  note?: string;
}

export interface LimitOrderResult {
  id: string;
  mint: string;
  side: string;
  orderType: string;
  qty: number;
  triggerPrice: number;
  status: string;
  note: string | null;
  createdAt: string;
  filledAt?: string;
  filledPrice?: number;
}
