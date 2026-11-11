export interface TelemetryPacket {
  dev_id: string;
  timestamp: string;
  GMT: number;
  samplingTime: number;
  Temperature: number[];
  saved_data?: boolean;
}

export interface TelemetrySample {
  timestampUtc: Date;
  temperature: number;
  isLatePacket: boolean;
}

export function validateTelemetryPacket(value: unknown, lineNumber: number): TelemetryPacket {
  if (!value || typeof value !== "object") {
    throw new Error(`Invalid JSONL packet at line ${lineNumber}: expected an object`);
  }

  const packet = value as Partial<TelemetryPacket>;
  let validTimestamp = false;
  if (typeof packet.timestamp === "string") {
    try {
      parseLocalTimestamp(packet.timestamp);
      validTimestamp = true;
    } catch {
      validTimestamp = false;
    }
  }

  if (
    typeof packet.dev_id !== "string" ||
    !packet.dev_id.trim() ||
    !validTimestamp ||
    typeof packet.GMT !== "number" ||
    !Number.isFinite(packet.GMT) ||
    packet.GMT < -14 || packet.GMT > 14 ||
    typeof packet.samplingTime !== "number" ||
    !Number.isInteger(packet.samplingTime) ||
    packet.samplingTime <= 0 ||
    !Array.isArray(packet.Temperature) ||
    packet.Temperature.length === 0 ||
    packet.Temperature.length > 1_000 ||
    !packet.Temperature.every((item) => typeof item === "number" && Number.isFinite(item)) ||
    (packet.saved_data !== undefined && typeof packet.saved_data !== "boolean")
  ) {
    throw new Error(`Invalid JSONL packet at line ${lineNumber}: invalid telemetry fields`);
  }

  return packet as TelemetryPacket;
}

export function parseLocalTimestamp(raw: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(raw);
  if (!match) {
    throw new Error(`Invalid local timestamp: ${raw}`);
  }

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw, millisecondRaw = "0"] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  const millisecond = Number(millisecondRaw.padEnd(3, "0"));
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const parsed = new Date(timestamp);

  if (
    !Number.isFinite(timestamp) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    hour > 23 || minute > 59 || second > 59
  ) {
    throw new Error(`Invalid local timestamp: ${raw}`);
  }

  return timestamp;
}

export function toUtcPacketTimestamp(raw: string, gmt: number): Date {
  return new Date(parseLocalTimestamp(raw) - gmt * 60 * 60 * 1000);
}

function hhmmToMinutes(hhmm: string, allowEndOfDay = false): number {
  if (allowEndOfDay && hhmm === "24:00") return 24 * 60;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return Number.NaN;
  const [hh, mm] = hhmm.split(":").map(Number);
  return hh * 60 + mm;
}

type Schedule = Record<string, [string, string] | null | undefined>;

type ScheduleFormatters = {
  weekday: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
};

const scheduleFormatterCache = new Map<string, ScheduleFormatters>();

function getScheduleFormatters(timezone: string): ScheduleFormatters {
  const cached = scheduleFormatterCache.get(timezone);
  if (cached) return cached;

  const formatters = {
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: timezone }),
    time: new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: timezone,
    }),
  };
  scheduleFormatterCache.set(timezone, formatters);
  return formatters;
}

export function indexEnvironmentsByDeviceId<T extends { devId: string }>(items: T[]): Map<string, T> {
  const index = new Map<string, T>();
  for (const item of items) index.set(item.devId, item);
  return index;
}

export function isWithinWorkingHours(dateUtc: Date, timezone: string, scheduleRaw: unknown): boolean {
  try {
    const schedule = (scheduleRaw ?? {}) as Schedule;
    const { weekday: weekdayFormatter, time: timeFormatter } = getScheduleFormatters(timezone);

    const dayMap: Record<string, string> = {
      Mon: "seg", Tue: "ter", Wed: "qua", Thu: "qui",
      Fri: "sex", Sat: "sab", Sun: "dom",
    };
    const previousDayMap: Record<string, string> = {
      Mon: "dom", Tue: "seg", Wed: "ter", Thu: "qua",
      Fri: "qui", Sat: "sex", Sun: "sab",
    };

    const weekday = weekdayFormatter.format(dateUtc);
    const current = timeFormatter.format(dateUtc);
    const currentMinutes = hhmmToMinutes(current);
    if (!dayMap[weekday] || !Number.isFinite(currentMinutes)) return false;

    const readWindow = (dayKey: string) => {
      const window = schedule[dayKey];
      if (!Array.isArray(window) || window.length !== 2) return null;
      const start = hhmmToMinutes(window[0]);
      const end = hhmmToMinutes(window[1], true);
      return Number.isFinite(start) && Number.isFinite(end) && start !== end
        ? { start, end }
        : null;
    };

    const todayWindow = readWindow(dayMap[weekday]);
    if (todayWindow) {
      if (todayWindow.end > todayWindow.start &&
          currentMinutes >= todayWindow.start && currentMinutes < todayWindow.end) {
        return true;
      }
      // The portion after midnight belongs to the previous day's overnight shift.
      if (todayWindow.end < todayWindow.start && currentMinutes >= todayWindow.start) {
        return true;
      }
    }

    const previousWindow = readWindow(previousDayMap[weekday]);
    return Boolean(
      previousWindow &&
      previousWindow.end < previousWindow.start &&
      currentMinutes < previousWindow.end,
    );
  } catch {
    return false;
  }
}

export function toUtcSamples(packet: TelemetryPacket): TelemetrySample[] {
  const packetUtc = toUtcPacketTimestamp(packet.timestamp, packet.GMT);
  return packet.Temperature.map((temperature, index) => {
    const offsetSeconds = (packet.Temperature.length - 1 - index) * packet.samplingTime;
    return {
      timestampUtc: new Date(packetUtc.getTime() - offsetSeconds * 1000),
      temperature,
      isLatePacket: Boolean(packet.saved_data),
    };
  });
}

export function isSpurious(value: number): boolean {
  return value < -20 || value > 70;
}
