export type SeriesAggregation = "raw" | "5min" | "hourly" | "daily";

export type ReadingPoint = {
  timestampUtc: Date;
  temperature: number;
  inComfort: boolean;
  inWorkingHours: boolean;
  isLatePacket: boolean;
  isSpurious: boolean;
  samplingTime: number;
};

export function buildMetrics(readings: ReadingPoint[]) {
  const monitoredSeconds = readings.reduce((acc, item) => acc + item.samplingTime, 0);
  const comfortSeconds = readings.reduce(
    (acc, item) => acc + (item.inWorkingHours && item.inComfort ? item.samplingTime : 0),
    0,
  );
  const outOfRangeSeconds = readings.reduce(
    (acc, item) => acc + (item.inWorkingHours && !item.inComfort ? item.samplingTime : 0),
    0,
  );

  return {
    comfortPercent: monitoredSeconds > 0 ? Number(((comfortSeconds / monitoredSeconds) * 100).toFixed(2)) : 0,
    monitoredSeconds,
    comfortSeconds,
    outOfRangeSeconds,
    missingSeconds: 0,
  };
}

export function aggregateSeries(readings: ReadingPoint[], aggregation: SeriesAggregation) {
  if (aggregation === "raw") {
    return readings.map((row) => ({
      timestamp: row.timestampUtc,
      temperature: row.temperature,
      inComfort: row.inComfort,
      inWorkingHours: row.inWorkingHours,
      isLatePacket: row.isLatePacket,
      isSpurious: row.isSpurious,
      sampleCount: 1,
    }));
  }

  const bucketMs = aggregation === "5min" ? 5 * 60 * 1000 : aggregation === "hourly" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const buckets = new Map<number, ReadingPoint[]>();

  for (const reading of readings) {
    const bucket = Math.floor(reading.timestampUtc.getTime() / bucketMs) * bucketMs;
    const current = buckets.get(bucket) ?? [];
    current.push(reading);
    buckets.set(bucket, current);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([bucketTime, points]) => {
      const avg = points.reduce((acc, item) => acc + item.temperature, 0) / points.length;
      return {
        timestamp: new Date(bucketTime),
        temperature: Number(avg.toFixed(2)),
        inComfort: points.every((item) => item.inComfort),
        inWorkingHours: points.some((item) => item.inWorkingHours),
        sampleCount: points.length,
      };
    });
}

export function detectGaps(readings: ReadingPoint[]) {
  if (readings.length < 2) {
    return [];
  }

  const expectedSampling = readings[0].samplingTime;
  const gaps: Array<{ from: string; to: string; reason: string }> = [];

  for (let i = 1; i < readings.length; i += 1) {
    const prev = readings[i - 1];
    const current = readings[i];
    const diffSeconds = Math.floor((current.timestampUtc.getTime() - prev.timestampUtc.getTime()) / 1000);
    if (diffSeconds > expectedSampling * 2) {
      gaps.push({
        from: prev.timestampUtc.toISOString(),
        to: current.timestampUtc.toISOString(),
        reason: "NO_DATA",
      });
    }
  }

  return gaps;
}

export function resolvePeriodRange(
  referenceTime: Date,
  period: "last_day" | "last_week" | "last_30_days" = "last_day",
) {
  const hours = period === "last_week" ? 24 * 7 : period === "last_30_days" ? 24 * 30 : 24;
  return {
    fromDate: new Date(referenceTime.getTime() - hours * 60 * 60 * 1000),
    toDate: referenceTime,
  };
}
