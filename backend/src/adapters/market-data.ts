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

export type ChartRange = "1s" | "5s" | "15s" | "30s" | "1m" | "5m" | "15m" | "30m" | "1h" | "6h" | "1d" | "7d" | "30d";

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
  getTokenHolders(mint: string): Promise<TokenHolderInfo>;
  getTokenBundles(mint: string): Promise<BundleInfo>;
  getTokenSnipers(mint: string): Promise<SniperInfo>;
}
