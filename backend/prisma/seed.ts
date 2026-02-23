import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_TOKENS = [
  { mint: "So11111111111111111111111111111111111111112", symbol: "SOL", name: "Wrapped SOL", decimals: 9 },
  { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", name: "USD Coin", decimals: 6 },
  { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", symbol: "USDT", name: "Tether USD", decimals: 6 },
  { mint: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", symbol: "ETH", name: "Wrapped Ether", decimals: 8 },
  { mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", symbol: "mSOL", name: "Marinade Staked SOL", decimals: 9 },
];

async function main() {
  for (const token of SEED_TOKENS) {
    await prisma.token.upsert({
      where: { mint: token.mint },
      update: {},
      create: token,
    });
  }
  console.log(`Seeded ${SEED_TOKENS.length} tokens`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
