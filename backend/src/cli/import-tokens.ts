import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const prisma = new PrismaClient();

interface TokenRow {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
}

function parseCSV(content: string): TokenRow[] {
  const lines = content.trim().split("\n");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());

  const mintIdx = header.indexOf("mint");
  const symbolIdx = header.indexOf("symbol");
  const nameIdx = header.indexOf("name");
  const decimalsIdx = header.indexOf("decimals");

  if (mintIdx === -1 || symbolIdx === -1 || nameIdx === -1) {
    throw new Error("CSV must have columns: mint, symbol, name (and optionally decimals)");
  }

  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    return {
      mint: cols[mintIdx],
      symbol: cols[symbolIdx],
      name: cols[nameIdx],
      decimals: decimalsIdx >= 0 ? parseInt(cols[decimalsIdx], 10) || 9 : 9,
    };
  });
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: tsx src/cli/import-tokens.ts <path-to-csv>");
    process.exit(1);
  }

  const content = readFileSync(csvPath, "utf-8");
  const tokens = parseCSV(content);

  console.log(`Importing ${tokens.length} tokens...`);

  let imported = 0;
  let skipped = 0;

  for (const token of tokens) {
    if (!token.mint || !token.symbol || !token.name) {
      skipped++;
      continue;
    }
    await prisma.token.upsert({
      where: { mint: token.mint },
      update: { symbol: token.symbol, name: token.name, decimals: token.decimals },
      create: token,
    });
    imported++;
  }

  console.log(`Done. Imported: ${imported}, Skipped: ${skipped}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
