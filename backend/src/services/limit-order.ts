import { prisma } from "../lib/prisma";
import { safeGet, CACHE_KEYS } from "../lib/redis";
import { executeTrade } from "./trade";

export type OrderType = "limit" | "stop_loss" | "take_profit";
export type OrderStatus = "open" | "filled" | "cancelled";

export type TriggerType = "price" | "pnl_percent" | "market_cap";

export interface CreateLimitOrderParams {
  userId: string;
  mint: string;
  side: "buy" | "sell";
  orderType: OrderType;
  qty: number;
  triggerPrice: number;
  triggerType?: TriggerType;
  triggerPnlPercent?: number;
  triggerMarketCap?: number;
  usdcAmount?: number;
  note?: string;
}

export interface LimitOrderResult {
  id: string;
  mint: string;
  side: string;
  orderType: string;
  qty: number;
  triggerPrice: number;
  triggerType: string;
  triggerPnlPercent: number | null;
  triggerMarketCap: number | null;
  usdcAmount: number | null;
  status: string;
  note: string | null;
  createdAt: Date;
}

export async function createLimitOrder(params: CreateLimitOrderParams): Promise<LimitOrderResult> {
  const { userId, mint, side, orderType, qty, triggerPrice, triggerType = "price", triggerPnlPercent, triggerMarketCap, usdcAmount, note } = params;

  if (triggerType === "pnl_percent") {
    if (triggerPnlPercent === undefined || triggerPnlPercent === null) throw new Error("PnL percent is required for pnl_percent trigger.");
  } else if (triggerType === "market_cap") {
    if (!triggerMarketCap || triggerMarketCap <= 0) throw new Error("Target market cap must be positive.");
    if (!usdcAmount || usdcAmount <= 0) throw new Error("USDC amount must be positive.");
  } else {
    if (qty <= 0) throw new Error("Quantity must be positive.");
    if (triggerPrice <= 0) throw new Error("Trigger price must be positive.");
  }

  // Validate the user has enough balance/position for the order
  if (side === "buy") {
    const balance = await prisma.paperBalance.findUnique({
      where: { userId_currency: { userId, currency: "USDC" } },
    });
    const estimatedCost = qty * triggerPrice * 1.002; // include ~fee buffer
    if (!balance || balance.amount < estimatedCost) {
      throw new Error("Insufficient USDC balance for this order.");
    }
  } else {
    const position = await prisma.position.findUnique({
      where: { userId_mint: { userId, mint } },
    });
    if (!position || position.qty < qty) {
      throw new Error("Insufficient token balance for this order.");
    }
  }

  const order = await prisma.limitOrder.create({
    data: {
      userId,
      mint,
      side,
      orderType,
      qty: triggerType === "market_cap" ? 0 : qty,
      triggerPrice: triggerType === "pnl_percent" ? 0 : triggerPrice,
      triggerType,
      triggerPnlPercent: triggerPnlPercent ?? null,
      triggerMarketCap: triggerMarketCap ?? null,
      usdcAmount: usdcAmount ?? null,
      note: note || null,
      status: "open",
    },
  });

  return {
    id: order.id,
    mint: order.mint,
    side: order.side,
    orderType: order.orderType,
    qty: order.qty,
    triggerPrice: order.triggerPrice,
    triggerType: order.triggerType,
    triggerPnlPercent: order.triggerPnlPercent,
    triggerMarketCap: order.triggerMarketCap,
    usdcAmount: order.usdcAmount,
    status: order.status,
    note: order.note,
    createdAt: order.createdAt,
  };
}

export async function cancelLimitOrder(userId: string, orderId: string): Promise<void> {
  const order = await prisma.limitOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found.");
  if (order.userId !== userId) throw new Error("Unauthorized.");
  if (order.status !== "open") throw new Error("Order is not open.");

  await prisma.limitOrder.update({
    where: { id: orderId },
    data: { status: "cancelled" },
  });
}

export async function getUserLimitOrders(userId: string, status?: OrderStatus) {
  const where: Record<string, unknown> = { userId };
  if (status) where.status = status;

  try {
    return await prisma.limitOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("does not exist")) {
      return [];
    }
    throw err;
  }
}

/**
 * Check all open limit orders against current prices and execute any that trigger.
 * Called by the price poller on each tick.
 */
