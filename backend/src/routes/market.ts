import { FastifyInstance } from "fastify";
import { searchSchema, chartSchema } from "../schemas/validation";
import { SolanaTrackerAdapter } from "../adapters/solana-tracker";
import { generateOrderBook } from "../services/orderbook";
import { redis, CACHE_KEYS } from "../lib/redis";

const adapter = new SolanaTrackerAdapter();

export async function marketRoutes(app: FastifyInstance) {
  app.get("/api/market/search", async (request, reply) => {
    const parsed = searchSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const results = await adapter.searchTokens(parsed.data.query);
    return reply.send({ results });
  });

  app.get("/api/market/tokens/:mint", async (request, reply) => {
    const { mint } = request.params as { mint: string };
    const info = await adapter.getTokenInfo(mint);
    if (!info) {
      return reply.status(404).send({ error: "Token not found" });
    }
    return reply.send(info);
  });

  app.get("/api/market/tokens/:mint/chart", async (request, reply) => {
    const { mint } = request.params as { mint: string };
    const parsed = chartSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const bars = await adapter.getOHLCV(mint, parsed.data.range);
    return reply.send({ bars });
  });

  app.get("/api/market/tokens/:mint/orderbook", async (request, reply) => {
    const { mint } = request.params as { mint: string };
    let price = 0;
    const cached = await redis.get(CACHE_KEYS.tokenPrice(mint));
    if (cached) {
      price = parseFloat(cached);
    } else {
      const info = await adapter.getTokenInfo(mint);
      price = info?.price ?? 0;
    }
    if (price <= 0) {
      return reply.status(404).send({ error: "Price not available" });
    }
    const orderbook = generateOrderBook(price);
    return reply.send(orderbook);
  });

  app.get("/api/market/top", async (_request, reply) => {
    const tokens = await adapter.getTopTokens(20);
    return reply.send({ tokens });
  });

  app.get("/api/market/latest", async (_request, reply) => {
    const tokens = await adapter.getLatestTokens(20);
    return reply.send({ tokens });
  });

  app.get("/api/market/trending", async (_request, reply) => {
    const tokens = await adapter.getTrendingTokens(20);
    return reply.send({ tokens });
  });
}
