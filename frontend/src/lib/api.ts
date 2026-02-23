const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
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
