-- Supports environment series, summary and gap queries that exclude spurious readings.
CREATE INDEX IF NOT EXISTS "TelemetryReading_environmentId_isSpurious_timestampUtc_idx"
ON "TelemetryReading" ("environmentId", "isSpurious", "timestampUtc" DESC);
