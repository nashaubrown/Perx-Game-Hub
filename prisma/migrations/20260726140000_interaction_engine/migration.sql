-- CreateTable
CREATE TABLE "InteractionEvent" (
    "id" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "sid" TEXT,
    "type" TEXT NOT NULL,
    "path" TEXT,
    "venueId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InteractionEvent_createdAt_idx" ON "InteractionEvent"("createdAt");

-- CreateIndex
CREATE INDEX "InteractionEvent_type_createdAt_idx" ON "InteractionEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "InteractionEvent_actorKey_createdAt_idx" ON "InteractionEvent"("actorKey", "createdAt");

