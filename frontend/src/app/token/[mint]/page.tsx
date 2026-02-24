"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { wsClient } from "@/lib/ws";
import { formatPrice, formatCompact, formatNumber } from "@/lib/format";
import { OrderPanel } from "@/components/OrderPanel";
import { Transactions } from "@/components/OrderBook";

const Chart = dynamic(() => import("@/components/Chart").then((m) => m.Chart), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[400px] text-text-muted">Loading chart...</div>
  ),
});

type ChartRange = "1d" | "7d" | "30d";

export default function TokenPage() {
  const params = useParams();
  const mint = params.mint as string;
  const { isAuthenticated } = useAuth();
  const [range, setRange] = useState<ChartRange>("1d");

  const { data: tokenInfo, isLoading: tokenLoading } = useQuery({
    queryKey: ["token", mint],
    queryFn: () => api.market.getToken(mint),
    enabled: !!mint,
    refetchInterval: 5000,
    staleTime: 10000,
  });

  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ["chart", mint, range],
    queryFn: () => api.market.getChart(mint, range),
    enabled: !!mint,
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

  if (tokenLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-text-muted">Loading token data...</div>
      </div>
    );
  }

  if (!tokenInfo) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-text-muted">Token not found</div>
      </div>
    );
  }

  return (
    <div className="py-6">
      {/* Token Header */}
      <div className="flex items-center gap-4 mb-6">
        {tokenInfo.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tokenInfo.image}
            alt={tokenInfo.symbol}
            className="h-10 w-10 rounded-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {tokenInfo.symbol}
            <span className="text-sm text-text-muted font-normal">{tokenInfo.name}</span>
          </h1>
          <div className="flex items-center gap-4 text-sm text-text-secondary">
            <span className="font-mono text-lg font-bold text-text-primary">
              {formatPrice(tokenInfo.price)}
            </span>
            <span>MCap: {formatCompact(tokenInfo.marketCap)}</span>
            <span>Liq: {formatCompact(tokenInfo.liquidity)}</span>
            {tokenInfo.volume24h !== undefined && (
              <span>Vol 24h: {formatCompact(tokenInfo.volume24h)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Chart + Order Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 mb-4">
        {/* Chart */}
        <div className="rounded-lg border border-border bg-bg-primary overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-bg-secondary">
            {(["1d", "7d", "30d"] as ChartRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                  range === r
                    ? "bg-accent-blue text-white"
                    : "bg-bg-tertiary text-text-muted hover:text-text-primary"
                }`}
                aria-pressed={range === r}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
          {chartData?.bars && chartData.bars.length > 0 ? (
            <Chart data={chartData.bars} height={420} />
          ) : (
            <div className="flex items-center justify-center h-[420px] text-text-muted bg-bg-primary">
              {chartLoading ? "Loading chart..." : "No chart data available"}
            </div>
          )}
        </div>

        {/* Order Panel */}
        <OrderPanel token={tokenInfo} usdcBalance={usdcBalance} tokenQty={tokenQty} />
      </div>

      {/* Transactions */}
      <Transactions mint={mint} />

      {/* Token Details */}
      <div className="mt-4 rounded-lg border border-border bg-bg-secondary p-4">
        <h3 className="text-sm font-bold mb-3">Token Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-text-muted text-xs">Mint</div>
            <div className="font-mono text-xs truncate" title={tokenInfo.mint}>{tokenInfo.mint}</div>
          </div>
          <div>
            <div className="text-text-muted text-xs">Decimals</div>
            <div>{tokenInfo.decimals}</div>
          </div>
          <div>
            <div className="text-text-muted text-xs">Supply</div>
            <div>{formatNumber(tokenInfo.supply, 0)}</div>
          </div>
          <div>
            <div className="text-text-muted text-xs">Liquidity</div>
            <div>{formatCompact(tokenInfo.liquidity)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