export async function checkAndFillLimitOrders(): Promise<number> {
  let openOrders;
  try {
    openOrders = await prisma.limitOrder.findMany({
      where: { status: "open" },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("does not exist")) {
      return 0;
    }
    throw err;
  }

  if (openOrders.length === 0) return 0;

  let filledCount = 0;

  for (const order of openOrders) {
    try {
      const cachedPrice = await safeGet(CACHE_KEYS.tokenPrice(order.mint));
      if (!cachedPrice) continue;
      const currentPrice = parseFloat(cachedPrice);
      if (currentPrice <= 0) continue;

      let shouldFill = false;
      const tType = (order as Record<string, unknown>).triggerType as string || "price";

      if (tType === "pnl_percent") {
        // PnL% trigger: check current PnL% against user's position avg entry
        const pnlTarget = (order as Record<string, unknown>).triggerPnlPercent as number | null;
        if (pnlTarget === null || pnlTarget === undefined) continue;
        const position = await prisma.position.findUnique({
          where: { userId_mint: { userId: order.userId, mint: order.mint } },
        });
        if (!position || position.qty <= 0 || position.avgEntryPrice <= 0) continue;
        const currentPnlPct = ((currentPrice - position.avgEntryPrice) / position.avgEntryPrice) * 100;

        if (order.orderType === "stop_loss") {
          // SL: trigger when PnL% drops to or below target (negative target like -10)
          if (currentPnlPct <= pnlTarget) shouldFill = true;
        } else if (order.orderType === "take_profit") {
          // TP: trigger when PnL% rises to or above target (positive target like +20)
          if (currentPnlPct >= pnlTarget) shouldFill = true;
        }
      } else if (tType === "market_cap") {
        // Market cap trigger: check current market cap against target
        const targetMcap = (order as Record<string, unknown>).triggerMarketCap as number | null;
        if (!targetMcap || targetMcap <= 0) continue;
        // Estimate current market cap from cached token info
        const cachedInfo = await safeGet(CACHE_KEYS.tokenInfo(order.mint));
        if (!cachedInfo) continue;
        const tokenInfo = JSON.parse(cachedInfo);
        const currentMcap = tokenInfo.marketCap || 0;
        if (currentMcap <= 0) continue;

        if (order.side === "buy" && currentMcap <= targetMcap) shouldFill = true;
        if (order.side === "sell" && currentMcap >= targetMcap) shouldFill = true;
      } else {
        // Standard price-based triggers
        switch (order.orderType) {
          case "limit":
            if (order.side === "buy" && currentPrice <= order.triggerPrice) shouldFill = true;
            if (order.side === "sell" && currentPrice >= order.triggerPrice) shouldFill = true;
            break;
          case "stop_loss":
            if (order.side === "sell" && currentPrice <= order.triggerPrice) shouldFill = true;
            if (order.side === "buy" && currentPrice >= order.triggerPrice) shouldFill = true;
            break;
          case "take_profit":
            if (order.side === "sell" && currentPrice >= order.triggerPrice) shouldFill = true;
            if (order.side === "buy" && currentPrice <= order.triggerPrice) shouldFill = true;
            break;
        }
      }

      if (shouldFill) {
        let tradeAmount: number;
        if (tType === "market_cap") {
          // For market cap orders, use the stored USDC amount
          const usdcAmt = (order as Record<string, unknown>).usdcAmount as number | null;
          tradeAmount = order.side === "buy" ? (usdcAmt || 0) : order.qty;
        } else if (tType === "pnl_percent") {
          // For PnL% orders, sell the full qty
          tradeAmount = order.qty;
        } else {
          tradeAmount = order.side === "buy"
            ? order.qty * order.triggerPrice
            : order.qty;
        }

        await executeTrade(order.userId, order.mint, tradeAmount, order.side as "buy" | "sell");

        await prisma.limitOrder.update({
          where: { id: order.id },
          data: {
            status: "filled",
            filledAt: new Date(),
            filledPrice: currentPrice,
          },
        });

        filledCount++;
      }
    } catch (err) {
      // If execution fails (e.g., insufficient balance), cancel the order
      console.error(`Failed to fill limit order ${order.id}:`, err);
      await prisma.limitOrder.update({
        where: { id: order.id },
        data: { status: "cancelled" },
      }).catch(() => {});
    }
  }

  return filledCount;
}
