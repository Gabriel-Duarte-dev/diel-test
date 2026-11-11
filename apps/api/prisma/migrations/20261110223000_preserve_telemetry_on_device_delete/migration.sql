-- Preserve historical telemetry if a device is removed.
-- devId must be nullable for ON DELETE SET NULL to work as intended.
ALTER TABLE "TelemetryReading" ALTER COLUMN "devId" DROP NOT NULL;

ALTER TABLE "TelemetryReading" DROP CONSTRAINT IF EXISTS "TelemetryReading_devId_fkey";
ALTER TABLE "TelemetryReading"
  ADD CONSTRAINT "TelemetryReading_devId_fkey"
  FOREIGN KEY ("devId") REFERENCES "Device"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
