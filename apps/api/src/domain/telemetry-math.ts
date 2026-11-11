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

export type TelemetryGap = {
  from: string;
  to: string;
  reason: "NO_DATA";
  missingSeconds: number;
};

type WorkingSchedule = Record<string, [string, string] | null | undefined>;

const WEEKDAY_KEYS: Record<string, string> = {
  Mon: "seg", Tue: "ter", Wed: "qua", Thu: "qui",
  Fri: "sex", Sat: "sab", Sun: "dom",
};

const PREVIOUS_WEEKDAY_KEYS: Record<string, string> = {
  Mon: "dom", Tue: "seg", Wed: "ter", Thu: "qua",
  Fri: "qui", Sat: "sex", Sun: "sab",
};

const workingTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function parseScheduleTime(value: string, allowEndOfDay = false): number | null {
  if (allowEndOfDay && value === "24:00") return 24 * 60;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function scheduleWindow(schedule: WorkingSchedule, dayKey: string | undefined) {
  if (!dayKey) return null;
  const window = schedule[dayKey];
  if (!Array.isArray(window) || window.length !== 2) return null;
  const start = parseScheduleTime(window[0]);
  const end = parseScheduleTime(window[1], true);
  if (start === null || end === null || start === end) return null;
  return { start, end };
}

/**
 * Calculates how many seconds of a missing interval overlap the store's
 * configured opening hours. Iterating by local minute handles weekends,
 * overnight schedules and daylight-saving transitions without assuming that
 * both samples being in-hours means the entire gap was in-hours.
 */
export function calculateWorkingSecondsBetween(
  from: Date,
  to: Date,
  timezone: string,
  scheduleRaw: unknown,
): number {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) return 0;

  const schedule = (scheduleRaw ?? {}) as WorkingSchedule;
  let formatter = workingTimeFormatterCache.get(timezone);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: timezone,
      });
      workingTimeFormatterCache.set(timezone, formatter);
    } catch {
      // Invalid/missing IANA time zones must not turn a dashboard request into
      // a 500. A bad schedule contributes zero expected operating seconds.
      return 0;
    }
  }

  let cursor = from.getTime();
  const end = to.getTime();
  let scheduledMilliseconds = 0;

  while (cursor < end) {
    const nextMinute = (Math.floor(cursor / 60_000) + 1) * 60_000;
    const segmentEnd = Math.min(end, nextMinute);
    const parts = formatter.formatToParts(new Date(cursor));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const weekday = values.weekday;
    const minuteOfDay = Number(values.hour) * 60 + Number(values.minute);
    const today = scheduleWindow(schedule, WEEKDAY_KEYS[weekday]);
    const previous = scheduleWindow(schedule, PREVIOUS_WEEKDAY_KEYS[weekday]);

    let isWorking = false;
    if (today) {
      if (today.end > today.start) {
        isWorking = minuteOfDay >= today.start && minuteOfDay < today.end;
      } else if (minuteOfDay >= today.start) {
        isWorking = true;
      }
    }
    if (!isWorking && previous && previous.end < previous.start && minuteOfDay < previous.end) {
      isWorking = true;
    }

    if (isWorking) scheduledMilliseconds += segmentEnd - cursor;
    cursor = segmentEnd;
  }

  return Math.round(scheduledMilliseconds / 1000);
}

/**
 * Comfort is evaluated only while the store is expected to be operating.
 * Spurious readings remain available in raw series for diagnostics, but do not
 * contribute to comfort/monitoring metrics.
 */
