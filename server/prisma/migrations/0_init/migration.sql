-- CreateTable
CREATE TABLE "Trader" (
    "address" TEXT NOT NULL,
    "name" TEXT,
    "pseudonym" TEXT,
    "profileImage" TEXT,
    "portfolioValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profitToday" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalVolume" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "tradesCapped" BOOLEAN NOT NULL DEFAULT false,
    "openPositions" INTEGER NOT NULL DEFAULT 0,
    "resolvedCount" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION,
    "payload" JSONB NOT NULL,
    "idxNewestTs" INTEGER,
    "idxOldestTs" INTEGER,
    "idxComplete" BOOLEAN NOT NULL DEFAULT false,
    "idxUpdatedAt" TIMESTAMP(3),
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trader_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "usdcSize" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatSnapshot" (
    "id" SERIAL NOT NULL,
    "traderAddress" TEXT NOT NULL,
    "portfolioValue" DOUBLE PRECISION NOT NULL,
    "totalProfit" DOUBLE PRECISION NOT NULL,
    "winRate" DOUBLE PRECISION,
    "totalTrades" INTEGER NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "passwordHash" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "proExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedWallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trade_address_timestamp_idx" ON "Trade"("address", "timestamp");

-- CreateIndex
CREATE INDEX "Trade_address_conditionId_idx" ON "Trade"("address", "conditionId");

-- CreateIndex
CREATE INDEX "StatSnapshot_traderAddress_takenAt_idx" ON "StatSnapshot"("traderAddress", "takenAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedWallet_userId_address_key" ON "TrackedWallet"("userId", "address");

-- AddForeignKey
ALTER TABLE "StatSnapshot" ADD CONSTRAINT "StatSnapshot_traderAddress_fkey" FOREIGN KEY ("traderAddress") REFERENCES "Trader"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedWallet" ADD CONSTRAINT "TrackedWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

