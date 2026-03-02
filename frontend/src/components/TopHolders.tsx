"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, TokenHolderInfo, WalletType } from "@/lib/api";
import { shortenAddress, formatCompact } from "@/lib/format";

interface TopHoldersProps {
  mint: string;
}

const WALLET_TYPE_CONFIG: Record<WalletType, { label: string; color: string; bg: string }> = {
  whale: { label: "WHALE", color: "text-accent-blue", bg: "bg-accent-blue/15" },
  sniper: { label: "SNIPER", color: "text-accent-orange", bg: "bg-accent-orange/15" },
  team: { label: "TEAM", color: "text-accent-red", bg: "bg-accent-red/15" },
  dex: { label: "DEX", color: "text-accent-green", bg: "bg-accent-green/15" },
  cex: { label: "CEX", color: "text-accent-yellow", bg: "bg-accent-yellow/15" },
  contract: { label: "CONTRACT", color: "text-accent-blue", bg: "bg-accent-blue/15" },
  liquidity_pool: { label: "LIQUIDITY POOL", color: "text-purple-400", bg: "bg-purple-400/15" },
  unknown: { label: "", color: "", bg: "" },
};

function CopyIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
    </svg>
  );
}

export function TopHolders({ mint }: TopHoldersProps) {
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<WalletType | "all">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["tokenHolders", mint],
    queryFn: () => api.market.getTokenHolders(mint),
    enabled: !!mint,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const holders = data as TokenHolderInfo | undefined;

  const handleCopy = useCallback((address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddr(address);
    setTimeout(() => setCopiedAddr(null), 1500);
  }, []);

  const filteredHolders = holders?.topHolders.filter(
    (h) => filterType === "all" || h.walletType === filterType
  ) || [];

  // Count wallet types for filter badges
  const typeCounts = holders?.topHolders.reduce((acc, h) => {
    const t = h.walletType || "unknown";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const activeTypes = Object.entries(typeCounts).filter(([t, c]) => t !== "unknown" && c > 0);

  return (
    <div className="overflow-hidden">
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
              className={`h-full rounded-full transition-all duration-500 ${holders.top10Pct > 50 ? "bg-accent-red" : holders.top10Pct > 30 ? "bg-accent-yellow" : "bg-accent-green"}`}
              style={{ width: `${Math.min(holders.top10Pct, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[9px] text-text-muted">Top 20</span>
            <span className="text-[10px] font-mono text-text-secondary">{holders.top20Pct.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* Wallet type filters */}
      {activeTypes.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/40 overflow-x-auto">
          <button
            onClick={() => setFilterType("all")}
            className={`px-1.5 py-0.5 rounded text-[8px] font-semibold transition-colors ${
              filterType === "all" ? "bg-bg-tertiary text-text-primary" : "text-text-muted hover:text-text-secondary"
            }`}
          >
            All ({holders?.topHolders.length || 0})
          </button>
          {activeTypes.map(([type, count]) => {
            const cfg = WALLET_TYPE_CONFIG[type as WalletType];
            return (
              <button
                key={type}
                onClick={() => setFilterType(type as WalletType)}
                className={`px-1.5 py-0.5 rounded text-[8px] font-semibold transition-colors ${
                  filterType === type ? `${cfg.bg} ${cfg.color}` : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {cfg.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Holders list */}
      <div className="max-h-[240px] overflow-y-auto scrollbar-thin">
        {/* Column headers */}
        <div className="flex items-center gap-2 px-3 py-1 text-[9px] text-text-muted uppercase tracking-wide border-b border-border/40 sticky top-0 bg-bg-card z-10">
          <span className="w-5 text-center">#</span>
          <span className="flex-1">Address</span>
          <span className="w-[60px] text-right">%</span>
          <span className="w-[60px] text-right">Amount</span>
        </div>

        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse bg-bg-tertiary/10 border-b border-border/20" />
          ))
        ) : filteredHolders.length === 0 ? (
          <div className="text-center text-text-muted text-[10px] py-6">No holder data available</div>
        ) : (
          filteredHolders.map((holder, i) => {
            const typeConfig = holder.walletType && holder.walletType !== "unknown"
              ? WALLET_TYPE_CONFIG[holder.walletType]
              : null;

            return (
              <div
                key={holder.address}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border-b border-border/40 hover:bg-bg-tertiary/40 transition-colors group"
              >
                <span className="w-5 text-center text-[9px] text-text-muted">{i + 1}</span>
                <div className="flex-1 flex items-center gap-1 min-w-0">
                  <a
                    href={`https://solscan.io/account/${holder.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-secondary hover:text-accent-blue truncate text-[10px] transition-colors"
                    title={holder.address}
                  >
                    {shortenAddress(holder.address, 4)}
                  </a>
                  <button
                    onClick={() => handleCopy(holder.address)}
                    className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-primary transition-all flex-shrink-0"
                    title="Copy address"
                  >
                    {copiedAddr === holder.address ? (
                      <svg className="w-3 h-3 text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
                      <CopyIcon />
                    )}
                  </button>
                  {holder.label && (
                    <span className={`text-[7px] px-1 py-0.5 rounded font-bold ${typeConfig?.bg || "bg-bg-tertiary"} ${typeConfig?.color || "text-text-muted"}`}>
                      {holder.label}
                    </span>
                  )}
                  {!holder.label && typeConfig && (
                    <span className={`text-[7px] px-1 py-0.5 rounded font-bold ${typeConfig.bg} ${typeConfig.color}`}>
                      {typeConfig.label}
                    </span>
                  )}
                  {holder.isInsider && !holder.label && (
                    <span className="text-[7px] px-1 py-0.5 rounded bg-accent-red/15 text-accent-red font-bold">INSIDER</span>
                  )}
                </div>
                <span className={`w-[60px] text-right text-[10px] font-semibold ${holder.percentage > 10 ? "text-accent-red" : holder.percentage > 5 ? "text-accent-yellow" : "text-text-secondary"}`}>
                  {holder.percentage.toFixed(2)}%
                </span>
                <span className="w-[60px] text-right text-[10px] text-text-muted">
                  {formatCompact(holder.amount)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
