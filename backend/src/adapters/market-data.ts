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

export type ChartRange = "1d" | "7d" | "30d";

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

export interface MarketDataAdapter {
  searchTokens(query: string): Promise<TokenSearchResult[]>;
  getTokenInfo(mint: string): Promise<TokenInfo | null>;
  getOHLCV(mint: string, range: ChartRange): Promise<OHLCVBar[]>;
  getTopTokens(limit: number): Promise<TokenInfo[]>;
  getLatestTokens(limit: number): Promise<TokenInfo[]>;
  getTrendingTokens(limit: number): Promise<TokenInfo[]>;
  getTokenTrades(mint: string): Promise<TokenTrade[]>;
  getGraduatingTokens(limit: number): Promise<TokenInfo[]>;
  getGraduatedTokens(limit: number): Promise<TokenInfo[]>;
  getFilteredTokens(filters: TokenFilterParams): Promise<FilteredTokenItem[]>;
}
