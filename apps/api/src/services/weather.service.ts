import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

type OpenMeteoResponse = {
  hourly?: {
    time: string[];
    temperature_2m: Array<number | null>;
  };
};

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
        timestampUtc: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: { timestampUtc: "asc" },
      select: {
        timestampUtc: true,
        temperature: true,
        source: true,
      },
    });
  }

  private async ensureExternalData(
    store: { id: string; latitude: number; longitude: number },
    fromDate: Date,
    toDate: Date,
  ) {
    const existing = await this.prisma.externalTemperature.count({
      where: {
        storeId: store.id,
        timestampUtc: {
          gte: fromDate,
          lte: toDate,
        },
      },
    });

    if (existing > 0) {
      return;
    }

    const startDate = fromDate.toISOString().slice(0, 10);
    const endDate = toDate.toISOString().slice(0, 10);

    const url = new URL("https://archive-api.open-meteo.com/v1/archive");
    url.searchParams.set("latitude", String(store.latitude));
    url.searchParams.set("longitude", String(store.longitude));
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);
    url.searchParams.set("hourly", "temperature_2m");
    url.searchParams.set("timezone", "UTC");

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        this.logger.warn(`Open-Meteo returned status ${response.status}`);
        return;
      }

      const payload = (await response.json()) as OpenMeteoResponse;
      const times = payload.hourly?.time ?? [];
      const temps = payload.hourly?.temperature_2m ?? [];

      for (let i = 0; i < times.length; i += 1) {
        const t = temps[i];
        if (typeof t !== "number") {
          continue;
        }

        const timestampUtc = new Date(times[i]);
        await this.prisma.externalTemperature.upsert({
          where: {
            storeId_timestampUtc: {
              storeId: store.id,
              timestampUtc,
            },
          },
          update: {
            temperature: t,
            source: "open-meteo",
          },
          create: {
            storeId: store.id,
            timestampUtc,
            temperature: t,
            source: "open-meteo",
          },
        });
      }
    } catch (error) {
      this.logger.warn(`Open-Meteo fetch failed: ${(error as Error).message}`);
    }
  }
}
