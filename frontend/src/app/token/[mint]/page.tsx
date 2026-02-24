"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { wsClient } from "@/lib/ws";
import { formatPrice, formatCompact, formatNumber, shortenAddress } from "@/lib/format";
import { OrderPanel } from "@/components/OrderPanel";
import { Transactions } from "@/components/OrderBook";

const Chart = dynamic(() => import("@/components/Chart").then((m) => m.Chart), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[400px] text-text-muted text-xs">Loading chart...</div>
  ),
});

type ChartRange = "1d" | "7d" | "30d";

export default function TokenPage() {
  const params = useParams();
  const mint = params.mint as string;
  const { isAuthenticated } = useAuth();
  const [range, setRange] = useState<ChartRange>("1d");

  const { data: tokenInfo, isLoading: tokenLoading, isFetching: tokenFetching } = useQuery({
    queryKey: ["token", mint],
    queryFn: () => api.market.getToken(mint),
    enabled: !!mint,
    refetchInterval: 5000,
    staleTime: 10000,
    retry: 2,
  });

  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ["chart", mint, range],
    queryFn: () => api.market.getChart(mint, range),
    enabled: !!mint && !!tokenInfo,
    refetchInterval: 10000,
    staleTime: 15000,
  });

  const { data: portfolio } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.portfolio.get(),
    enabled: isAuthenticated,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (mint) {
      wsClient.subscribe(mint);
      return () => wsClient.unsubscribe(mint);
    }
  }, [mint]);

  const usdcBalance = portfolio?.usdcBalance ?? 0;
  const position = portfolio?.positions.find((p) => p.mint === mint);
  const tokenQty = position?.qty ?? 0;

  if (tokenLoading || tokenFetching || !tokenInfo) {
    if (!tokenInfo && !tokenLoading && !tokenFetching) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-text-muted text-sm">Token not found</div>
        </div>
      );
    }
    if (!tokenInfo) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="flex flex-col items-center gap-3">
            <div className="h-6 w-6 border-2 border-accent-green border-t-transparent rounded-full animate-spin" />
            <div className="text-text-muted text-xs">Loading...</div>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="pt-2 pb-6">
      {/* Token Header Bar */}
      <div className="flex items-center gap-3 mb-2 pb-2 border-b border-border">
        {/* Token identity */}
        <div className="flex items-center gap-2">
          {tokenInfo.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tokenInfo.image}
              alt={tokenInfo.symbol}
              className="h-8 w-8 rounded-full object-cover ring-1 ring-border"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-bg-tertiary flex items-center justify-center text-xs font-bold text-text-muted ring-1 ring-border">
              {tokenInfo.symbol?.charAt(0)}
            </div>
          )}
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm">{tokenInfo.symbol}</span>
              <span className="text-[10px] text-text-muted">{tokenInfo.name}</span>
            </div>
            <span className="text-[9px] font-mono text-text-muted">{shortenAddress(mint, 6)}</span>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 ml-auto">
          <StatItem label="Price" value={formatPrice(tokenInfo.price)} highlight />
          <StatItem label="Liq" value={formatCompact(tokenInfo.liquidity)} />
          <StatItem label="24h Vol" value={formatCompact(tokenInfo.volume24h || 0)} />
          <StatItem label="MCap" value={formatCompact(tokenInfo.marketCap)} />
          <StatItem label="Supply" value={formatNumber(tokenInfo.supply, 0)} />
        </div>
      </div>

      {/* Main Grid: Chart + Order Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-2">
        {/* Left: Chart area */}
        <div className="flex flex-col gap-2">
          {/* Chart */}
          <div className="rounded border border-border bg-bg-primary overflow-hidden">
            {/* Timeframe bar */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-bg-secondary">
              {(["1d", "7d", "30d"] as ChartRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                    range === r
                      ? "bg-accent-green/20 text-accent-green"
                      : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary"
                  }`}
                  aria-pressed={range === r}
                >
                  {r.toUpperCase()}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2 text-[10px] text-text-muted">
                <span>Price / MC</span>
                <span>USD / SOL</span>
              </div>
            </div>
            {chartData?.bars && chartData.bars.length > 0 ? (
              <Chart data={chartData.bars} height={380} />
            ) : (
              <div className="flex items-center justify-center h-[380px] text-text-muted bg-bg-primary text-xs">
                {chartLoading ? "Loading chart..." : "No chart data available"}
              </div>
            )}
          </div>

          {/* Transactions */}
          <Transactions mint={mint} />
        </div>

        {/* Right: Order Panel + Token Details */}
        <div className="flex flex-col gap-2">
          <OrderPanel token={tokenInfo} usdcBalance={usdcBalance} tokenQty={tokenQty} />

          {/* Token Details card */}
          <div className="rounded border border-border bg-bg-card p-3">
            <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Token Info</h3>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <span className="text-text-muted">Mint</span>
                <div className="font-mono text-text-secondary truncate" title={tokenInfo.mint}>{shortenAddress(tokenInfo.mint, 6)}</div>
              </div>
              <div>
                <span className="text-text-muted">Decimals</span>
                <div className="text-text-secondary">{tokenInfo.decimals}</div>
              </div>
              <div>
                <span className="text-text-muted">Supply</span>
                <div className="text-text-secondary">{formatNumber(tokenInfo.supply, 0)}</div>
              </div>
              <div>
                <span className="text-text-muted">Liquidity</span>
                <div className="text-text-secondary">{formatCompact(tokenInfo.liquidity)}</div>
              </div>
            </div>
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
