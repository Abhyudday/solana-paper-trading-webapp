import { FastifyInstance } from "fastify";
import { paginationSchema } from "../schemas/validation";
import { getPortfolio, getTradeHistory, getPortfolioAnalytics } from "../services/portfolio";

export async function portfolioRoutes(app: FastifyInstance) {
  app.get(
    "/api/portfolio",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const portfolio = await getPortfolio(userId);
      return reply.send(portfolio);
    }
  );

  app.get(
    "/api/portfolio/trades",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const parsed = paginationSchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const { limit, offset } = parsed.data;
      const trades = await getTradeHistory(userId, limit, offset);
      return reply.send({ trades });
    }
  );

  app.get(
    "/api/portfolio/analytics",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const analytics = await getPortfolioAnalytics(userId);
      return reply.send(analytics);
    }
  );
}
