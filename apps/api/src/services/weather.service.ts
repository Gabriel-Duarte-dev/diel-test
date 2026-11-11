import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

type OpenMeteoResponse = {
  hourly?: {
    time: string[];
    temperature_2m: Array<number | null>;
  };
};

const HOUR_MS = 60 * 60 * 1000;

function parseOpenMeteoUtcTimestamp(value: string): Date {
  // Open-Meteo returns local-looking ISO strings when timezone=UTC, without a
  // trailing Z. Explicitly mark those values as UTC instead of relying on the
  // API server's operating-system timezone.
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  return new Date(normalized);
}

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getExternalSeriesForStore(
    store: { id: string; latitude: number; longitude: number },
    fromDate: Date,
    toDate: Date,
  ) {
    await this.ensureExternalData(store, fromDate, toDate);

    return this.prisma.externalTemperature.findMany({
      where: {
        storeId: store.id,
        timestampUtc: { gte: fromDate, lte: toDate },
      },
      orderBy: { timestampUtc: "asc" },
      select: { timestampUtc: true, temperature: true, source: true },
    });
  }

  private async ensureExternalData(
    store: { id: string; latitude: number; longitude: number },
    fromDate: Date,
    toDate: Date,
  ) {
    if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime()) || fromDate > toDate) {
      return;
    }

    const firstExpectedHour = Math.ceil(fromDate.getTime() / HOUR_MS) * HOUR_MS;
    const lastExpectedHour = Math.floor(toDate.getTime() / HOUR_MS) * HOUR_MS;
    const expectedHours = lastExpectedHour >= firstExpectedHour
      ? Math.floor((lastExpectedHour - firstExpectedHour) / HOUR_MS) + 1
      : 0;

    if (expectedHours === 0) return;

    const cachedRows = await this.prisma.externalTemperature.findMany({
      where: {
        storeId: store.id,
        timestampUtc: { gte: new Date(firstExpectedHour), lte: new Date(lastExpectedHour) },
      },
      select: { timestampUtc: true },
    });
    const cachedHours = new Set(cachedRows.map((row) => row.timestampUtc.getTime()));
    let hasMissingHour = false;
    for (let hour = firstExpectedHour; hour <= lastExpectedHour; hour += HOUR_MS) {
      if (!cachedHours.has(hour)) {
        hasMissingHour = true;
        break;
      }
    }

    // A complete range is cached only when every expected UTC hour exists.
    // A simple count/min/max can miss holes when an off-hour record is present.
    if (!hasMissingHour) return;

    const url = new URL("https://archive-api.open-meteo.com/v1/archive");
    url.searchParams.set("latitude", String(store.latitude));
    url.searchParams.set("longitude", String(store.longitude));
    url.searchParams.set("start_date", new Date(firstExpectedHour).toISOString().slice(0, 10));
    url.searchParams.set("end_date", new Date(lastExpectedHour).toISOString().slice(0, 10));
    url.searchParams.set("hourly", "temperature_2m");
    url.searchParams.set("timezone", "UTC");

    try {
      const response = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) {
        this.logger.warn(`Open-Meteo returned status ${response.status}`);
        return;
      }

      const payload = (await response.json()) as OpenMeteoResponse;
      const times = payload.hourly?.time ?? [];
      const temperatures = payload.hourly?.temperature_2m ?? [];
      const rows = times.flatMap((time, index) => {
        const temperature = temperatures[index];
        const timestampUtc = parseOpenMeteoUtcTimestamp(time);
        if (
          typeof temperature !== "number" ||
          !Number.isFinite(temperature) ||
          Number.isNaN(timestampUtc.getTime()) ||
          timestampUtc.getTime() < firstExpectedHour ||
          timestampUtc.getTime() > lastExpectedHour
        ) {
          return [];
        }
        return [{
          storeId: store.id,
          timestampUtc,
          temperature,
          source: "open-meteo",
        }];
      });

      if (rows.length) {
        await this.prisma.externalTemperature.createMany({ data: rows, skipDuplicates: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      this.logger.warn(`Open-Meteo fetch failed: ${message}`);
    }
  }
}
