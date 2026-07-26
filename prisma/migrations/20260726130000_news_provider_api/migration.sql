-- AlterTable
ALTER TABLE "NewsProvider" ADD COLUMN     "apiToken" TEXT,
ADD COLUMN     "featuredUntil" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "NewsProvider_apiToken_key" ON "NewsProvider"("apiToken");

