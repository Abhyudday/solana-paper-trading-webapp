import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(8),
  JWT_EXPIRES_IN: z.string().default("7d"),
  PORT: z.coerce.number().optional(),
  BACKEND_PORT: z.coerce.number().default(4000),
  BACKEND_HOST: z.string().default("0.0.0.0"),
  SOLANA_TRACKER_API_KEY: z.string().default(""),
  SOLANA_TRACKER_BASE_URL: z.string().default("https://data.solanatracker.io"),
  DEFAULT_PAPER_BALANCE: z.coerce.number().default(1000),
  SLIPPAGE_MIN: z.coerce.number().default(0.0005),
  SLIPPAGE_MAX: z.coerce.number().default(0.003),
  TRADE_FEE: z.coerce.number().default(0.001),
  RATE_LIMIT_MAX: z.coerce.number().default(600),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
});

export type Env = z.infer<typeof envSchema>;

export function loadConfig(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const config = loadConfig();
