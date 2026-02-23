import { FastifyInstance } from "fastify";
import { authSchema } from "../schemas/validation";
import { findOrCreateUser } from "../services/auth";

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/connect", async (request, reply) => {
    const parsed = authSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { walletAddress } = parsed.data;
    const user = await findOrCreateUser(walletAddress);

    const token = app.jwt.sign({ userId: user.id, walletAddress }, { expiresIn: "7d" });

    return reply.send({
      token,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        createdAt: user.createdAt,
      },
    });
  });

  app.get("/api/auth/me", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const user = await findOrCreateUser(userId);
    return reply.send({ user });
  });
}
