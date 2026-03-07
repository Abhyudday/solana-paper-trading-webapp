"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { wsClient } from "@/lib/ws";
import { formatPrice, formatCompact, formatNumber, shortenAddress, formatPnl, formatPercent } from "@/lib/format";
import { OrderPanel } from "@/components/OrderPanel";
import { Transactions } from "@/components/OrderBook";
import { TopHolders } from "@/components/TopHolders";
import { BundleChecker } from "@/components/BundleChecker";
import { SocialLinks } from "@/components/SocialLinks";

const Chart = dynamic(() => import("@/components/Chart").then((m) => m.Chart), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[400px] text-text-muted text-xs">Loading chart...</div>
  ),
});

type ChartRange = "1s" | "5s" | "15s" | "30s" | "1m" | "5m" | "15m" | "30m" | "1h" | "6h" | "1d" | "7d" | "30d";

const ALL_RANGES: ChartRange[] = ["1s", "5s", "15s", "30s", "1m", "5m", "15m", "30m", "1h", "6h", "1d", "7d", "30d"];

type InfoTab = "info" | "holders" | "bundles";

export default function TokenPage() {
  const params = useParams();
  const mint = params.mint as string;
  const { isAuthenticated } = useAuth();
  const [range, setRange] = useState<ChartRange>("15s");
  const [infoTab, setInfoTab] = useState<InfoTab>("info");
  const queryClient = useQueryClient();

  const { data: tokenInfo, isLoading: tokenLoading, isFetched: tokenFetched } = useQuery({
    queryKey: ["token", mint],
    queryFn: () => api.market.getToken(mint),
    enabled: !!mint,
    refetchInterval: 800,
    staleTime: 300,
    placeholderData: keepPreviousData,
  });

  const isShortRange = ["1s", "5s", "15s", "30s", "1m"].includes(range);
  const chartRefetchInterval = (() => {
    switch (range) {
      case "1s": return 1_000;
      case "5s": return 1_000;
      case "15s": return 1_000;
      case "30s": return 2_000;
      case "1m": return 2_000;
      case "5m": return 5_000;
      case "15m": return 10_000;
      default: return 15_000;
    }
  })();

  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ["chart", mint, range],
    queryFn: () => api.market.getChart(mint, range),
    enabled: !!mint,
    refetchInterval: chartRefetchInterval,
    staleTime: isShortRange ? 500 : 5_000,
    placeholderData: keepPreviousData,
    retry: 2,
  });

  const fallbackRange: ChartRange | null = (() => {
    switch (range) {
      case "1s": return "5s";
      case "5s": return "15s";
      case "15s": return "1m";
      case "30s": return "1m";
      case "1m": return "5m";
      case "5m": return "15m";
      case "15m": return "30m";
      default: return null;
    }
  })();
  const { data: fallbackChartData } = useQuery({
    queryKey: ["chart", mint, fallbackRange],
    queryFn: () => api.market.getChart(mint, fallbackRange!),
    enabled: !!mint && !!fallbackRange && !chartLoading && (chartData?.bars?.length ?? 0) === 0,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });

  const lastUpdateRef = useRef<number>(Date.now());
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  useEffect(() => {
    if (chartData) {
      lastUpdateRef.current = Date.now();
      setLastUpdated(Date.now());
    }
  }, [chartData]);

  const { data: portfolio } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.portfolio.get(),
    enabled: isAuthenticated,
    refetchInterval: 5_000,
    staleTime: 2_000,
  });

  const { data: userTradesData } = useQuery({
    queryKey: ["userTrades"],
    queryFn: () => api.portfolio.getTrades(100, 0),
    enabled: isAuthenticated,
    staleTime: 2_000,
  });

  useEffect(() => {
    if (mint) {
      queryClient.prefetchQuery({
        queryKey: ["tokenTrades", mint],
        queryFn: () => api.market.getTokenTrades(mint),
        staleTime: 3_000,
      });
      queryClient.prefetchQuery({
        queryKey: ["tokenHolders", mint],
        queryFn: () => api.market.getTokenHolders(mint),
        staleTime: 30_000,
      });
      queryClient.prefetchQuery({
        queryKey: ["tokenBundles", mint],
        queryFn: () => api.market.getTokenBundles(mint),
        staleTime: 60_000,
      });
      wsClient.subscribe(mint);
      return () => wsClient.unsubscribe(mint);
    }
  }, [mint, queryClient]);

  useEffect(() => {
    if (!mint) return;
    const idx = ALL_RANGES.indexOf(range);
    const adjacentRanges = [ALL_RANGES[idx - 1], ALL_RANGES[idx + 1]].filter(Boolean);
    adjacentRanges.forEach((r) => {
      queryClient.prefetchQuery({
        queryKey: ["chart", mint, r],
        queryFn: () => api.market.getChart(mint, r!),
        staleTime: 5_000,
      });
    });
  }, [mint, range, queryClient]);

  useEffect(() => {
    if (!mint) return;

    const bucketMap: Record<string, number> = {
      "1s": 1, "5s": 5, "15s": 15, "30s": 30,
      "1m": 60, "5m": 300, "15m": 900, "30m": 1800,
      "1h": 3600, "6h": 21600, "1d": 86400, "7d": 604800, "30d": 2592000,
    };
    const bucketSec = bucketMap[range] ?? 1;

    const unsub = wsClient.on("price", (msg) => {
      if (msg.mint !== mint) return;
      const price = msg.price as number;
      if (!price || price <= 0) return;
      const nowSec = Math.floor(Date.now() / 1000);
      const currentBucket = Math.floor(nowSec / bucketSec) * bucketSec;

      queryClient.setQueryData<import("@/lib/api").OHLCVBar[]>(["chart", mint, range], (old) => {
        if (!old || old.length === 0) return old;
        const updated = [...old];
        const last = updated[updated.length - 1];
        const lastBucket = Math.floor(last.time / bucketSec) * bucketSec;

        if (currentBucket === lastBucket) {
          const patched = { ...last };
          patched.close = price;
          if (price > patched.high) patched.high = price;
          if (price < patched.low || patched.low === 0) patched.low = price;
          updated[updated.length - 1] = patched;
        } else {
          updated.push({
            time: currentBucket,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: 0,
          });
        }
        return updated;
      });
    });
    return unsub;
  }, [mint, range, queryClient]);

  const [mintCopied, setMintCopied] = useState(false);
  const handleCopyMint = useCallback(() => {
    navigator.clipboard.writeText(mint);
    setMintCopied(true);
    setTimeout(() => setMintCopied(false), 1500);
  }, [mint]);

  const usdcBalance = portfolio?.usdcBalance ?? 0;
  const position = portfolio?.positions.find((p) => p.mint === mint);
  const tokenQty = position?.qty ?? 0;
  const primaryBars = chartData?.bars ?? [];
  const rawChartBars = primaryBars.length > 0 ? primaryBars : (fallbackChartData?.bars ?? []);
  const usingFallback = primaryBars.length === 0 && rawChartBars.length > 0;

  const lastGoodBarsRef = useRef<import("@/lib/api").OHLCVBar[]>([]);
  if (rawChartBars.length > 0) {
    lastGoodBarsRef.current = rawChartBars;
  }
  const chartBars = rawChartBars.length > 0 ? rawChartBars : lastGoodBarsRef.current;

  const avgEntryFromTrades = useMemo(() => {
    if (!userTradesData?.trades) return undefined;
    const buyTrades = userTradesData.trades.filter((tr) => tr.mint === mint && tr.side === "buy");
    if (buyTrades.length === 0) return undefined;
    const totalQty = buyTrades.reduce((sum, tr) => sum + tr.qty, 0);
    const totalValue = buyTrades.reduce((sum, tr) => sum + tr.qty * tr.price, 0);
    return totalQty > 0 ? totalValue / totalQty : undefined;
  }, [userTradesData, mint]);

  const avgExitPrice = useMemo(() => {
    if (!userTradesData?.trades) return undefined;
    const sellTrades = userTradesData.trades.filter((tr) => tr.mint === mint && tr.side === "sell");
    if (sellTrades.length === 0) return undefined;
    const totalQty = sellTrades.reduce((sum, tr) => sum + tr.qty, 0);
    const totalValue = sellTrades.reduce((sum, tr) => sum + tr.qty * tr.price, 0);
    return totalQty > 0 ? totalValue / totalQty : undefined;
  }, [userTradesData, mint]);

  const effectiveAvgEntry = position?.avgEntryPrice ?? avgEntryFromTrades;

  if (!tokenInfo && tokenFetched && !tokenLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-bg-tertiary flex items-center justify-center">
            <svg className="w-6 h-6 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div className="text-text-muted text-sm">Token not found</div>
        </div>
      </div>
    );
  }

  const isLoading = !tokenInfo && tokenLoading;

  if (isLoading) {
    return (
      <div className="pt-3 pb-6 page-enter">
        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border">
          <div className="h-9 w-9 rounded-xl skeleton-shimmer ring-1 ring-border" />
          <div>
            <div className="h-4 w-24 skeleton-shimmer rounded mb-1" />
            <div className="h-3 w-36 skeleton-shimmer rounded" />
          </div>
          <div className="flex items-center gap-4 ml-auto">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="h-2.5 w-8 skeleton-shimmer rounded" />
                <div className="h-3.5 w-14 skeleton-shimmer rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-bg-card h-[480px] skeleton-shimmer" />
            <div className="rounded-xl border border-border bg-bg-card h-[300px] skeleton-shimmer" />
          </div>
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-bg-card h-[300px] skeleton-shimmer" />
            <div className="rounded-xl border border-border bg-bg-card h-[220px] skeleton-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  const t = tokenInfo!;

  return (
    <div className="pt-3 pb-6 page-enter">
      {/* Token Header Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-3 pb-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          {t.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={t.image}
              alt={t.symbol}
              className="h-9 w-9 rounded-xl object-cover ring-1 ring-border"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-accent-green/20 to-accent-blue/10 flex items-center justify-center text-sm font-bold text-accent-green/60 ring-1 ring-border">
              {t.symbol?.charAt(0)}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[15px]">{t.symbol}</span>
              <span className="text-[11px] text-text-muted">{t.name}</span>
              {t.dexPaid !== undefined && (
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${
                  t.dexPaid
                    ? "bg-accent-green/10 text-accent-green border-accent-green/20"
                    : "bg-text-muted/10 text-text-muted border-border"
                }`}>
                  {t.dexPaid ? "\u2713 DEX PAID" : "DEX UNPAID"}
                </span>
              )}
            </div>
            <span className="flex items-center gap-1.5">
              <button
                onClick={handleCopyMint}
                className={`text-[9px] font-mono transition-colors ${mintCopied ? "text-accent-green" : "text-text-muted hover:text-text-primary"}`}
                title={mintCopied ? "Copied!" : "Click to copy address"}
              >
                {mintCopied ? "Copied!" : shortenAddress(mint, 6)}
              </button>
              <button
                onClick={handleCopyMint}
                className={`inline-flex items-center transition-colors ${
                  mintCopied ? "text-accent-green" : "text-text-muted hover:text-text-primary"
                }`}
                title={mintCopied ? "Copied!" : "Copy mint address"}
              >
                {mintCopied ? (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                  </svg>
                )}
              </button>
            </span>
          </div>
        </div>

        <SocialLinks socials={t.socials} mint={mint} />

        {/* Stats bar */}
        <div className="flex items-center gap-3 ml-auto">
          <StatItem label="MCap" value={formatCompact(t.marketCap)} highlight />
          <div className="w-px h-6 bg-border" />
          <StatItem label="Price" value={formatPrice(t.price)} />
          <div className="w-px h-6 bg-border" />
          <StatItem label="Liq" value={formatCompact(t.liquidity)} />
          <div className="w-px h-6 bg-border" />
          <StatItem label="24h Vol" value={formatCompact(t.volume24h || 0)} />
          <div className="w-px h-6 bg-border hidden md:block" />
          <div className="hidden md:block">
            <StatItem label="Supply" value={formatNumber(t.supply, 0)} />
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
        {/* Left: Chart + Trades */}
        <div className="flex flex-col gap-3">
          {/* Chart */}
          <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
            {/* Timeframe bar */}
            <div className="flex items-center gap-0.5 px-3 py-2 border-b border-border bg-bg-secondary overflow-x-auto">
              {ALL_RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${
                    range === r
                      ? "bg-accent-green/10 text-accent-green border border-accent-green/20 shadow-glow-sm"
                      : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary"
                  }`}
                  aria-pressed={range === r}
                >
                  {r.toUpperCase()}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2 text-[10px] text-text-muted flex-shrink-0 pl-3">
                {isShortRange && (
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-green live-dot" />
                    <span className="text-accent-green font-bold text-[9px] uppercase">Live</span>
                    <span className="text-text-muted/50 text-[8px] font-mono">
                      {new Date(lastUpdated).toLocaleTimeString()}
                    </span>
                  </span>
                )}
              </div>
            </div>
            <PositionBanner
              mint={mint}
              position={position}
              avgEntryFromTrades={avgEntryFromTrades}
              avgExitPrice={avgExitPrice}
              apiPrice={t.price}
            />
            {chartLoading && chartBars.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[400px] text-text-muted bg-bg-card gap-3">
                <div className="w-6 h-6 border-2 border-text-muted/30 border-t-accent-green rounded-full animate-spin" />
                <span className="text-[11px]">Loading chart data...</span>
              </div>
            ) : chartBars.length > 0 ? (
              <>
                {usingFallback && (
                  <div className="px-3 py-1.5 bg-accent-orange/5 border-b border-accent-orange/10 text-accent-orange text-[10px] font-semibold text-center">
                    No data for {range.toUpperCase()} — showing {fallbackRange?.toUpperCase()} instead
                  </div>
                )}
                <Chart data={chartBars} height={400} supply={t.supply} marketCap={t.marketCap} currentPrice={t.price} range={usingFallback ? fallbackRange! : range} avgEntryPrice={effectiveAvgEntry} avgExitPrice={avgExitPrice} />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-[400px] text-text-muted bg-bg-card gap-2">
                <svg className="w-8 h-8 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
                <span className="text-[11px]">No chart data available for this timeframe</span>
              </div>
            )}
          </div>

          {/* Transactions */}
          <Transactions mint={mint} />
        </div>

        {/* Right: Order Panel + Tabbed Info */}
        <div className="flex flex-col gap-3">
          <OrderPanel token={t} usdcBalance={usdcBalance} tokenQty={tokenQty} />

          {/* Tabbed info section */}
          <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
            <div className="flex border-b border-border bg-bg-secondary">
              {(["info", "holders", "bundles"] as InfoTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setInfoTab(tab)}
                  className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-all relative ${
                    infoTab === tab
                      ? "text-accent-green bg-bg-card"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  {tab === "info" ? "Info" : tab === "holders" ? "Holders" : "Bundles"}
                  {infoTab === tab && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent-green" />
                  )}
                </button>
              ))}
            </div>

            {infoTab === "info" && (
              <div className="p-3">
                {t.dexPaid !== undefined && (
                  <div className={`flex items-center gap-2 mb-2.5 p-2 rounded-lg border ${
                    t.dexPaid
                      ? "bg-accent-green/5 border-accent-green/20"
                      : "bg-accent-red/5 border-accent-red/20"
                  }`}>
                    <span className={`text-[10px] font-bold ${t.dexPaid ? "text-accent-green" : "text-accent-red"}`}>
                      {t.dexPaid ? "\u2713" : "\u2717"}
                    </span>
                    <span className={`text-[10px] font-semibold ${t.dexPaid ? "text-accent-green" : "text-accent-red"}`}>
                      {t.dexPaid ? "DEX Screener Listing Paid" : "DEX Screener Listing Unpaid"}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2.5 text-[10px]">
                  <div className="bg-bg-tertiary/30 rounded-lg p-2">
                    <span className="text-text-muted block text-[8px] uppercase tracking-wider mb-0.5">Mint</span>
                    <div className="font-mono text-text-secondary truncate" title={t.mint}>{shortenAddress(t.mint, 6)}</div>
                  </div>
                  <div className="bg-bg-tertiary/30 rounded-lg p-2">
                    <span className="text-text-muted block text-[8px] uppercase tracking-wider mb-0.5">Decimals</span>
                    <div className="text-text-secondary">{t.decimals}</div>
                  </div>
                  <div className="bg-bg-tertiary/30 rounded-lg p-2">
                    <span className="text-text-muted block text-[8px] uppercase tracking-wider mb-0.5">Supply</span>
                    <div className="text-text-secondary">{formatNumber(t.supply, 0)}</div>
                  </div>
                  <div className="bg-bg-tertiary/30 rounded-lg p-2">
                    <span className="text-text-muted block text-[8px] uppercase tracking-wider mb-0.5">Liquidity</span>
                    <div className="text-text-secondary">{formatCompact(t.liquidity)}</div>
                  </div>
                  <div className="bg-bg-tertiary/30 rounded-lg p-2">
                    <span className="text-text-muted block text-[8px] uppercase tracking-wider mb-0.5">Market Cap</span>
                    <div className="text-accent-green font-semibold">{formatCompact(t.marketCap)}</div>
                  </div>
                  <div className="bg-bg-tertiary/30 rounded-lg p-2">
                    <span className="text-text-muted block text-[8px] uppercase tracking-wider mb-0.5">24h Volume</span>
                    <div className="text-text-secondary">{formatCompact(t.volume24h || 0)}</div>
                  </div>
                </div>

                {t.socials && Object.keys(t.socials).length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-border/50">
                    <span className="text-[8px] text-text-muted uppercase tracking-wider font-semibold">Socials</span>
                    <div className="mt-1.5">
                      <SocialLinks socials={t.socials} mint={mint} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {infoTab === "holders" && (
              <TopHolders mint={mint} />
            )}

            {infoTab === "bundles" && (
              <BundleChecker mint={mint} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PositionBanner({
  mint,
  position,
  avgEntryFromTrades,
  avgExitPrice,
  apiPrice,
}: {
  mint: string;
  position?: { qty: number; avgEntryPrice: number } | null;
  avgEntryFromTrades?: number;
  avgExitPrice?: number;
  apiPrice: number;
}) {
  const livePriceRef = useRef<number>(apiPrice);
  const [livePrice, setLivePrice] = useState<number>(apiPrice);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (apiPrice > 0) {
      livePriceRef.current = apiPrice;
      setLivePrice(apiPrice);
    }
  }, [apiPrice]);

  useEffect(() => {
    const unsub = wsClient.on("price", (msg) => {
      if (msg.mint !== mint) return;
      const p = msg.price as number;
      if (p > 0) {
        livePriceRef.current = p;
        setLivePrice(p);
      }
    });
    return unsub;
  }, [mint]);

  useEffect(() => {
    const id = setInterval(() => {
      const p = livePriceRef.current;
      if (p > 0) setLivePrice(p);
      setTick(t => t + 1);
    }, 500);
    return () => clearInterval(id);
  }, []);

  const displayPrice = livePrice > 0 ? livePrice : apiPrice;
  const hasOpenPosition = position && position.qty > 0;
  const hasTrades = !!(avgEntryFromTrades || avgExitPrice);

  if (!hasOpenPosition && !hasTrades) return null;

  if (hasOpenPosition) {
    const entry = position.avgEntryPrice;
    const livePnl = (displayPrice - entry) * position.qty;
    const liveRoi = entry > 0 ? ((displayPrice - entry) / entry) * 100 : 0;
    return (
      <div className="flex items-center gap-4 px-3 py-2 bg-bg-secondary/50 border-b border-border text-[10px]">
        <span className="text-text-muted font-semibold uppercase tracking-wider text-[8px]">My Position</span>
        <span className="font-mono text-text-secondary">Qty: <b className="text-text-primary">{formatNumber(position.qty, 4)}</b></span>
        <span className="font-mono text-text-secondary">Avg Entry: <b className="text-text-primary">{formatPrice(entry)}</b></span>
        <span className="font-mono text-text-secondary">Value: <b className="text-text-primary">${formatNumber(displayPrice * position.qty, 2)}</b></span>
        <span className={`font-mono font-bold ${livePnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
          P&L: {formatPnl(livePnl)} ({formatPercent(liveRoi)})
        </span>
      </div>
    );
  }

  if (hasTrades && avgEntryFromTrades && avgExitPrice) {
    const realizedRoi = avgEntryFromTrades > 0 ? ((avgExitPrice - avgEntryFromTrades) / avgEntryFromTrades) * 100 : 0;
    return (
      <div className="flex items-center gap-4 px-3 py-2 bg-bg-secondary/50 border-b border-border text-[10px]">
        <span className="text-text-muted font-semibold uppercase tracking-wider text-[8px]">Closed Position</span>
        <span className="font-mono text-text-secondary">Avg Entry: <b className="text-text-primary">{formatPrice(avgEntryFromTrades)}</b></span>
        <span className="font-mono text-text-secondary">Avg Exit: <b className="text-text-primary">{formatPrice(avgExitPrice)}</b></span>
        <span className={`font-mono font-bold ${realizedRoi >= 0 ? "text-accent-green" : "text-accent-red"}`}>
          Return: {formatPercent(realizedRoi)}
        </span>
      </div>
    );
  }

  return null;
}

function StatItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[8px] text-text-muted uppercase tracking-wider font-semibold">{label}</span>
      <span className={`text-[12px] font-mono font-bold ${highlight ? "text-accent-green text-glow-green" : "text-text-primary"}`}>
        {value}
      </span>
    </div>
  );
}
