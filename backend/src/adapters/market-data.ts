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

export interface MarketDataAdapter {
  searchTokens(query: string): Promise<TokenSearchResult[]>;
  getTokenInfo(mint: string): Promise<TokenInfo | null>;
  getOHLCV(mint: string, range: ChartRange): Promise<OHLCVBar[]>;
  getTopTokens(limit: number): Promise<TokenInfo[]>;
  getLatestTokens(limit: number): Promise<TokenInfo[]>;
  getTrendingTokens(limit: number): Promise<TokenInfo[]>;
}
