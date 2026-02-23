import { z } from "zod";

export const authSchema = z.object({
  walletAddress: z.string().min(32).max(44),
});

export const tradeSchema = z.object({
  mint: z.string().min(32).max(44),
  amount: z.number().positive(),
  side: z.enum(["buy", "sell"]),
});

export const searchSchema = z.object({
  query: z.string().min(1).max(100),
});

export const chartSchema = z.object({
  range: z.enum(["1d", "7d", "30d"]).default("1d"),
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
