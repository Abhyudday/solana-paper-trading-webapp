import { Queue, Worker } from "bullmq";
import { redis, redisPub, CACHE_KEYS, CHANNELS } from "../lib/redis";
import { SolanaTrackerAdapter } from "../adapters/solana-tracker";
import { prisma } from "../lib/prisma";

const POLL_INTERVAL_MS = 15000;
const adapter = new SolanaTrackerAdapter();

const connection = { host: redis.options.host || "localhost", port: redis.options.port || 6379 };

export const priceQueue = new Queue("price-polling", { connection });

export const priceWorker = new Worker(
  "price-polling",
  async () => {
    const tokens = await prisma.token.findMany({ take: 50 });
    const positions = await prisma.position.findMany({ distinct: ["mint"] });

    const mints = new Set<string>();
    tokens.forEach((t) => mints.add(t.mint));
    positions.forEach((p) => mints.add(p.mint));

    for (const mint of mints) {
      try {
        const info = await adapter.getTokenInfo(mint);
        if (info && info.price > 0) {
          await redis.set(CACHE_KEYS.tokenPrice(mint), String(info.price), "EX", 30);
          await redisPub.publish(
            CHANNELS.priceUpdate,
            JSON.stringify({ mint, price: info.price, timestamp: Date.now() })
          );
        }
      } catch (err) {
        console.error(`Price poll failed for ${mint}:`, err);
      }
    }
  },
  { connection }
);

export async function startPricePoller() {
  await priceQueue.upsertJobScheduler(
    "poll-prices",
    { every: POLL_INTERVAL_MS },
    { name: "poll-prices" }
  );
  console.log(`Price poller started (every ${POLL_INTERVAL_MS}ms)`);
}

priceWorker.on("failed", (job, err) => {
  console.error(`Price poll job ${job?.id} failed:`, err.message);
});