export function buildMetrics(
  readings: ReadingPoint[],
  workingHours?: { timezone: string; schedule: unknown },
  range?: { from: Date; to: Date },
) {
  const orderedValidReadings = readings
    .filter((item) => !item.isSpurious)
    .sort((a, b) => a.timestampUtc.getTime() - b.timestampUtc.getTime());
  const workingReadings = orderedValidReadings.filter((item) => item.inWorkingHours);

  const monitoredSeconds = workingReadings.reduce((acc, item) => acc + item.samplingTime, 0);
  const comfortSeconds = workingReadings.reduce(
    (acc, item) => acc + (item.inComfort ? item.samplingTime : 0),
    0,
  );
  const outOfRangeSeconds = workingReadings.reduce(
    (acc, item) => acc + (!item.inComfort ? item.samplingTime : 0),
    0,
  );
  const missingSeconds = workingHours && range
    ? Math.max(
        0,
        calculateWorkingSecondsBetween(
          range.from,
          range.to,
          workingHours.timezone,
          workingHours.schedule,
        ) - monitoredSeconds,
      )
    : detectGaps(orderedValidReadings, workingHours).reduce(
        (acc, gap) => acc + gap.missingSeconds,
        0,
      );

  return {
    comfortPercent: monitoredSeconds > 0 ? Number(((comfortSeconds / monitoredSeconds) * 100).toFixed(2)) : 0,
    monitoredSeconds,
    comfortSeconds,
    outOfRangeSeconds,
    missingSeconds,
  };
}

export function aggregateSeries(readings: ReadingPoint[], aggregation: SeriesAggregation) {
  if (aggregation === "raw") {
    return [...readings]
      .sort((a, b) => a.timestampUtc.getTime() - b.timestampUtc.getTime())
      .map((row) => ({
        timestamp: row.timestampUtc,
        temperature: row.temperature,
        inComfort: row.inComfort,
        inWorkingHours: row.inWorkingHours,
        isLatePacket: row.isLatePacket,
        isSpurious: row.isSpurious,
        sampleCount: 1,
      }));
  }

  const bucketMs = aggregation === "5min"
    ? 5 * 60 * 1000
    : aggregation === "hourly"
      ? 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;
  const buckets = new Map<number, ReadingPoint[]>();

  for (const reading of readings) {
    if (reading.isSpurious) continue;
    const bucket = Math.floor(reading.timestampUtc.getTime() / bucketMs) * bucketMs;
    const current = buckets.get(bucket) ?? [];
    current.push(reading);
    buckets.set(bucket, current);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([bucketTime, points]) => {
      const avg = points.reduce((acc, item) => acc + item.temperature, 0) / points.length;
      const workingPoints = points.filter((item) => item.inWorkingHours);
      return {
        timestamp: new Date(bucketTime),
        temperature: Number(avg.toFixed(2)),
        inComfort: workingPoints.length > 0 && workingPoints.every((item) => item.inComfort),
        inWorkingHours: workingPoints.length > 0,
        sampleCount: points.length,
      };
    });
}

/**
 * A gap is flagged when a sample arrives more than twice the previous sample's
 * expected interval later. samplingTime is read per point so changing device
 * sampling intervals do not produce false gap detections.
 */
export function detectGaps(
  readings: ReadingPoint[],
  workingHours?: { timezone: string; schedule: unknown },
): TelemetryGap[] {
  if (readings.length < 2) return [];

  const ordered = [...readings].sort(
    (a, b) => a.timestampUtc.getTime() - b.timestampUtc.getTime(),
  );
  const gaps: TelemetryGap[] = [];

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const diffSeconds = Math.floor(
      (current.timestampUtc.getTime() - previous.timestampUtc.getTime()) / 1000,
    );
    const expectedSeconds = Math.max(1, previous.samplingTime);

    if (diffSeconds > expectedSeconds * 2) {
      gaps.push({
        from: new Date(previous.timestampUtc.getTime() + expectedSeconds * 1000).toISOString(),
        to: current.timestampUtc.toISOString(),
        reason: "NO_DATA",
        missingSeconds: workingHours
          ? calculateWorkingSecondsBetween(
              new Date(previous.timestampUtc.getTime() + expectedSeconds * 1000),
              current.timestampUtc,
              workingHours.timezone,
              workingHours.schedule,
            )
          : previous.inWorkingHours && current.inWorkingHours
            ? Math.max(0, diffSeconds - expectedSeconds)
            : 0,
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
