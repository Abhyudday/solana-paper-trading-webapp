import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import { config } from "./config";
import { connectRedis } from "./lib/redis";
import { authRoutes } from "./routes/auth";
import { tradeRoutes } from "./routes/trade";
import { portfolioRoutes } from "./routes/portfolio";
import { marketRoutes } from "./routes/market";
import { setupWebSocket } from "./ws/handler";
import { startPricePoller } from "./worker/price-poller";
import { SolanaTrackerAdapter } from "./adapters/solana-tracker";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { userId: string; walletAddress: string };
    user: { userId: string; walletAddress: string };
  }
}

async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
  });
  await app.register(jwt, { secret: config.JWT_SECRET });
  await app.register(websocket);

  app.decorate("authenticate", async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({ error: "Unauthorized" });
    }
  });

  app.get("/api/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  await app.register(authRoutes);
  await app.register(tradeRoutes);
  await app.register(portfolioRoutes);
  await app.register(marketRoutes);
  await setupWebSocket(app);

  return app;
}

async function main() {
  await connectRedis();
  const app = await buildApp();

  try {
    const port = config.PORT || config.BACKEND_PORT;
    await app.listen({ port, host: config.BACKEND_HOST });
    await startPricePoller();
    console.log(`Server running on ${config.BACKEND_HOST}:${config.BACKEND_PORT}`);

    // Warm up caches so landing page loads instantly
    const adapter = new SolanaTrackerAdapter();
    const warmup = async () => {
      try {
        await Promise.all([
          adapter.getLatestTokens(20),
          adapter.getGraduatingTokens(20),
          adapter.getGraduatedTokens(20),
        ]);
      } catch {}
    };
    await warmup();
    console.log("Cache warmup complete");

    // Continuous background refresh every 3s so cache is always warm
    setInterval(warmup, 3_000);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();

export { buildApp };
