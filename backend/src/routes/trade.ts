import { FastifyInstance } from "fastify";
import { tradeSchema } from "../schemas/validation";
import { executeTrade } from "../services/trade";

export async function tradeRoutes(app: FastifyInstance) {
  app.post(
    "/api/trades",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = tradeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const { userId } = request.user as { userId: string };
      const { mint, amount, side } = parsed.data;

      try {
        const result = await executeTrade(userId, mint, amount, side);
        return reply.status(201).send(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Trade failed";
        return reply.status(400).send({ error: message });
      }
    }
  );
}
