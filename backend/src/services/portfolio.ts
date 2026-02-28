import { prisma } from "../lib/prisma";
import { safeGet, CACHE_KEYS } from "../lib/redis";

export interface PortfolioSummary {
  totalValue: number;
  pnl24h: number;
  overallPnl: number;
  roi: number;
  usdcBalance: number;
  positions: PositionWithPrice[];
}

export interface PositionWithPrice {
  mint: string;
  symbol?: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  value: number;
}

export async function getPortfolio(userId: string): Promise<PortfolioSummary> {
  const [balances, positions, trades] = await Promise.all([
    prisma.paperBalance.findMany({ where: { userId } }),
    prisma.position.findMany({ where: { userId } }),
    prisma.trade.findMany({
      where: {
        userId,
        timestamp: { gte: new Date(Date.now() - 86400000) },
      },
    }),
  ]);

  const usdcBalance = Number(balances.find((b) => b.currency === "USDC")?.amount ?? 0);

  const positionsWithPrice: PositionWithPrice[] = await Promise.all(
    positions.map(async (pos) => {
      const cached = await safeGet(CACHE_KEYS.tokenPrice(pos.mint));
      const currentPrice = cached ? parseFloat(cached) : Number(pos.avgEntryPrice);
      const qty = Number(pos.qty);
      const avgEntryPrice = Number(pos.avgEntryPrice);
      const unrealizedPnl = (currentPrice - avgEntryPrice) * qty;
      const value = qty * currentPrice;

      return {
        mint: pos.mint,
        qty,
        avgEntryPrice,
        currentPrice,
        unrealizedPnl,
        realizedPnl: Number(pos.realizedPnl),
        value,
      };
    })
  );

  const totalPositionValue = positionsWithPrice.reduce((sum, p) => sum + p.value, 0);
  const totalValue = usdcBalance + totalPositionValue;
  const totalUnrealizedPnl = positionsWithPrice.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const totalRealizedPnl = positionsWithPrice.reduce((sum, p) => sum + p.realizedPnl, 0);
  const overallPnl = totalUnrealizedPnl + totalRealizedPnl;

  // 24h P&L: sum of (proceeds - cost) for completed sell trades, minus fees on buys
  const pnl24h = trades.reduce((sum, t) => {
    const proceeds = Number(t.qty) * Number(t.price);
    const fee = Number(t.fee);
    if (t.side === "sell") {
      return sum + proceeds - fee;
    }
    return sum - proceeds - fee;
  }, 0);

  const initialBalance = 10000;
  const roi = initialBalance > 0 ? ((totalValue - initialBalance) / initialBalance) * 100 : 0;

  return {
    totalValue,
    pnl24h,
    overallPnl,
    roi,
    usdcBalance,
    positions: positionsWithPrice,
  };
}

export async function getTradeHistory(userId: string, limit = 50, offset = 0) {
  return prisma.trade.findMany({
    where: { userId },
    orderBy: { timestamp: "desc" },
    take: limit,
    skip: offset,
  });
}

// ──────────── Portfolio Analytics ────────────

export interface PortfolioAnalytics {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  bestTrade: { mint: string; pnl: number; date: string } | null;
  worstTrade: { mint: string; pnl: number; date: string } | null;
  dailyPnl: { date: string; pnl: number; cumulative: number }[];
}

export async function getPortfolioAnalytics(userId: string): Promise<PortfolioAnalytics> {
  const allTrades = await prisma.trade.findMany({
    where: { userId },
    orderBy: { timestamp: "asc" },
  });

  if (allTrades.length === 0) {
    return {
      totalTrades: 0, winCount: 0, lossCount: 0, winRate: 0,
      avgWin: 0, avgLoss: 0, profitFactor: 0, maxDrawdown: 0, sharpeRatio: 0,
      bestTrade: null, worstTrade: null, dailyPnl: [],
    };
  }

  // Group trades by mint to compute per-trade P&L
  // For each sell, compute realized P&L against avg entry
  const positionMap = new Map<string, { qty: number; cost: number }>();
  const tradePnls: { pnl: number; mint: string; date: string }[] = [];

  for (const trade of allTrades) {
    const qty = Number(trade.qty);
    const price = Number(trade.price);
    const fee = Number(trade.fee);

    if (trade.side === "buy") {
      const existing = positionMap.get(trade.mint) || { qty: 0, cost: 0 };
      existing.qty += qty;
      existing.cost += qty * price + fee;
      positionMap.set(trade.mint, existing);
    } else {
      // sell
      const existing = positionMap.get(trade.mint);
      if (existing && existing.qty > 0) {
        const avgCost = existing.cost / existing.qty;
        const pnl = (price - avgCost) * qty - fee;
        tradePnls.push({
          pnl,
          mint: trade.mint,
          date: trade.timestamp.toISOString().split("T")[0],
        });
        existing.qty -= qty;
        existing.cost = existing.qty > 0 ? existing.qty * avgCost : 0;
      }
    }
  }

  const wins = tradePnls.filter((t) => t.pnl > 0);
  const losses = tradePnls.filter((t) => t.pnl <= 0);
  const winCount = wins.length;
  const lossCount = losses.length;
  const totalTrades = tradePnls.length;
  const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;

  const totalWin = wins.reduce((s, t) => s + t.pnl, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const avgWin = winCount > 0 ? totalWin / winCount : 0;
  const avgLoss = lossCount > 0 ? totalLoss / lossCount : 0;
  const profitFactor = totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0;

  // Daily P&L aggregation
  const dailyMap = new Map<string, number>();
  for (const t of tradePnls) {
    dailyMap.set(t.date, (dailyMap.get(t.date) || 0) + t.pnl);
  }
  const sortedDays = Array.from(dailyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  let cumulative = 0;
  const dailyPnl = sortedDays.map(([date, pnl]) => {
    cumulative += pnl;
    return { date, pnl, cumulative };
  });

  // Max drawdown from cumulative P&L
  let peak = 0;
  let maxDrawdown = 0;
  for (const d of dailyPnl) {
    if (d.cumulative > peak) peak = d.cumulative;
    const dd = peak - d.cumulative;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Sharpe ratio (annualized, assuming 365 trading days)
  const dailyReturns = sortedDays.map(([, pnl]) => pnl);
  const meanReturn = dailyReturns.length > 0
    ? dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
    : 0;
  const variance = dailyReturns.length > 1
    ? dailyReturns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / (dailyReturns.length - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(365) : 0;

  // Best / worst trade
  const sorted = [...tradePnls].sort((a, b) => b.pnl - a.pnl);
  const bestTrade = sorted.length > 0 ? sorted[0] : null;
  const worstTrade = sorted.length > 0 ? sorted[sorted.length - 1] : null;

  return {
    totalTrades,
    winCount,
    lossCount,
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    maxDrawdown,
    sharpeRatio,
    bestTrade,
    worstTrade,
    dailyPnl,
  };
}
