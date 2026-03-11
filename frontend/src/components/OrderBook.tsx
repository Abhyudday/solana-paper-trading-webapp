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
    <div className="dex-row flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono border-b border-border/20">
      <div className={`w-0.5 h-5 rounded-full flex-shrink-0 ${isBuy ? "bg-accent-green" : "bg-accent-red"}`} />
      <span className={`w-[70px] text-right flex-shrink-0 font-bold ${isBuy ? "text-accent-green" : "text-accent-red"}`}>
        {formatTxAmount(trade.amountUsd)}
      </span>
      <span className="w-[55px] text-right flex-shrink-0 text-text-secondary text-[10px]">
        {trade.marketCap > 0 ? formatCompact(trade.marketCap) : formatCompact(trade.priceUsd)}
      </span>
      <span className="flex-1 text-text-muted truncate text-[10px]">
        {shortenAddress(trade.wallet, 4)}
      </span>
      <span className="text-text-muted flex-shrink-0 text-right w-[60px] text-[10px]">
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
    refetchInterval: 10_000,
    staleTime: 5_000,
    placeholderData: keepPreviousData,
  });

  const freshTrades = data?.trades || [];
  if (freshTrades.length > 0) {
    lastTradesRef.current = freshTrades;
  }
  const trades = freshTrades.length > 0 ? freshTrades : lastTradesRef.current;

  const isFirstLoad = !data && isFetching;

  return (
    <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-secondary">
        <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Trades</h3>
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${isFetching ? "bg-accent-yellow" : "bg-accent-green"} live-dot`} />
          <span className={`text-[8px] font-bold uppercase ${isFetching ? "text-accent-yellow" : "text-accent-green"}`}>
            {isFetching ? "Updating" : "Live"}
          </span>
        </span>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-[8px] text-text-muted uppercase tracking-widest font-bold border-b border-border/30">
        <div className="w-0.5 flex-shrink-0" />
        <span className="w-[70px] text-right flex-shrink-0">Amount</span>
        <span className="w-[55px] text-right flex-shrink-0">Price</span>
        <span className="flex-1">Trader</span>
        <span className="text-right w-[60px] flex-shrink-0">Age</span>
      </div>

      <div className="max-h-[300px] overflow-y-auto">
        {isFirstLoad ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-7 skeleton-shimmer border-b border-border/10 opacity-30" />
          ))
        ) : trades.length === 0 ? (
          <div className="text-center text-text-muted text-[10px] py-8">No transactions found</div>
        ) : (
          trades.map((trade, i) => <TxRow key={`${trade.tx}-${i}`} trade={trade} />)
        )}
      </div>
    </div>
  );
}

export { Transactions as OrderBook };
