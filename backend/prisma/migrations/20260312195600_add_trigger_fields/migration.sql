-- AlterTable
ALTER TABLE "LimitOrder" ADD COLUMN     "triggerMarketCap" DOUBLE PRECISION,
ADD COLUMN     "triggerPnlPercent" DOUBLE PRECISION,
ADD COLUMN     "triggerType" TEXT NOT NULL DEFAULT 'price',
ADD COLUMN     "usdcAmount" DOUBLE PRECISION;
