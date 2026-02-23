"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { formatUSD, formatPnl, formatPercent, formatPrice, formatNumber, timeAgo } from "@/lib/format";
import Link from "next/link";

export default function PortfolioPage() {
  const { isAuthenticated } = useAuth();

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
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <h2 className="text-xl font-bold">Connect your wallet to view your portfolio</h2>
        <p className="text-text-secondary">Use the Connect Wallet button in the navigation bar.</p>
      </div>
    );
  }

  if (isLoading || !portfolio) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-text-muted">Loading portfolio...</div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <h1 className="text-2xl font-bold mb-6">Portfolio</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <SummaryCard label="Total Value" value={formatUSD(portfolio.totalValue)} />
        <SummaryCard
          label="24h P&L"
          value={formatPnl(portfolio.pnl24h)}
          color={portfolio.pnl24h >= 0 ? "green" : "red"}
        />
        <SummaryCard
          label="Overall P&L"
          value={formatPnl(portfolio.overallPnl)}
          color={portfolio.overallPnl >= 0 ? "green" : "red"}
        />
        <SummaryCard
          label="ROI"
          value={formatPercent(portfolio.roi)}
          color={portfolio.roi >= 0 ? "green" : "red"}
        />
      </div>

      {/* USDC Balance */}
      <div className="mb-8 rounded-lg border border-border bg-bg-secondary p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">Paper USDC Balance</span>
          <span className="text-lg font-bold font-mono">{formatUSD(portfolio.usdcBalance)}</span>
        </div>
      </div>

      {/* Open Positions */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">Open Positions</h2>
        {portfolio.positions.length === 0 ? (
          <div className="rounded-lg border border-border bg-bg-secondary p-8 text-center text-text-muted">
            No open positions. Search for a token to start trading.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-bg-secondary overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Open positions">
                <thead>
                  <tr className="border-b border-border bg-bg-tertiary/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted">Token</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-text-muted">Qty</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-text-muted">Avg Entry</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-text-muted">Current Price</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-text-muted">Value</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-text-muted">Unrealized P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.positions.map((pos) => (
                    <tr key={pos.mint} className="border-b border-border/50 hover:bg-bg-tertiary/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/token/${pos.mint}`} className="text-accent-blue hover:underline font-mono text-xs">
                          {pos.mint.slice(0, 8)}...
                        </Link>
                      </td>
                      <td className="text-right px-4 py-3 font-mono">{formatNumber(pos.qty, 4)}</td>
                      <td className="text-right px-4 py-3 font-mono">{formatPrice(pos.avgEntryPrice)}</td>
                      <td className="text-right px-4 py-3 font-mono">{formatPrice(pos.currentPrice)}</td>
                      <td className="text-right px-4 py-3 font-mono">{formatUSD(pos.value)}</td>
                      <td className={`text-right px-4 py-3 font-mono font-bold ${pos.unrealizedPnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                        {formatPnl(pos.unrealizedPnl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Trade History */}
      <section>
        <h2 className="text-lg font-bold mb-3">Trade History</h2>
        {!tradesData?.trades || tradesData.trades.length === 0 ? (
          <div className="rounded-lg border border-border bg-bg-secondary p-8 text-center text-text-muted">
            No trades yet.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-bg-secondary overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Trade history">
                <thead>
                  <tr className="border-b border-border bg-bg-tertiary/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted">Time</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted">Token</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted">Side</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-text-muted">Qty</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-text-muted">Price</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-text-muted">Total (USDC)</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-text-muted">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {tradesData.trades.map((trade) => (
                    <tr key={trade.id} className="border-b border-border/50 hover:bg-bg-tertiary/30 transition-colors">
                      <td className="px-4 py-3 text-text-muted text-xs">{timeAgo(trade.timestamp)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/token/${trade.mint}`} className="text-accent-blue hover:underline font-mono text-xs">
                          {trade.mint.slice(0, 8)}...
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          trade.side === "buy"
                            ? "bg-accent-green/20 text-accent-green"
                            : "bg-accent-red/20 text-accent-red"
                        }`}>
                          {trade.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="text-right px-4 py-3 font-mono">{formatNumber(trade.qty, 4)}</td>
                      <td className="text-right px-4 py-3 font-mono">{formatPrice(trade.price)}</td>
                      <td className={`text-right px-4 py-3 font-mono font-semibold ${
                        trade.side === "buy" ? "text-accent-red" : "text-accent-green"
                      }`}>
                        {trade.side === "buy" ? "-" : "+"}{formatUSD(trade.qty * trade.price)}
                      </td>
                      <td className="text-right px-4 py-3 font-mono text-text-muted">{formatUSD(trade.fee)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color?: "green" | "red" }) {
  const colorClass = color === "green" ? "text-accent-green" : color === "red" ? "text-accent-red" : "text-text-primary";
  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className={`text-lg font-bold font-mono ${colorClass}`}>{value}</div>
    </div>
  );
}
