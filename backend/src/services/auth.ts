import { prisma } from "../lib/prisma";
import { config } from "../config";

export async function findOrCreateUser(walletAddress: string) {
  let user = await prisma.user.findUnique({
    where: { walletAddress },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        walletAddress,
        balances: {
          create: {
            currency: "USDC",
            amount: config.DEFAULT_PAPER_BALANCE,
          },
        },
      },
    });
  }

  return user;
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: { balances: true },
  });
}
