import { prisma } from "../lib/prisma";
import { safeGet, CACHE_KEYS } from "../lib/redis";
import { executeTrade } from "./trade";

export type OrderType = "limit" | "stop_loss" | "take_profit";
export type OrderStatus = "open" | "filled" | "cancelled";

export interface CreateLimitOrderParams {
  userId: string;
  mint: string;
  side: "buy" | "sell";
  orderType: OrderType;
  qty: number;
  triggerPrice: number;
  note?: string;
}

export interface LimitOrderResult {
  id: string;
  mint: string;
  side: string;
  orderType: string;
  qty: number;
  triggerPrice: number;
  status: string;
  note: string | null;
  createdAt: Date;
}

export async function createLimitOrder(params: CreateLimitOrderParams): Promise<LimitOrderResult> {
  const { userId, mint, side, orderType, qty, triggerPrice, note } = params;

  if (qty <= 0) throw new Error("Quantity must be positive.");
  if (triggerPrice <= 0) throw new Error("Trigger price must be positive.");

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
      qty,
      triggerPrice,
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

  return prisma.limitOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/**
 * Check all open limit orders against current prices and execute any that trigger.
 * Called by the price poller on each tick.
 */
export async function checkAndFillLimitOrders(): Promise<number> {
  const openOrders = await prisma.limitOrder.findMany({
    where: { status: "open" },
  });

  if (openOrders.length === 0) return 0;

  let filledCount = 0;

  for (const order of openOrders) {
    try {
      const cachedPrice = await safeGet(CACHE_KEYS.tokenPrice(order.mint));
      if (!cachedPrice) continue;
      const currentPrice = parseFloat(cachedPrice);
      if (currentPrice <= 0) continue;

      let shouldFill = false;

      switch (order.orderType) {
        case "limit":
          // Limit buy: fill when price drops to or below trigger
          // Limit sell: fill when price rises to or above trigger
          if (order.side === "buy" && currentPrice <= order.triggerPrice) shouldFill = true;
          if (order.side === "sell" && currentPrice >= order.triggerPrice) shouldFill = true;
          break;

        case "stop_loss":
          // Stop loss sell: fill when price drops to or below trigger
          // Stop loss buy: fill when price rises to or above trigger (short cover)
          if (order.side === "sell" && currentPrice <= order.triggerPrice) shouldFill = true;
          if (order.side === "buy" && currentPrice >= order.triggerPrice) shouldFill = true;
          break;

        case "take_profit":
          // Take profit sell: fill when price rises to or above trigger
          // Take profit buy: fill when price drops to or below trigger
          if (order.side === "sell" && currentPrice >= order.triggerPrice) shouldFill = true;
          if (order.side === "buy" && currentPrice <= order.triggerPrice) shouldFill = true;
          break;
      }

      if (shouldFill) {
        // Determine trade amount: for buy orders, amount is in USDC (qty * triggerPrice)
        // for sell orders, amount is token qty
        const tradeAmount = order.side === "buy"
          ? order.qty * order.triggerPrice
          : order.qty;

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
