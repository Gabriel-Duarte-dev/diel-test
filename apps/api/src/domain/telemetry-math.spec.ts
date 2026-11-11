import {
  aggregateSeries,
  buildMetrics,
  calculateWorkingSecondsBetween,
  detectGaps,
  resolvePeriodRange,
  type ReadingPoint,
} from "./telemetry-math";

function reading(
  iso: string,
  temperature: number,
  samplingTime = 30,
  inComfort = true,
  inWorkingHours = true,
  isSpurious = false,
): ReadingPoint {
  return {
    timestampUtc: new Date(iso),
    temperature,
    inComfort,
    inWorkingHours,
    isLatePacket: false,
    isSpurious,
    samplingTime,
  };
}

describe("telemetry math", () => {
  it("calculates comfort only from valid samples during working hours", () => {
    const data = [
      reading("2026-01-01T00:00:00Z", 22, 30, true, true),
      reading("2026-01-01T00:00:30Z", 27, 30, false, true),
      reading("2026-01-01T00:01:00Z", 22, 30, true, false),
      reading("2026-01-01T00:01:30Z", 99, 30, false, true, true),
    ];

    const metrics = buildMetrics(data);
    expect(metrics.monitoredSeconds).toBe(60);
    expect(metrics.comfortSeconds).toBe(30);
    expect(metrics.outOfRangeSeconds).toBe(30);
    expect(metrics.missingSeconds).toBe(0);
    expect(metrics.comfortPercent).toBe(50);
  });

  it("excludes spurious samples from aggregated series but preserves them in raw", () => {
    const data = [
      reading("2026-01-01T10:00:00Z", 20),
      reading("2026-01-01T10:10:00Z", 22),
      reading("2026-01-01T10:20:00Z", 100, 30, false, true, true),
      reading("2026-01-01T11:00:00Z", 24),
    ];

    const series = aggregateSeries(data, "hourly");
    expect(series).toHaveLength(2);
    expect(series[0].temperature).toBe(21);
    expect(series[0].sampleCount).toBe(2);
    expect(aggregateSeries(data, "raw")).toHaveLength(4);
  });

  it("detects gaps using the sampling interval of each previous sample", () => {
    const data = [
      reading("2026-01-01T00:00:00Z", 20, 30),
      reading("2026-01-01T00:00:30Z", 20, 60),
      reading("2026-01-01T00:03:00Z", 20, 60),
    ];

    const gaps = detectGaps(data);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].reason).toBe("NO_DATA");
    expect(gaps[0].missingSeconds).toBe(90);
  });

  it("does not count gaps outside working hours as missing operating time", () => {
    const data = [
      reading("2026-01-01T00:00:00Z", 20, 30, true, false),
      reading("2026-01-01T00:03:00Z", 20, 30, true, false),
    ];
    expect(buildMetrics(data).missingSeconds).toBe(0);
  });

  it("counts missing operating time at the beginning and end of a selected range", () => {
    const data = [reading("2026-01-01T09:00:00Z", 22, 3600, true, true)];
    const metrics = buildMetrics(
      data,
      { timezone: "UTC", schedule: { qui: ["08:00", "10:00"] } },
      { from: new Date("2026-01-01T08:00:00Z"), to: new Date("2026-01-01T10:00:00Z") },
    );

    expect(metrics.monitoredSeconds).toBe(3600);
    expect(metrics.missingSeconds).toBe(3600);
  });

  it("resolves last_week range", () => {
    const reference = new Date("2026-01-30T12:00:00Z");
    const range = resolvePeriodRange(reference, "last_week");
    expect(range.toDate.toISOString()).toBe("2026-01-30T12:00:00.000Z");
    expect(range.fromDate.toISOString()).toBe("2026-01-23T12:00:00.000Z");
  });
});


describe("working-hours gap duration", () => {
  it("does not count closed weekend hours in a long gap", () => {
    const seconds = calculateWorkingSecondsBetween(
      new Date("2026-01-02T16:00:00Z"), // Friday 16:00
      new Date("2026-01-05T10:00:00Z"), // Monday 10:00
      "UTC",
      {
        sex: ["08:00", "17:00"],
        seg: ["08:00", "17:00"],
      },
    );
    expect(seconds).toBe(3 * 60 * 60);
  });

  it("counts 24:00 as the end of a full-day schedule", () => {
    const seconds = calculateWorkingSecondsBetween(
      new Date("2026-01-05T00:00:00Z"),
      new Date("2026-01-06T00:00:00Z"),
      "UTC",
      { seg: ["00:00", "24:00"] },
    );
    expect(seconds).toBe(24 * 60 * 60);
  });

  it("uses the previous weekday schedule for the after-midnight part of an overnight shift", () => {
    const seconds = calculateWorkingSecondsBetween(
      new Date("2026-01-06T00:00:00Z"), // Tuesday 00:00
      new Date("2026-01-06T05:00:00Z"), // Tuesday 05:00
      "UTC",
      { seg: ["22:00", "06:00"] },
    );
    expect(seconds).toBe(5 * 60 * 60);
  });
});
