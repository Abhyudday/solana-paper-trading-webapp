import { prisma } from "../lib/prisma";
import { safeGet, safePublish, CACHE_KEYS, CHANNELS } from "../lib/redis";
import { config } from "../config";
import { SolanaTrackerAdapter } from "../adapters/solana-tracker";

const marketAdapter = new SolanaTrackerAdapter();

export function computeSlippage(): number {
  const { SLIPPAGE_MIN, SLIPPAGE_MAX } = config;
  return SLIPPAGE_MIN + Math.random() * (SLIPPAGE_MAX - SLIPPAGE_MIN);
}

export function applySlippage(price: number, slippage: number, side: "buy" | "sell"): number {
  return side === "buy" ? price * (1 + slippage) : price * (1 - slippage);
}

export function computeFee(amount: number): number {
  return amount * config.TRADE_FEE;
}

interface TradeResult {
  tradeId: string;
  mint: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  fee: number;
  slippage: number;
  totalCost: number;
}

export async function executeTrade(
  userId: string,
  mint: string,
  amount: number,
  side: "buy" | "sell"
): Promise<TradeResult> {
  let basePrice = 0;
  const cachedPrice = await safeGet(CACHE_KEYS.tokenPrice(mint));
  if (cachedPrice) {
    basePrice = parseFloat(cachedPrice);
  } else {
    const info = await marketAdapter.getTokenInfo(mint);
    if (info) {
      basePrice = info.price;
    }
  }
  if (basePrice <= 0) {
    throw new Error("Price not available. Please try again.");
  }

  const slippage = computeSlippage();
  const executionPrice = applySlippage(basePrice, slippage, side);

  let qty: number;
  let fee: number;
  let totalCost: number;

  if (side === "buy") {
    // amount = USDC to spend; fee on USDC amount
    fee = computeFee(amount);
    totalCost = amount + fee;
    qty = (amount - fee) / executionPrice;
  } else {
    // amount = token qty to sell; fee on USDC proceeds
    qty = amount;
    const grossProceeds = qty * executionPrice;
    fee = computeFee(grossProceeds);
    totalCost = grossProceeds - fee; // net USDC received
  }

  if (qty <= 0) {
    throw new Error("Trade amount too small.");
  }

  const result = await prisma.$transaction(async (tx) => {
    if (side === "buy") {
      const balance = await tx.paperBalance.findUnique({
        where: { userId_currency: { userId, currency: "USDC" } },
      });
      if (!balance || balance.amount < totalCost) {
        throw new Error("Insufficient USDC balance.");
      }

      await tx.paperBalance.update({
        where: { userId_currency: { userId, currency: "USDC" } },
        data: { amount: { decrement: totalCost } },
      });

      const existing = await tx.position.findUnique({
        where: { userId_mint: { userId, mint } },
      });

      if (existing) {
        const newQty = existing.qty + qty;
        const newAvg = (existing.avgEntryPrice * existing.qty + executionPrice * qty) / newQty;
        await tx.position.update({
          where: { userId_mint: { userId, mint } },
          data: { qty: newQty, avgEntryPrice: newAvg },
        });
      } else {
        await tx.position.create({
          data: { userId, mint, qty, avgEntryPrice: executionPrice },
        });
      }
    } else {
      const position = await tx.position.findUnique({
        where: { userId_mint: { userId, mint } },
      });
      if (!position || position.qty < qty) {
        throw new Error("Insufficient token balance.");
      }

      const realizedPnl = (executionPrice - position.avgEntryPrice) * qty;
      const newQty = position.qty - qty;

      if (newQty < 0.000001) {
        await tx.position.delete({ where: { userId_mint: { userId, mint } } });
      } else {
        await tx.position.update({
          where: { userId_mint: { userId, mint } },
          data: {
            qty: newQty,
            realizedPnl: { increment: realizedPnl },
          },
        });
      }

      await tx.paperBalance.update({
        where: { userId_currency: { userId, currency: "USDC" } },
        data: { amount: { increment: totalCost } },
      });
    }

    const trade = await tx.trade.create({
      data: {
        userId,
        mint,
        side,
        qty,
        price: executionPrice,
        fee,
        slippage,
      },
    });

    return trade;
  });

  const tradeResult: TradeResult = {
    tradeId: result.id,
    mint,
    side,
    qty,
    price: executionPrice,
    fee,
    slippage,
    totalCost,
  };

  await safePublish(
    CHANNELS.tradeExecuted(userId),
    JSON.stringify(tradeResult)
  );
  await safePublish(
    CHANNELS.portfolioUpdate(userId),
    JSON.stringify({ userId, timestamp: Date.now() })
  );

  return tradeResult;
}
