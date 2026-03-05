"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { wsClient } from "@/lib/ws";
import { formatPrice, formatCompact, formatNumber, shortenAddress } from "@/lib/format";
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

const TIMEFRAME_GROUPS: { label: string; ranges: ChartRange[] }[] = [
  { label: "Seconds", ranges: ["1s", "5s", "15s", "30s"] },
  { label: "Minutes", ranges: ["1m", "5m", "15m", "30m"] },
  { label: "Hours+", ranges: ["1h", "6h", "1d", "7d", "30d"] },
];

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
    refetchInterval: 1_000,
    staleTime: 500,
    placeholderData: keepPreviousData,
  });

  // Dynamic refetch intervals per timeframe
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

  // Fallback: if current range returns no bars, try a longer timeframe automatically
  const fallbackRange = range === "15s" ? "1m" : range === "1m" ? "5m" : range === "5m" ? "15m" : null;
  const { data: fallbackChartData } = useQuery({
    queryKey: ["chart", mint, fallbackRange],
    queryFn: () => api.market.getChart(mint, fallbackRange!),
    enabled: !!mint && !!fallbackRange && !chartLoading && (chartData?.bars?.length ?? 0) === 0,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });

  // Track last chart update time for LIVE indicator
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
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  // Prefetch trades, holders, bundles in parallel with token info
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

  // Prefetch adjacent timeframes for instant switching
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

  // Real-time: patch last candle or create new one based on timeframe bucket
  useEffect(() => {
    if (!mint) return;

    // Convert range to bucket duration in seconds
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
          // Same time bucket — update high, low, close in place
          const patched = { ...last };
          patched.close = price;
          if (price > patched.high) patched.high = price;
          if (price < patched.low || patched.low === 0) patched.low = price;
          updated[updated.length - 1] = patched;
        } else {
          // New time bucket — create a new candle
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
  const chartBars = primaryBars.length > 0 ? primaryBars : (fallbackChartData?.bars ?? []);
  const usingFallback = primaryBars.length === 0 && chartBars.length > 0;

  // Token not found — only after fetch completes with no data
  if (!tokenInfo && tokenFetched && !tokenLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-text-muted text-sm">Token not found</div>
      </div>
    );
  }

  // Show skeleton while loading (instead of blank page)
  const isLoading = !tokenInfo && tokenLoading;

  if (isLoading) {
    return (
      <div className="pt-2 pb-6">
        {/* Skeleton Header */}
        <div className="flex items-center gap-3 mb-2 pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-bg-tertiary animate-pulse ring-1 ring-border" />
            <div>
              <div className="h-4 w-24 bg-bg-tertiary rounded animate-pulse mb-1" />
              <div className="h-3 w-32 bg-bg-tertiary rounded animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="h-2.5 w-8 bg-bg-tertiary rounded animate-pulse" />
                <div className="h-3 w-12 bg-bg-tertiary rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
        {/* Skeleton Body */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-2">
          <div className="flex flex-col gap-2">
            <div className="rounded border border-border bg-bg-primary h-[460px] animate-pulse" />
            <div className="rounded border border-border bg-bg-card h-[300px] animate-pulse" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="rounded border border-border bg-bg-card h-[280px] animate-pulse" />
            <div className="rounded border border-border bg-bg-card h-[200px] animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const t = tokenInfo!;

  return (
    <div className="pt-2 pb-6">
      {/* Token Header Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-2 pb-2 border-b border-border">
        {/* Token identity */}
        <div className="flex items-center gap-2">
          {t.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={t.image}
              alt={t.symbol}
              className="h-8 w-8 rounded-full object-cover ring-1 ring-border"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-bg-tertiary flex items-center justify-center text-xs font-bold text-text-muted ring-1 ring-border">
              {t.symbol?.charAt(0)}
            </div>
          )}
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm">{t.symbol}</span>
              <span className="text-[10px] text-text-muted">{t.name}</span>
            </div>
            <span className="flex items-center gap-1">
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

        {/* Social Links */}
        <SocialLinks socials={t.socials} mint={mint} />

        {/* Stats bar — MCap highlighted */}
        <div className="flex items-center gap-4 ml-auto">
          <StatItem label="MCap" value={formatCompact(t.marketCap)} highlight />
          <StatItem label="Price" value={formatPrice(t.price)} />
          <StatItem label="Liq" value={formatCompact(t.liquidity)} />
          <StatItem label="24h Vol" value={formatCompact(t.volume24h || 0)} />
          <StatItem label="Supply" value={formatNumber(t.supply, 0)} />
        </div>
      </div>

      {/* Main Grid: Chart + Order Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-2">
        {/* Left: Chart area */}
        <div className="flex flex-col gap-2">
          {/* Chart */}
          <div className="rounded border border-border bg-bg-primary overflow-hidden">
            {/* Timeframe bar — all granular options */}
            <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-bg-secondary overflow-x-auto scrollbar-thin">
              {ALL_RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2 py-1 rounded text-[10px] font-bold transition-colors whitespace-nowrap ${
                    range === r
                      ? "bg-accent-green/20 text-accent-green"
                      : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary"
                  }`}
                  aria-pressed={range === r}
                >
                  {r.toUpperCase()}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2 text-[10px] text-text-muted flex-shrink-0 pl-2">
                {isShortRange && (
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-green" />
                    </span>
                    <span className="text-accent-green">LIVE</span>
                    <span className="text-text-muted/60 text-[9px] font-mono">
                      {new Date(lastUpdated).toLocaleTimeString()}
                    </span>
                  </span>
                )}
              </div>
            </div>
            {chartLoading && chartBars.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[380px] text-text-muted bg-bg-primary gap-3">
                <div className="w-6 h-6 border-2 border-text-muted/30 border-t-accent-green rounded-full animate-spin" />
                <span className="text-xs">Loading chart data...</span>
              </div>
            ) : chartBars.length > 0 ? (
              <>
                {usingFallback && (
                  <div className="px-2 py-1 bg-[#f59e0b]/10 text-[#f59e0b] text-[10px] font-medium text-center">
                    No data for {range.toUpperCase()} — showing {fallbackRange?.toUpperCase()} instead
                  </div>
                )}
                <Chart data={chartBars} height={380} supply={t.supply} marketCap={t.marketCap} currentPrice={t.price} range={usingFallback ? fallbackRange! : range} />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-[380px] text-text-muted bg-bg-primary gap-2">
                <svg className="w-8 h-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
                <span className="text-xs">No chart data available for this timeframe</span>
              </div>
            )}
          </div>

          {/* Transactions */}
          <Transactions mint={mint} />
        </div>

        {/* Right: Order Panel + Tabbed Info */}
        <div className="flex flex-col gap-2">
          <OrderPanel token={t} usdcBalance={usdcBalance} tokenQty={tokenQty} />

          {/* Tabbed info section: Token Info / Holders / Bundles */}
          <div className="rounded border border-border bg-bg-card overflow-hidden">
            <div className="flex border-b border-border bg-bg-secondary">
              {(["info", "holders", "bundles"] as InfoTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setInfoTab(tab)}
                  className={`flex-1 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors relative ${
                    infoTab === tab
                      ? "text-accent-green border-b-2 border-accent-green bg-bg-card"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  {tab === "info" ? "Info" : tab === "holders" ? "Holders" : "Bundles & Snipers"}
                </button>
              ))}
            </div>

            {infoTab === "info" && (
              <div className="p-3">
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className="text-text-muted">Mint</span>
                    <div className="font-mono text-text-secondary truncate" title={t.mint}>{shortenAddress(t.mint, 6)}</div>
                  </div>
                  <div>
                    <span className="text-text-muted">Decimals</span>
                    <div className="text-text-secondary">{t.decimals}</div>
                  </div>
                  <div>
                    <span className="text-text-muted">Supply</span>
                    <div className="text-text-secondary">{formatNumber(t.supply, 0)}</div>
                  </div>
                  <div>
                    <span className="text-text-muted">Liquidity</span>
                    <div className="text-text-secondary">{formatCompact(t.liquidity)}</div>
                  </div>
                  <div>
                    <span className="text-text-muted">Market Cap</span>
                    <div className="text-accent-green font-semibold">{formatCompact(t.marketCap)}</div>
                  </div>
                  <div>
                    <span className="text-text-muted">24h Volume</span>
                    <div className="text-text-secondary">{formatCompact(t.volume24h || 0)}</div>
                  </div>
                </div>

                {/* Social links in info tab */}
                {t.socials && Object.keys(t.socials).length > 0 && (
                  <div className="mt-3 pt-2 border-t border-border/50">
                    <span className="text-[9px] text-text-muted uppercase tracking-wider">Socials</span>
                    <div className="mt-1">
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

function StatItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] text-text-muted uppercase">{label}</span>
      <span className={`text-[11px] font-mono font-semibold ${highlight ? "text-accent-green" : "text-text-primary"}`}>
        {value}
      </span>
    </div>
  );
}
