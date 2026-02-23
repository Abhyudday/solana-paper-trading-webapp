import { prisma } from "../lib/prisma";
import { redis, CACHE_KEYS } from "../lib/redis";

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
      const cached = await redis.get(CACHE_KEYS.tokenPrice(pos.mint));
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
