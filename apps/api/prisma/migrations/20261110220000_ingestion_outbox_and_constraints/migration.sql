-- Stable key for idempotent ingestion of the same JSONL file.
ALTER TABLE "RawTelemetryPacket" ADD COLUMN "sourceKey" TEXT;
UPDATE "RawTelemetryPacket" SET "sourceKey" = 'legacy:' || "id" WHERE "sourceKey" IS NULL;
ALTER TABLE "RawTelemetryPacket" ALTER COLUMN "sourceKey" SET NOT NULL;
CREATE UNIQUE INDEX "RawTelemetryPacket_sourceKey_key" ON "RawTelemetryPacket"("sourceKey");

-- The previous SetNull action was incompatible with the required devId column.
-- Restrict preserves the telemetry history and prevents deleting referenced devices.
ALTER TABLE "TelemetryReading" DROP CONSTRAINT "TelemetryReading_devId_fkey";
ALTER TABLE "TelemetryReading"
  ADD CONSTRAINT "TelemetryReading_devId_fkey"
  FOREIGN KEY ("devId") REFERENCES "Device"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Transactional outbox: store updates remain pending until the API publishes them.
CREATE TABLE "IngestionEvent" (
  "id" BIGSERIAL NOT NULL,
  "storeId" TEXT NOT NULL,
  "referenceTimeUtc" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "IngestionEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IngestionEvent_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "IngestionEvent_processedAt_id_idx" ON "IngestionEvent"("processedAt", "id");
CREATE INDEX "IngestionEvent_storeId_createdAt_idx" ON "IngestionEvent"("storeId", "createdAt");
