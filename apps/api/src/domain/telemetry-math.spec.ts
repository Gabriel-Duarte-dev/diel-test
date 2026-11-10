import { aggregateSeries, buildMetrics, detectGaps, resolvePeriodRange, type ReadingPoint } from "./telemetry-math";

function reading(iso: string, temperature: number, samplingTime = 30, inComfort = true, inWorkingHours = true): ReadingPoint {
  return {
    timestampUtc: new Date(iso),
    temperature,
    inComfort,
    inWorkingHours,
    isLatePacket: false,
    isSpurious: false,
    samplingTime,
  };
}

describe("telemetry math", () => {
  it("calculates comfort metrics only from monitored points", () => {
    const data = [
      reading("2026-01-01T00:00:00Z", 22, 30, true, true),
      reading("2026-01-01T00:00:30Z", 27, 30, false, true),
      reading("2026-01-01T00:01:00Z", 22, 30, true, false),
    ];

    const metrics = buildMetrics(data);
    expect(metrics.monitoredSeconds).toBe(90);
    expect(metrics.comfortSeconds).toBe(30);
    expect(metrics.outOfRangeSeconds).toBe(30);
    expect(metrics.comfortPercent).toBeCloseTo(33.33, 2);
  });

  it("aggregates by hour", () => {
    const data = [
      reading("2026-01-01T10:00:00Z", 20),
      reading("2026-01-01T10:10:00Z", 22),
      reading("2026-01-01T11:00:00Z", 24),
    ];

    const series = aggregateSeries(data, "hourly");
    expect(series).toHaveLength(2);
    expect(series[0].temperature).toBe(21);
    expect(series[0].sampleCount).toBe(2);
    expect(series[1].temperature).toBe(24);
  });

  it("detects no-data gaps", () => {
    const data = [
      reading("2026-01-01T00:00:00Z", 20, 30),
      reading("2026-01-01T00:00:30Z", 20, 30),
      reading("2026-01-01T00:03:00Z", 20, 30),
    ];

    const gaps = detectGaps(data);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].reason).toBe("NO_DATA");
  });

  it("resolves last_week range", () => {
    const reference = new Date("2026-01-30T12:00:00Z");
    const range = resolvePeriodRange(reference, "last_week");

    expect(range.toDate.toISOString()).toBe("2026-01-30T12:00:00.000Z");
    expect(range.fromDate.toISOString()).toBe("2026-01-23T12:00:00.000Z");
  });
});
