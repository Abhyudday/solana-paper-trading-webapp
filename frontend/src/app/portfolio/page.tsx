"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { formatUSD, formatPnl, formatPercent, formatPrice, formatNumber, timeAgo } from "@/lib/format";
import Link from "next/link";

type Tab = "holding" | "history";

export default function PortfolioPage() {
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("holding");

  const { data: portfolio, isLoading } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api.portfolio.get(),
    enabled: isAuthenticated,
    refetchInterval: 10000,
  });

  const { data: tradesData } = useQuery({
    queryKey: ["trades"],
    queryFn: () => api.portfolio.getTrades(50, 0),
    enabled: isAuthenticated,
    refetchInterval: 15000,
  });

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <div className="h-12 w-12 rounded-full bg-bg-tertiary flex items-center justify-center">
          <svg className="w-6 h-6 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 6v3" />
          </svg>
        </div>
        <span className="text-sm font-semibold">Connect Wallet</span>
        <span className="text-xs text-text-muted">Connect your wallet to view your portfolio</span>
      </div>
    );
  }

  if (isLoading || !portfolio) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 border-2 border-accent-green border-t-transparent rounded-full animate-spin" />
          <div className="text-text-muted text-xs">Loading portfolio...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-2 pb-6">
      {/* Top: Balance Overview + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3 mb-4">
        {/* Left: Wallet Balance */}
        <div className="rounded border border-border bg-bg-card p-4">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Total Balance</div>
          <div className="text-2xl font-bold font-mono text-text-primary">{formatUSD(portfolio.totalValue)}</div>
          <div className="flex items-center gap-4 mt-2">
            <div>
              <span className="text-[10px] text-text-muted">Paper USDC</span>
              <div className="text-sm font-mono text-text-primary">{formatUSD(portfolio.usdcBalance)}</div>
            </div>
            <div>
              <span className="text-[10px] text-text-muted">Positions</span>
              <div className="text-sm font-mono text-text-primary">{portfolio.positions.length}</div>
            </div>
          </div>
        </div>

        {/* Right: PnL Stats */}
        <div className="rounded border border-border bg-bg-card p-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <span className="text-[10px] text-text-muted">Total PnL</span>
              <div className={`text-sm font-bold font-mono ${portfolio.overallPnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                {formatPnl(portfolio.overallPnl)}
              </div>
            </div>
            <div>
              <span className="text-[10px] text-text-muted">24h PnL</span>
              <div className={`text-sm font-bold font-mono ${portfolio.pnl24h >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                {formatPnl(portfolio.pnl24h)}
              </div>
            </div>
            <div>
              <span className="text-[10px] text-text-muted">ROI</span>
              <div className={`text-sm font-bold font-mono ${portfolio.roi >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                {formatPercent(portfolio.roi)}
              </div>
            </div>
          </div>

          {/* Unrealized PnL bar */}
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted">Unrealized Profits</span>
              <span className={`text-xs font-bold font-mono ${portfolio.overallPnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                {formatPnl(portfolio.overallPnl)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-0 border-b border-border mb-3">
        {(["holding", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 ${
              tab === t
                ? "border-accent-green text-text-primary"
                : "border-transparent text-text-muted hover:text-text-secondary"
            }`}
          >
            {t === "holding" ? `Holding (${portfolio.positions.length})` : `History (${tradesData?.trades?.length || 0})`}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "holding" ? (
        <div>
          {portfolio.positions.length === 0 ? (
            <div className="rounded border border-border bg-bg-card p-8 text-center">
              <div className="text-text-muted text-xs">No open positions</div>
              <Link href="/" className="text-[10px] text-accent-green hover:underline mt-1 inline-block">Browse tokens →</Link>
            </div>
          ) : (
            <div className="rounded border border-border bg-bg-card overflow-hidden">
              <table className="w-full text-[11px]" aria-label="Open positions">
                <thead>
                  <tr className="border-b border-border bg-bg-secondary">
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted">Token</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-text-muted">Qty</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-text-muted">Avg Entry</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-text-muted">Price</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-text-muted">Value</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-text-muted">PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.positions.map((pos) => (
                    <tr key={pos.mint} className="border-b border-border/30 hover:bg-bg-tertiary/20 transition-colors">
                      <td className="px-3 py-2">
                        <Link href={`/token/${pos.mint}`} className="text-accent-blue hover:underline font-mono">
                          {pos.mint.slice(0, 6)}..{pos.mint.slice(-4)}
                        </Link>
                      </td>
                      <td className="text-right px-3 py-2 font-mono">{formatNumber(pos.qty, 4)}</td>
                      <td className="text-right px-3 py-2 font-mono text-text-secondary">{formatPrice(pos.avgEntryPrice)}</td>
                      <td className="text-right px-3 py-2 font-mono">{formatPrice(pos.currentPrice)}</td>
                      <td className="text-right px-3 py-2 font-mono">{formatUSD(pos.value)}</td>
                      <td className={`text-right px-3 py-2 font-mono font-bold ${pos.unrealizedPnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                        {formatPnl(pos.unrealizedPnl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div>
          {!tradesData?.trades || tradesData.trades.length === 0 ? (
            <div className="rounded border border-border bg-bg-card p-8 text-center text-text-muted text-xs">
              No trades yet.
            </div>
          ) : (
            <div className="rounded border border-border bg-bg-card overflow-hidden">
              <table className="w-full text-[11px]" aria-label="Trade history">
                <thead>
                  <tr className="border-b border-border bg-bg-secondary">
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted">Time</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted">Token</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted">Side</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-text-muted">Qty</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-text-muted">Price</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-text-muted">Total</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-text-muted">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {tradesData.trades.map((trade) => (
                    <tr key={trade.id} className="border-b border-border/30 hover:bg-bg-tertiary/20 transition-colors">
                      <td className="px-3 py-2 text-text-muted">{timeAgo(trade.timestamp)}</td>
                      <td className="px-3 py-2">
                        <Link href={`/token/${trade.mint}`} className="text-accent-blue hover:underline font-mono">
                          {trade.mint.slice(0, 6)}..{trade.mint.slice(-4)}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          trade.side === "buy"
                            ? "bg-accent-green/15 text-accent-green"
                            : "bg-accent-red/15 text-accent-red"
                        }`}>
                          {trade.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="text-right px-3 py-2 font-mono">{formatNumber(trade.qty, 4)}</td>
                      <td className="text-right px-3 py-2 font-mono text-text-secondary">{formatPrice(trade.price)}</td>
                      <td className={`text-right px-3 py-2 font-mono font-semibold ${
                        trade.side === "buy" ? "text-accent-red" : "text-accent-green"
                      }`}>
                        {trade.side === "buy" ? "-" : "+"}{formatUSD(trade.qty * trade.price)}
                      </td>
                      <td className="text-right px-3 py-2 font-mono text-text-muted">{formatUSD(trade.fee)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
