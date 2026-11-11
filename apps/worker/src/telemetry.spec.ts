import assert from "node:assert/strict";
import test from "node:test";
import {
  indexEnvironmentsByDeviceId,
  isSpurious,
  isWithinWorkingHours,
  toUtcPacketTimestamp,
  toUtcSamples,
  validateTelemetryPacket,
} from "../src/telemetry";

test("converts local packet timestamp and GMT offset to UTC", () => {
  assert.equal(
    toUtcPacketTimestamp("2026-01-05T12:00:00", -3).toISOString(),
    "2026-01-05T15:00:00.000Z",
  );
});

test("expands packet temperatures into UTC samples", () => {
  const samples = toUtcSamples({
    dev_id: "device-1",
    timestamp: "2026-01-05T12:01:00",
    GMT: -3,
    samplingTime: 30,
    Temperature: [20, 21, 22],
    saved_data: true,
  });

  assert.deepEqual(samples.map((sample) => sample.timestampUtc.toISOString()), [
    "2026-01-05T15:00:00.000Z",
    "2026-01-05T15:00:30.000Z",
    "2026-01-05T15:01:00.000Z",
  ]);
  assert.equal(samples.every((sample) => sample.isLatePacket), true);
});

test("validates packet shape and rejects invalid values", () => {
  assert.equal(validateTelemetryPacket({
    dev_id: "device-1",
    timestamp: "2026-01-05T12:01:00",
    GMT: -3,
    samplingTime: 30,
    Temperature: [20, 21],
  }, 1).dev_id, "device-1");

  assert.throws(() => validateTelemetryPacket({
    dev_id: "device-1",
    timestamp: "not-a-date",
    GMT: -3,
    samplingTime: 0,
    Temperature: [20, Number.NaN],
  }, 8), /line 8/);
});

test("evaluates schedules in the store time zone, including overnight shifts", () => {
  const schedule = {
    seg: ["22:00", "06:00"],
  };

  // Monday at 23:00 in São Paulo, within Monday's overnight shift.
  assert.equal(isWithinWorkingHours(new Date("2026-01-06T02:00:00Z"), "America/Sao_Paulo", schedule), true);
  // Tuesday at 00:30 belongs to Monday's overnight shift.
  assert.equal(isWithinWorkingHours(new Date("2026-01-06T03:30:00Z"), "America/Sao_Paulo", schedule), true);
  assert.equal(isWithinWorkingHours(new Date("2026-01-06T15:00:00Z"), "America/Sao_Paulo", schedule), false);
});

test("treats 24:00 as the end of a full-day schedule", () => {
  const date = new Date("2026-01-05T23:59:00.000Z");
  assert.equal(isWithinWorkingHours(date, "UTC", { seg: ["00:00", "24:00"] }), true);
});

test("marks values outside the configured hard bounds as spurious", () => {
  assert.equal(isSpurious(-21), true);
  assert.equal(isSpurious(71), true);
  assert.equal(isSpurious(22), false);
});


test("indexes environment records by device id used by telemetry packets", () => {
  const environments = [
    { id: "environment-1", devId: "IOT017" },
    { id: "environment-2", devId: "IOT018" },
  ];
  const index = indexEnvironmentsByDeviceId(environments);

  assert.equal(index.get("IOT017")?.id, "environment-1");
  assert.equal(index.get("environment-1"), undefined);
});

test("rejects impossible local dates and oversized or invalid packets", () => {
  assert.throws(() => toUtcPacketTimestamp("2026-02-31T12:00:00", -3), /Invalid local timestamp/);
  assert.throws(() => validateTelemetryPacket({
    dev_id: "device-1", timestamp: "2026-01-05T12:01:00", GMT: -3,
    samplingTime: 30, Temperature: Array.from({ length: 1001 }, () => 20),
  }, 12), /line 12/);
  assert.throws(() => validateTelemetryPacket({
    dev_id: "device-1", timestamp: "2026-01-05T12:01:00", GMT: -3,
    samplingTime: 30, Temperature: [20], saved_data: "false",
  }, 13), /line 13/);
});
