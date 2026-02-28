"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { api, PortfolioAnalytics, LimitOrderResult } from "@/lib/api";
import { formatUSD, formatPnl, formatPercent, formatPrice, formatNumber, timeAgo, shortenAddress } from "@/lib/format";
import Link from "next/link";

type Tab = "holding" | "history" | "analytics" | "orders";

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

  const { data: analytics } = useQuery({
    queryKey: ["portfolioAnalytics"],
    queryFn: () => api.portfolio.getAnalytics(),
    enabled: isAuthenticated && tab === "analytics",
    staleTime: 30_000,
  });

  const { data: ordersData } = useQuery({
    queryKey: ["limitOrders"],
    queryFn: () => api.orders.getAll(),
    enabled: isAuthenticated,
    refetchInterval: 10_000,
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
        {(["holding", "history", "orders", "analytics"] as Tab[]).map((t) => {
          const labels: Record<Tab, string> = {
            holding: `Holding (${portfolio.positions.length})`,
            history: `History (${tradesData?.trades?.length || 0})`,
            orders: `Orders (${ordersData?.orders?.length || 0})`,
            analytics: "Analytics",
          };
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 ${
                tab === t
                  ? "border-accent-green text-text-primary"
                  : "border-transparent text-text-muted hover:text-text-secondary"
              }`}
            >
              {labels[t]}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {tab === "holding" && (
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
      )}

      {tab === "history" && (
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

      {tab === "orders" && (
        <div>
          {!ordersData?.orders || ordersData.orders.length === 0 ? (
            <div className="rounded border border-border bg-bg-card p-8 text-center text-text-muted text-xs">
              No orders yet. Place limit orders, stop-losses, or take-profits from any token page.
            </div>
          ) : (
            <div className="rounded border border-border bg-bg-card overflow-hidden">
              <table className="w-full text-[11px]" aria-label="Limit orders">
                <thead>
                  <tr className="border-b border-border bg-bg-secondary">
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted">Type</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted">Side</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted">Token</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-text-muted">Qty</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-text-muted">Trigger</th>
                    <th className="text-center px-3 py-2 text-[10px] font-semibold text-text-muted">Status</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-text-muted">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersData.orders.map((order) => (
                    <tr key={order.id} className="border-b border-border/30 hover:bg-bg-tertiary/20 transition-colors">
                      <td className="px-3 py-2">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary">
                          {order.orderType === "limit" ? "LIMIT" : order.orderType === "stop_loss" ? "STOP" : "TP"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          order.side === "buy" ? "bg-accent-green/15 text-accent-green" : "bg-accent-red/15 text-accent-red"
                        }`}>
                          {order.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/token/${order.mint}`} className="text-accent-blue hover:underline font-mono">
                          {shortenAddress(order.mint, 4)}
                        </Link>
                      </td>
                      <td className="text-right px-3 py-2 font-mono">{formatNumber(order.qty, 4)}</td>
                      <td className="text-right px-3 py-2 font-mono text-text-secondary">{formatPrice(order.triggerPrice)}</td>
                      <td className="text-center px-3 py-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          order.status === "open" ? "bg-accent-blue/15 text-accent-blue" :
                          order.status === "filled" ? "bg-accent-green/15 text-accent-green" :
                          "bg-accent-red/15 text-accent-red"
                        }`}>
                          {order.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="text-right px-3 py-2 text-text-muted">{timeAgo(order.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "analytics" && (
        <div>
          {!analytics ? (
            <div className="rounded border border-border bg-bg-card p-8 text-center">
              <div className="h-6 w-6 border-2 border-accent-green border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <div className="text-text-muted text-xs">Loading analytics...</div>
            </div>
          ) : analytics.totalTrades === 0 ? (
            <div className="rounded border border-border bg-bg-card p-8 text-center text-text-muted text-xs">
              Complete some trades to see analytics.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Key metrics row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded border border-border bg-bg-card p-3">
                  <div className="text-[9px] text-text-muted uppercase tracking-wider">Win Rate</div>
                  <div className={`text-lg font-bold font-mono ${analytics.winRate >= 50 ? "text-accent-green" : "text-accent-red"}`}>
                    {analytics.winRate.toFixed(1)}%
                  </div>
                  <div className="text-[9px] text-text-muted mt-0.5">
                    {analytics.winCount}W / {analytics.lossCount}L
                  </div>
                </div>
                <div className="rounded border border-border bg-bg-card p-3">
                  <div className="text-[9px] text-text-muted uppercase tracking-wider">Sharpe Ratio</div>
                  <div className={`text-lg font-bold font-mono ${analytics.sharpeRatio >= 1 ? "text-accent-green" : analytics.sharpeRatio >= 0 ? "text-accent-yellow" : "text-accent-red"}`}>
                    {analytics.sharpeRatio.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-text-muted mt-0.5">Annualized</div>
                </div>
                <div className="rounded border border-border bg-bg-card p-3">
                  <div className="text-[9px] text-text-muted uppercase tracking-wider">Max Drawdown</div>
                  <div className="text-lg font-bold font-mono text-accent-red">
                    {formatUSD(analytics.maxDrawdown)}
                  </div>
                  <div className="text-[9px] text-text-muted mt-0.5">Peak to trough</div>
                </div>
                <div className="rounded border border-border bg-bg-card p-3">
                  <div className="text-[9px] text-text-muted uppercase tracking-wider">Profit Factor</div>
                  <div className={`text-lg font-bold font-mono ${analytics.profitFactor >= 1 ? "text-accent-green" : "text-accent-red"}`}>
                    {analytics.profitFactor === Infinity ? "∞" : analytics.profitFactor.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-text-muted mt-0.5">Wins / Losses</div>
                </div>
              </div>

              {/* Second row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded border border-border bg-bg-card p-3">
                  <div className="text-[9px] text-text-muted uppercase tracking-wider">Total Trades</div>
                  <div className="text-sm font-bold font-mono text-text-primary">{analytics.totalTrades}</div>
                </div>
                <div className="rounded border border-border bg-bg-card p-3">
                  <div className="text-[9px] text-text-muted uppercase tracking-wider">Avg Win</div>
                  <div className="text-sm font-bold font-mono text-accent-green">{formatUSD(analytics.avgWin)}</div>
                </div>
                <div className="rounded border border-border bg-bg-card p-3">
                  <div className="text-[9px] text-text-muted uppercase tracking-wider">Avg Loss</div>
                  <div className="text-sm font-bold font-mono text-accent-red">{formatUSD(analytics.avgLoss)}</div>
                </div>
                <div className="rounded border border-border bg-bg-card p-3">
                  <div className="text-[9px] text-text-muted uppercase tracking-wider">Best / Worst</div>
                  <div className="flex items-center gap-2">
                    {analytics.bestTrade && (
                      <span className="text-[10px] font-mono text-accent-green">{formatPnl(analytics.bestTrade.pnl)}</span>
                    )}
                    <span className="text-text-muted">/</span>
                    {analytics.worstTrade && (
                      <span className="text-[10px] font-mono text-accent-red">{formatPnl(analytics.worstTrade.pnl)}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Daily P&L Table */}
              {analytics.dailyPnl.length > 0 && (
                <div className="rounded border border-border bg-bg-card overflow-hidden">
                  <div className="px-3 py-2 border-b border-border bg-bg-secondary">
                    <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Daily P&L</h3>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto scrollbar-thin">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-border/50 sticky top-0 bg-bg-card">
                          <th className="text-left px-3 py-1.5 text-[9px] font-semibold text-text-muted">Date</th>
                          <th className="text-right px-3 py-1.5 text-[9px] font-semibold text-text-muted">Daily P&L</th>
                          <th className="text-right px-3 py-1.5 text-[9px] font-semibold text-text-muted">Cumulative</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...analytics.dailyPnl].reverse().map((d) => (
                          <tr key={d.date} className="border-b border-border/20 hover:bg-bg-tertiary/20">
                            <td className="px-3 py-1.5 font-mono text-text-secondary">{d.date}</td>
                            <td className={`text-right px-3 py-1.5 font-mono font-semibold ${d.pnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                              {formatPnl(d.pnl)}
                            </td>
                            <td className={`text-right px-3 py-1.5 font-mono ${d.cumulative >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                              {formatPnl(d.cumulative)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
