-- CreateEnum
CREATE TYPE "EarnEventStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SENT', 'EXPIRED', 'FAILED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "perxUserId" TEXT;

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "closeHour" INTEGER,
ADD COLUMN     "dailyCardCap" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "earnRatePer10" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "externalMerchantId" TEXT,
ADD COLUMN     "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "openHour" INTEGER,
ADD COLUMN     "playEarnEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "publicIp" TEXT;

-- CreateTable
CREATE TABLE "PlayEarnEvent" (
    "id" TEXT NOT NULL,
    "ledgerRowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "perxUserId" TEXT,
    "venueId" TEXT NOT NULL,
    "merchantId" TEXT,
    "playPoints" INTEGER NOT NULL,
    "cardPoints" INTEGER NOT NULL,
    "day" TEXT NOT NULL,
    "status" "EarnEventStatus" NOT NULL DEFAULT 'PENDING',
    "presence" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "PlayEarnEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "feedUrl" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "url" TEXT NOT NULL,
    "imageUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayEarnEvent_ledgerRowId_key" ON "PlayEarnEvent"("ledgerRowId");

-- CreateIndex
CREATE INDEX "PlayEarnEvent_userId_venueId_day_idx" ON "PlayEarnEvent"("userId", "venueId", "day");

-- CreateIndex
CREATE INDEX "PlayEarnEvent_status_idx" ON "PlayEarnEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "NewsProvider_slug_key" ON "NewsProvider"("slug");

-- CreateIndex
CREATE INDEX "NewsItem_publishedAt_idx" ON "NewsItem"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsItem_providerId_url_key" ON "NewsItem"("providerId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "User_perxUserId_key" ON "User"("perxUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_externalMerchantId_key" ON "Venue"("externalMerchantId");

-- AddForeignKey
ALTER TABLE "PlayEarnEvent" ADD CONSTRAINT "PlayEarnEvent_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsItem" ADD CONSTRAINT "NewsItem_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "NewsProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

