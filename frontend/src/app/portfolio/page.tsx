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
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="h-14 w-14 rounded-2xl bg-bg-tertiary border border-border flex items-center justify-center">
          <svg className="w-7 h-7 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 6v3" />
          </svg>
        </div>
        <div className="text-center">
          <span className="text-sm font-bold block">Connect Wallet</span>
          <span className="text-[11px] text-text-muted mt-1 block">Connect your wallet to view your portfolio</span>
        </div>
      </div>
    );
  }

  if (isLoading || !portfolio) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 border-2 border-accent-green border-t-transparent rounded-full animate-spin" />
          <div className="text-text-muted text-[11px]">Loading portfolio...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-3 pb-6 page-enter">
      {/* Top: Balance Overview + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3 mb-4">
        {/* Left: Wallet Balance */}
        <div className="rounded-xl border border-border bg-bg-card p-4">
          <div className="text-[9px] text-text-muted uppercase tracking-widest font-bold mb-1.5">Total Balance</div>
          <div className="text-2xl font-bold font-mono text-text-primary">{formatUSD(portfolio.totalValue)}</div>
          <div className="flex items-center gap-5 mt-3">
            <div>
              <span className="text-[9px] text-text-muted uppercase tracking-wider block">Paper USDC</span>
              <div className="text-sm font-mono text-text-primary font-semibold">{formatUSD(portfolio.usdcBalance)}</div>
            </div>
            <div className="w-px h-8 bg-border" />
            <div>
              <span className="text-[9px] text-text-muted uppercase tracking-wider block">Positions</span>
              <div className="text-sm font-mono text-text-primary font-semibold">{portfolio.positions.length}</div>
            </div>
          </div>
        </div>

        {/* Right: PnL Stats */}
        <div className="rounded-xl border border-border bg-bg-card p-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="text-[9px] text-text-muted uppercase tracking-wider block">Total PnL</span>
              <div className={`text-base font-bold font-mono ${portfolio.overallPnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                {formatPnl(portfolio.overallPnl)}
              </div>
            </div>
            <div>
              <span className="text-[9px] text-text-muted uppercase tracking-wider block">24h PnL</span>
              <div className={`text-base font-bold font-mono ${portfolio.pnl24h >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                {formatPnl(portfolio.pnl24h)}
              </div>
            </div>
            <div>
              <span className="text-[9px] text-text-muted uppercase tracking-wider block">ROI</span>
              <div className={`text-base font-bold font-mono ${portfolio.roi >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                {formatPercent(portfolio.roi)}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-text-muted uppercase tracking-wider">Unrealized Profits</span>
              <span className={`text-xs font-bold font-mono ${portfolio.overallPnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                {formatPnl(portfolio.overallPnl)}
              </span>
            </div>
            <div className="mt-1.5 h-1 bg-bg-tertiary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${portfolio.overallPnl >= 0 ? "bg-accent-green" : "bg-accent-red"}`}
                style={{ width: `${Math.min(Math.abs(portfolio.roi), 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-0 border-b border-border mb-4">
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
              className={`px-4 py-2.5 text-[11px] font-bold transition-all border-b-2 uppercase tracking-wider ${
                tab === t
                  ? "border-accent-green text-accent-green"
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
            <div className="rounded-xl border border-border bg-bg-card p-10 text-center">
              <div className="text-text-muted text-[11px]">No open positions</div>
              <Link href="/" className="text-[10px] text-accent-green hover:underline mt-2 inline-block">Browse tokens</Link>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
              <table className="w-full text-[11px]" aria-label="Open positions">
                <thead>
                  <tr className="border-b border-border bg-bg-secondary">
                    <th className="text-left px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Token</th>
                    <th className="text-right px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Qty</th>
                    <th className="text-right px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Avg Entry</th>
                    <th className="text-right px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Price</th>
                    <th className="text-right px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Value</th>
                    <th className="text-right px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.positions.map((pos) => (
                    <tr key={pos.mint} className="dex-row border-b border-border/30">
                      <td className="px-4 py-2.5">
                        <Link href={`/token/${pos.mint}`} className="text-accent-blue hover:text-accent-green font-mono transition-colors">
                          {pos.mint.slice(0, 6)}..{pos.mint.slice(-4)}
                        </Link>
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono">{formatNumber(pos.qty, 4)}</td>
                      <td className="text-right px-4 py-2.5 font-mono text-text-secondary">{formatPrice(pos.avgEntryPrice)}</td>
                      <td className="text-right px-4 py-2.5 font-mono">{formatPrice(pos.currentPrice)}</td>
                      <td className="text-right px-4 py-2.5 font-mono">{formatUSD(pos.value)}</td>
                      <td className={`text-right px-4 py-2.5 font-mono font-bold ${pos.unrealizedPnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
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
            <div className="rounded-xl border border-border bg-bg-card p-10 text-center text-text-muted text-[11px]">
              No trades yet.
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
              <table className="w-full text-[11px]" aria-label="Trade history">
                <thead>
                  <tr className="border-b border-border bg-bg-secondary">
                    <th className="text-left px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Time</th>
                    <th className="text-left px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Token</th>
                    <th className="text-left px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Side</th>
                    <th className="text-right px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Qty</th>
                    <th className="text-right px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Price</th>
                    <th className="text-right px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Total</th>
                    <th className="text-right px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {tradesData.trades.map((trade) => (
                    <tr key={trade.id} className="dex-row border-b border-border/30">
                      <td className="px-4 py-2.5 text-text-muted">{timeAgo(trade.timestamp)}</td>
                      <td className="px-4 py-2.5">
                        <Link href={`/token/${trade.mint}`} className="text-accent-blue hover:text-accent-green font-mono transition-colors">
                          {trade.mint.slice(0, 6)}..{trade.mint.slice(-4)}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded-md ${
                          trade.side === "buy"
                            ? "bg-accent-green/10 text-accent-green border border-accent-green/20"
                            : "bg-accent-red/10 text-accent-red border border-accent-red/20"
                        }`}>
                          {trade.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono">{formatNumber(trade.qty, 4)}</td>
                      <td className="text-right px-4 py-2.5 font-mono text-text-secondary">{formatPrice(trade.price)}</td>
                      <td className={`text-right px-4 py-2.5 font-mono font-semibold ${
                        trade.side === "buy" ? "text-accent-red" : "text-accent-green"
                      }`}>
                        {trade.side === "buy" ? "-" : "+"}{formatUSD(trade.qty * trade.price)}
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono text-text-muted">{formatUSD(trade.fee)}</td>
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
            <div className="rounded-xl border border-border bg-bg-card p-10 text-center text-text-muted text-[11px]">
              No orders yet. Place limit orders, stop-losses, or take-profits from any token page.
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
              <table className="w-full text-[11px]" aria-label="Limit orders">
                <thead>
                  <tr className="border-b border-border bg-bg-secondary">
                    <th className="text-left px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Type</th>
                    <th className="text-left px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Side</th>
                    <th className="text-left px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Token</th>
                    <th className="text-right px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Qty</th>
                    <th className="text-right px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Trigger</th>
                    <th className="text-center px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Status</th>
                    <th className="text-right px-4 py-2.5 text-[9px] font-bold text-text-muted uppercase tracking-wider">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersData.orders.map((order) => (
                    <tr key={order.id} className="dex-row border-b border-border/30">
                      <td className="px-4 py-2.5">
                        <span className="text-[8px] font-bold px-2 py-0.5 rounded-md bg-bg-tertiary text-text-secondary border border-border/50">
                          {order.orderType === "limit" ? "LIMIT" : order.orderType === "stop_loss" ? "STOP" : "TP"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded-md ${
                          order.side === "buy" ? "bg-accent-green/10 text-accent-green border border-accent-green/20" : "bg-accent-red/10 text-accent-red border border-accent-red/20"
                        }`}>
                          {order.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Link href={`/token/${order.mint}`} className="text-accent-blue hover:text-accent-green font-mono transition-colors">
                          {shortenAddress(order.mint, 4)}
                        </Link>
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono">{formatNumber(order.qty, 4)}</td>
                      <td className="text-right px-4 py-2.5 font-mono text-text-secondary">{formatPrice(order.triggerPrice)}</td>
                      <td className="text-center px-4 py-2.5">
                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded-md ${
                          order.status === "open" ? "bg-accent-blue/10 text-accent-blue border border-accent-blue/20" :
                          order.status === "filled" ? "bg-accent-green/10 text-accent-green border border-accent-green/20" :
                          "bg-accent-red/10 text-accent-red border border-accent-red/20"
                        }`}>
                          {order.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="text-right px-4 py-2.5 text-text-muted">{timeAgo(order.createdAt)}</td>
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
            <div className="rounded-xl border border-border bg-bg-card p-10 text-center">
              <div className="h-6 w-6 border-2 border-accent-green border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <div className="text-text-muted text-[11px]">Loading analytics...</div>
            </div>
          ) : analytics.totalTrades === 0 ? (
            <div className="rounded-xl border border-border bg-bg-card p-10 text-center text-text-muted text-[11px]">
              Complete some trades to see analytics.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <AnalyticsCard
                  label="Win Rate"
                  value={`${analytics.winRate.toFixed(1)}%`}
                  sub={`${analytics.winCount}W / ${analytics.lossCount}L`}
                  color={analytics.winRate >= 50 ? "green" : "red"}
                  large
                />
                <AnalyticsCard
                  label="Sharpe Ratio"
                  value={analytics.sharpeRatio.toFixed(2)}
                  sub="Annualized"
                  color={analytics.sharpeRatio >= 1 ? "green" : analytics.sharpeRatio >= 0 ? "yellow" : "red"}
                  large
                />
                <AnalyticsCard
                  label="Max Drawdown"
                  value={formatUSD(analytics.maxDrawdown)}
                  sub="Peak to trough"
                  color="red"
                  large
                />
                <AnalyticsCard
                  label="Profit Factor"
                  value={analytics.profitFactor === Infinity ? "inf" : analytics.profitFactor.toFixed(2)}
                  sub="Wins / Losses"
                  color={analytics.profitFactor >= 1 ? "green" : "red"}
                  large
                />
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <AnalyticsCard label="Total Trades" value={String(analytics.totalTrades)} />
                <AnalyticsCard label="Avg Win" value={formatUSD(analytics.avgWin)} color="green" />
                <AnalyticsCard label="Avg Loss" value={formatUSD(analytics.avgLoss)} color="red" />
                <div className="rounded-xl border border-border bg-bg-card p-3">
                  <div className="text-[8px] text-text-muted uppercase tracking-widest font-bold">Best / Worst</div>
                  <div className="flex items-center gap-2 mt-1">
                    {analytics.bestTrade && (
                      <span className="text-[11px] font-mono text-accent-green font-bold">{formatPnl(analytics.bestTrade.pnl)}</span>
                    )}
                    <span className="text-text-muted">/</span>
                    {analytics.worstTrade && (
                      <span className="text-[11px] font-mono text-accent-red font-bold">{formatPnl(analytics.worstTrade.pnl)}</span>
                    )}
                  </div>
                </div>
              </div>

              {analytics.dailyPnl.length > 0 && (
                <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-border bg-bg-secondary">
                    <h3 className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Daily P&L</h3>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-border/50 sticky top-0 bg-bg-card">
                          <th className="text-left px-4 py-2 text-[8px] font-bold text-text-muted uppercase tracking-wider">Date</th>
                          <th className="text-right px-4 py-2 text-[8px] font-bold text-text-muted uppercase tracking-wider">Daily P&L</th>
                          <th className="text-right px-4 py-2 text-[8px] font-bold text-text-muted uppercase tracking-wider">Cumulative</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...analytics.dailyPnl].reverse().map((d) => (
                          <tr key={d.date} className="dex-row border-b border-border/20">
                            <td className="px-4 py-2 font-mono text-text-secondary">{d.date}</td>
                            <td className={`text-right px-4 py-2 font-mono font-bold ${d.pnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                              {formatPnl(d.pnl)}
                            </td>
                            <td className={`text-right px-4 py-2 font-mono ${d.cumulative >= 0 ? "text-accent-green" : "text-accent-red"}`}>
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

function AnalyticsCard({ label, value, sub, color, large }: { label: string; value: string; sub?: string; color?: "green" | "red" | "yellow"; large?: boolean }) {
  const colorClass = color === "green" ? "text-accent-green" : color === "red" ? "text-accent-red" : color === "yellow" ? "text-accent-yellow" : "text-text-primary";
  return (
    <div className="rounded-xl border border-border bg-bg-card p-3">
      <div className="text-[8px] text-text-muted uppercase tracking-widest font-bold">{label}</div>
      <div className={`${large ? "text-lg" : "text-sm"} font-bold font-mono ${colorClass} mt-0.5`}>{value}</div>
      {sub && <div className="text-[9px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
