import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createLimitOrder,
  cancelLimitOrder,
  getUserLimitOrders,
} from "../services/limit-order";

const createOrderSchema = z.object({
  mint: z.string().min(32).max(44),
  side: z.enum(["buy", "sell"]),
  orderType: z.enum(["limit", "stop_loss", "take_profit"]),
  qty: z.number().min(0),
  triggerPrice: z.number().min(0),
  triggerType: z.enum(["price", "pnl_percent", "market_cap"]).optional(),
  triggerPnlPercent: z.number().optional(),
  triggerMarketCap: z.number().positive().optional(),
  usdcAmount: z.number().positive().optional(),
  note: z.string().max(500).optional(),
});

const cancelOrderSchema = z.object({
  orderId: z.string().min(1),
});

export async function limitOrderRoutes(app: FastifyInstance) {
  app.post(
    "/api/orders",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = createOrderSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const { userId } = request.user as { userId: string };

      try {
        const order = await createLimitOrder({
          userId,
          ...parsed.data,
        });
        return reply.status(201).send(order);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Order creation failed";
        return reply.status(400).send({ error: message });
      }
    }
  );

  app.get(
    "/api/orders",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const q = request.query as Record<string, string>;
      const status = q.status as "open" | "filled" | "cancelled" | undefined;
      try {
        const orders = await getUserLimitOrders(userId, status);
        return reply.send({ orders });
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes("does not exist")) {
          return reply.send({ orders: [] });
        }
        throw err;
      }
    }
  );

  app.delete(
    "/api/orders/:orderId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { orderId } = request.params as { orderId: string };

      try {
        await cancelLimitOrder(userId, orderId);
        return reply.send({ success: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Cancel failed";
        return reply.status(400).send({ error: message });
      }
    }
  );
}
