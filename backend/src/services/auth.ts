import { prisma } from "../lib/prisma";
import { config } from "../config";

export async function findOrCreateUser(walletAddress: string) {
  let user = await prisma.user.findUnique({
    where: { walletAddress },
    include: { balances: true },
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
      include: { balances: true },
    });
  } else {
    // Ensure existing user has a USDC balance
    const hasUsdcBalance = user.balances?.some((b) => b.currency === "USDC");
    if (!hasUsdcBalance) {
      await prisma.paperBalance.create({
        data: {
          userId: user.id,
          currency: "USDC",
          amount: config.DEFAULT_PAPER_BALANCE,
        },
      });
    }
  }

  return user;
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: { balances: true },
  });
}
