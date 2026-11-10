-- CreateTable
CREATE TABLE "ExternalTemperature" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "timestampUtc" TIMESTAMP(3) NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'open-meteo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalTemperature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalTemperature_storeId_timestampUtc_idx" ON "ExternalTemperature"("storeId", "timestampUtc" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalTemperature_storeId_timestampUtc_key" ON "ExternalTemperature"("storeId", "timestampUtc");

-- AddForeignKey
ALTER TABLE "ExternalTemperature" ADD CONSTRAINT "ExternalTemperature_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
