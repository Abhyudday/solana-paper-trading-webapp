"use client";

import { useRef } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api, TokenTrade } from "@/lib/api";
import { formatCompact, shortenAddress, timeAgo } from "@/lib/format";

interface TransactionsProps {
  mint: string;
}

function formatTxAmount(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function TxRow({ trade }: { trade: TokenTrade }) {
  const isBuy = trade.type === "buy";
  const age = trade.time > 0 ? timeAgo(new Date(trade.time)) : "";

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs font-mono border-b border-border/40 hover:bg-bg-tertiary/40 transition-colors">
      <div className={`w-0.5 h-6 rounded-full flex-shrink-0 ${isBuy ? "bg-accent-green" : "bg-accent-red"}`} />
      <span className={`w-[72px] text-right flex-shrink-0 font-semibold ${isBuy ? "text-accent-green" : "text-accent-red"}`}>
        {formatTxAmount(trade.amountUsd)}
      </span>
      <span className="w-[60px] text-right flex-shrink-0 text-text-secondary">
        {trade.marketCap > 0 ? formatCompact(trade.marketCap) : formatCompact(trade.priceUsd)}
      </span>
      <span className="flex-1 text-text-muted truncate">
        {shortenAddress(trade.wallet, 4)}
      </span>
      <span className="text-text-muted flex-shrink-0 text-right w-[64px]">
        {age}
      </span>
    </div>
  );
}

export function Transactions({ mint }: TransactionsProps) {
  const lastTradesRef = useRef<TokenTrade[]>([]);

  const { data, isFetching } = useQuery({
    queryKey: ["tokenTrades", mint],
    queryFn: () => api.market.getTokenTrades(mint),
    refetchInterval: 5_000,
    staleTime: 3_000,
    placeholderData: keepPreviousData,
  });

  const freshTrades = data?.trades || [];
  // Keep showing old trades if a refetch returned empty — avoids flicker
  if (freshTrades.length > 0) {
    lastTradesRef.current = freshTrades;
  }
  const trades = freshTrades.length > 0 ? freshTrades : lastTradesRef.current;

  const isFirstLoad = !data && isFetching;

  return (
    <div className="rounded border border-border bg-bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-bg-secondary">
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Trades</h3>
        <span className={`text-[9px] font-medium ${isFetching ? "text-yellow-400 animate-pulse" : "text-accent-green animate-pulse"}`}>
          {isFetching ? "updating" : "live"}
        </span>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 px-3 py-1 text-[9px] text-text-muted uppercase tracking-wide border-b border-border/40">
        <div className="w-0.5 flex-shrink-0" />
        <span className="w-[72px] text-right flex-shrink-0">Amount</span>
        <span className="w-[60px] text-right flex-shrink-0">Price</span>
        <span className="flex-1">Trader</span>
        <span className="text-right w-[64px] flex-shrink-0">Age</span>
      </div>

      {/* Trades list */}
      <div className="max-h-[300px] overflow-y-auto scrollbar-thin">
        {isFirstLoad ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-7 animate-pulse bg-bg-tertiary/10 border-b border-border/20" />
          ))
        ) : trades.length === 0 ? (
          <div className="text-center text-text-muted text-[10px] py-6">No transactions found</div>
        ) : (
          trades.map((trade, i) => <TxRow key={`${trade.tx}-${i}`} trade={trade} />)
        )}
      </div>
    </div>
  );
}

// Keep backward-compatible export
export { Transactions as OrderBook };
