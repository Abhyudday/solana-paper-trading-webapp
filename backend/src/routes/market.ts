import { FastifyInstance } from "fastify";
import { searchSchema, chartSchema } from "../schemas/validation";
import { SolanaTrackerAdapter, checkDexPaid } from "../adapters/solana-tracker";
import { generateOrderBook } from "../services/orderbook";
import { safeGet, CACHE_KEYS } from "../lib/redis";
import type { TokenInfo } from "../adapters/market-data";

async function addDexPaid(tokens: TokenInfo[]): Promise<void> {
  const results = await Promise.allSettled(
    tokens.map((t) => checkDexPaid(t.mint))
  );
  tokens.forEach((t, i) => {
    t.dexPaid = results[i].status === "fulfilled" ? results[i].value : false;
  });
}

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
    const freshPriceStr = await safeGet(CACHE_KEYS.tokenPrice(mint));
    if (freshPriceStr) {
      const freshPrice = parseFloat(freshPriceStr);
      if (freshPrice > 0) {
        info.price = freshPrice;
      }
    }
    reply.header("Cache-Control", "public, max-age=2, stale-while-revalidate=5");
    return reply.send(info);
  });

  app.get("/api/market/tokens/:mint/chart", async (request, reply) => {
    const { mint } = request.params as { mint: string };
    const parsed = chartSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const bars = await adapter.getOHLCV(mint, parsed.data.range);
    const isSubMinute = ["1s", "5s", "15s", "30s"].includes(parsed.data.range);
    reply.header("Cache-Control", isSubMinute
      ? "public, max-age=3, stale-while-revalidate=8"
      : "public, max-age=15, stale-while-revalidate=30"
    );
    return reply.send({ bars });
  });

  app.get("/api/market/tokens/:mint/orderbook", async (request, reply) => {
    const { mint } = request.params as { mint: string };
    let price = 0;
    const cached = await safeGet(CACHE_KEYS.tokenPrice(mint));
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
    const tokens = await adapter.getTopTokens(50);
    await addDexPaid(tokens);
    reply.header("Cache-Control", "public, max-age=10, stale-while-revalidate=30");
    return reply.send({ tokens });
  });

  app.get("/api/market/latest", async (_request, reply) => {
    const tokens = await adapter.getLatestTokens(50);
    await addDexPaid(tokens);
    reply.header("Cache-Control", "public, max-age=10, stale-while-revalidate=30");
    return reply.send({ tokens });
  });

  app.get("/api/market/trending", async (_request, reply) => {
    const tokens = await adapter.getTrendingTokens(50);
    await addDexPaid(tokens);
    reply.header("Cache-Control", "public, max-age=10, stale-while-revalidate=30");
    return reply.send({ tokens });
  });

  app.get("/api/market/tokens/:mint/trades", async (request, reply) => {
    const { mint } = request.params as { mint: string };
    const trades = await adapter.getTokenTrades(mint);
    reply.header("Cache-Control", "public, max-age=8, stale-while-revalidate=15");
    return reply.send({ trades });
  });

  app.get("/api/market/tokens/:mint/holders", async (request, reply) => {
    const { mint } = request.params as { mint: string };
    const holders = await adapter.getTokenHolders(mint);
    reply.header("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    return reply.send(holders);
  });

  app.get("/api/market/tokens/:mint/bundles", async (request, reply) => {
    const { mint } = request.params as { mint: string };
    const bundles = await adapter.getTokenBundles(mint);
    reply.header("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    return reply.send(bundles);
  });

  app.get("/api/market/tokens/:mint/snipers", async (request, reply) => {
    const { mint } = request.params as { mint: string };
    const snipers = await adapter.getTokenSnipers(mint);
    reply.header("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    return reply.send(snipers);
  });

  app.get("/api/market/graduating", async (_request, reply) => {
    const tokens = await adapter.getGraduatingTokens(50);
    await addDexPaid(tokens);
    reply.header("Cache-Control", "public, max-age=10, stale-while-revalidate=30");
    return reply.send({ tokens });
  });

  app.get("/api/market/graduated", async (_request, reply) => {
    const tokens = await adapter.getGraduatedTokens(50);
    await addDexPaid(tokens);
    reply.header("Cache-Control", "public, max-age=10, stale-while-revalidate=30");
    return reply.send({ tokens });
  });

  app.get("/api/market/filtered", async (request, reply) => {
    const q = request.query as Record<string, string>;
    const toNum = (v: string | undefined) => v !== undefined && v !== "" ? Number(v) : undefined;

    const filters = {
      status: q.status as "graduating" | "graduated" | "default" | undefined,
      sortBy: q.sortBy,
      sortOrder: q.sortOrder as "asc" | "desc" | undefined,
      minLiquidity: toNum(q.minLiquidity),
      maxLiquidity: toNum(q.maxLiquidity),
      minMarketCap: toNum(q.minMarketCap),
      maxMarketCap: toNum(q.maxMarketCap),
      minVolume: toNum(q.minVolume),
      maxVolume: toNum(q.maxVolume),
      volumeTimeframe: q.volumeTimeframe,
      minBuys: toNum(q.minBuys),
      maxBuys: toNum(q.maxBuys),
      minSells: toNum(q.minSells),
      maxSells: toNum(q.maxSells),
      minTotalTransactions: toNum(q.minTotalTransactions),
      maxTotalTransactions: toNum(q.maxTotalTransactions),
      minHolders: toNum(q.minHolders),
      maxHolders: toNum(q.maxHolders),
      minCurvePercentage: toNum(q.minCurvePercentage),
      maxCurvePercentage: toNum(q.maxCurvePercentage),
      minFeesTotal: toNum(q.minFeesTotal),
      maxFeesTotal: toNum(q.maxFeesTotal),
      minCreatedAt: toNum(q.minCreatedAt),
      maxCreatedAt: toNum(q.maxCreatedAt),
      limit: toNum(q.limit),
    };

    // Strip undefined values
    const cleaned = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== undefined)
    );

    const tokens = await adapter.getFilteredTokens(cleaned);
    reply.header("Cache-Control", "public, max-age=10, stale-while-revalidate=30");
    return reply.send({ tokens });
  });
}
