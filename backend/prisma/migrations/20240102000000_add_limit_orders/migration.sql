-- CreateTable
CREATE TABLE "LimitOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "triggerPrice" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "filledAt" TIMESTAMP(3),
    "filledPrice" DOUBLE PRECISION,

    CONSTRAINT "LimitOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LimitOrder_userId_idx" ON "LimitOrder"("userId");

-- CreateIndex
CREATE INDEX "LimitOrder_mint_idx" ON "LimitOrder"("mint");

-- CreateIndex
CREATE INDEX "LimitOrder_status_idx" ON "LimitOrder"("status");

-- AddForeignKey
ALTER TABLE "LimitOrder" ADD CONSTRAINT "LimitOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
