"use client";

import { useQuery } from "@tanstack/react-query";
import { api, TokenHolderInfo } from "@/lib/api";
import { shortenAddress, formatCompact } from "@/lib/format";

interface TopHoldersProps {
  mint: string;
}

export function TopHolders({ mint }: TopHoldersProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["tokenHolders", mint],
    queryFn: () => api.market.getTokenHolders(mint),
    enabled: !!mint,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const holders = data as TokenHolderInfo | undefined;

  return (
    <div className="rounded border border-border bg-bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-bg-secondary">
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Top Holders</h3>
        {holders && holders.totalHolders > 0 && (
          <span className="text-[9px] text-text-muted font-mono">{holders.totalHolders.toLocaleString()} total</span>
        )}
      </div>

      {/* Concentration bar */}
      {holders && holders.top10Pct > 0 && (
        <div className="px-3 py-2 border-b border-border/40">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-text-muted">Top 10 Concentration</span>
            <span className={`text-[10px] font-mono font-semibold ${holders.top10Pct > 50 ? "text-accent-red" : holders.top10Pct > 30 ? "text-accent-yellow" : "text-accent-green"}`}>
              {holders.top10Pct.toFixed(1)}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${holders.top10Pct > 50 ? "bg-accent-red" : holders.top10Pct > 30 ? "bg-accent-yellow" : "bg-accent-green"}`}
              style={{ width: `${Math.min(holders.top10Pct, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[9px] text-text-muted">Top 20 Concentration</span>
            <span className="text-[10px] font-mono text-text-secondary">{holders.top20Pct.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* Holders list */}
      <div className="max-h-[240px] overflow-y-auto scrollbar-thin">
        {/* Column headers */}
        <div className="flex items-center gap-2 px-3 py-1 text-[9px] text-text-muted uppercase tracking-wide border-b border-border/40 sticky top-0 bg-bg-card">
          <span className="w-5 text-center">#</span>
          <span className="flex-1">Address</span>
          <span className="w-[60px] text-right">%</span>
          <span className="w-[70px] text-right">Amount</span>
        </div>

        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-7 animate-pulse bg-bg-tertiary/10 border-b border-border/20" />
          ))
        ) : !holders || holders.topHolders.length === 0 ? (
          <div className="text-center text-text-muted text-[10px] py-6">No holder data available</div>
        ) : (
          holders.topHolders.map((holder, i) => (
            <div
              key={holder.address}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border-b border-border/40 hover:bg-bg-tertiary/40 transition-colors"
            >
              <span className="w-5 text-center text-[9px] text-text-muted">{i + 1}</span>
              <div className="flex-1 flex items-center gap-1 min-w-0">
                <span className="text-text-secondary truncate text-[10px]">
                  {shortenAddress(holder.address, 4)}
                </span>
                {holder.isInsider && (
                  <span className="text-[8px] px-1 py-0.5 rounded bg-accent-red/15 text-accent-red font-semibold">INSIDER</span>
                )}
              </div>
              <span className={`w-[60px] text-right text-[10px] font-semibold ${holder.percentage > 10 ? "text-accent-red" : holder.percentage > 5 ? "text-accent-yellow" : "text-text-secondary"}`}>
                {holder.percentage.toFixed(2)}%
              </span>
              <span className="w-[70px] text-right text-[10px] text-text-muted">
                {formatCompact(holder.amount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
