import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EnvironmentStatus, Prisma } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { aggregateSeries, buildMetrics, detectGaps, type ReadingPoint, type SeriesAggregation } from "../domain/telemetry-math";
import { SeriesQuery } from "../presentation/dto/series.query";
import { PrismaService } from "./prisma.service";
import { WeatherService } from "./weather.service";

@Injectable()
export class EnvironmentsService {
  constructor(private readonly prisma: PrismaService, private readonly weatherService: WeatherService) {}

  async getSummary(environmentId: string, user: AuthUser, from?: string, to?: string) {
    const environment = await this.prisma.environment.findUnique({
      where: { id: environmentId },
      include: { store: true, device: true },
    });

    if (!environment) {
      throw new NotFoundException("Ambiente nao encontrado");
    }

    await this.assertEnvironmentAccess(environmentId, user);

    const referenceTime = await this.getReferenceTime();
    const { fromDate, toDate } = this.resolveRange(referenceTime, from, to);
    const rawReadings = await this.prisma.telemetryReading.findMany({
      where: {
        environmentId,
        timestampUtc: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: { timestampUtc: "asc" },
    });

    const metrics = buildMetrics(rawReadings as ReadingPoint[]);

    return {
      success: true,
      data: {
        id: environment.id,
        nome: environment.nome,
        store: {
          id: environment.store.id,
          nome: environment.store.nome,
          cidade: environment.store.cidade,
        },
        comfortRange: {
          min: environment.faixaConfortoMin,
          max: environment.faixaConfortoMax,
        },
        status: environment.status,
        device: {
          id: environment.device?.id,
          status: environment.device?.status,
          lastPacketAt: environment.device?.lastPacketAt,
        },
        period: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        },
        metrics,
      },
      meta: {
        referenceTime: referenceTime.toISOString(),
      },
    };
  }

  async getSeries(environmentId: string, query: SeriesQuery, user: AuthUser) {
    const environment = await this.prisma.environment.findUnique({ where: { id: environmentId }, include: { store: true } });

    if (!environment) {
      throw new NotFoundException("Ambiente nao encontrado");
    }

    await this.assertEnvironmentAccess(environmentId, user);

    const referenceTime = await this.getReferenceTime();
    const { fromDate, toDate } = this.resolveRange(referenceTime, query.from, query.to, query.period);

    const rawReadings = await this.prisma.telemetryReading.findMany({
      where: {
        environmentId,
        timestampUtc: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: { timestampUtc: "asc" },
    });

    const status = this.resolveStatus(environment.status, rawReadings.length);
    const aggregated = await this.getSeriesByAggregation(
      environmentId,
      query.aggregation as SeriesAggregation,
      fromDate,
      toDate,
      rawReadings as ReadingPoint[],
    );
    const gaps = detectGaps(rawReadings as ReadingPoint[]);
    const includeExternal = query.includeExternal === "true";
    const externalTemperature = includeExternal
      ? await this.weatherService.getExternalSeriesForStore(environment.store, fromDate, toDate)
      : [];

    return {
      success: true,
      data: {
        environmentId,
        status,
        comfortRange: [environment.faixaConfortoMin, environment.faixaConfortoMax],
        aggregation: query.aggregation,
        series: aggregated,
        gaps,
        externalTemperature,
      },
      meta: {
        referenceTime: referenceTime.toISOString(),
        points: aggregated.length,
      },
    };
  }

  private resolveStatus(status: EnvironmentStatus, points: number) {
    if (points === 0) {
      return "SEM_DADOS";
    }
    return status;
  }

  private resolveRange(
    referenceTime: Date,
    from?: string,
    to?: string,
    period?: "last_day" | "last_week" | "last_30_days",
  ) {
    const toDate = to ? new Date(to) : referenceTime;
    if (from) {
      return { fromDate: new Date(from), toDate };
    }

    const hours = period === "last_week" ? 24 * 7 : period === "last_30_days" ? 24 * 30 : 24;
    const fromDate = new Date(toDate.getTime() - hours * 60 * 60 * 1000);
    return { fromDate, toDate };
  }

  private async getReferenceTime() {
    const state = await this.prisma.ingestionState.findUnique({ where: { id: "default" } });
    return state?.referenceTimeUtc ?? new Date();
  }

  private async getSeriesByAggregation(
    environmentId: string,
    aggregation: SeriesAggregation,
    fromDate: Date,
    toDate: Date,
    rawReadings: ReadingPoint[],
  ) {
    if (aggregation === "raw") {
      return aggregateSeries(rawReadings, aggregation);
    }

    if (aggregation === "hourly" || aggregation === "daily" || aggregation === "5min") {
      if (typeof this.prisma.$queryRaw !== "function") {
        return aggregateSeries(rawReadings, aggregation);
      }

      const bucketExpr =
        aggregation === "hourly"
          ? Prisma.sql`date_trunc('hour', "timestampUtc")`
          : aggregation === "daily"
            ? Prisma.sql`date_trunc('day', "timestampUtc")`
            : Prisma.sql`date_bin('5 minutes', "timestampUtc", timestamp '2000-01-01 00:00:00')`;

      const rows = await this.prisma.$queryRaw<Array<{
        timestamp: Date;
        temperature: number;
        sampleCount: number;
        inComfort: boolean;
        inWorkingHours: boolean;
      }>>(Prisma.sql`
        SELECT
          ${bucketExpr} AS "timestamp",
          round(avg("temperature")::numeric, 2) AS "temperature",
          count(*)::int AS "sampleCount",
          bool_and("inComfort") AS "inComfort",
          bool_or("inWorkingHours") AS "inWorkingHours"
        FROM "TelemetryReading"
        WHERE "environmentId" = ${environmentId}
          AND "timestampUtc" >= ${fromDate}
          AND "timestampUtc" <= ${toDate}
        GROUP BY 1
        ORDER BY 1 ASC
      `);

      return rows;
    }

    return aggregateSeries(rawReadings, aggregation);
  }

  private async assertEnvironmentAccess(environmentId: string, user: AuthUser) {
    if (user.role === "ADMIN_DIEL") {
      return;
    }

    const environment = await this.prisma.environment.findUnique({
      where: { id: environmentId },
      include: { store: true },
    });

    if (!environment) {
      throw new NotFoundException("Ambiente nao encontrado");
    }

    if (user.role === "GESTOR_CLIENTE" && environment.store.clientId === user.clientId) {
      return;
    }

    if (user.role === "GERENTE_LOJA" && user.storeIds.includes(environment.storeId)) {
      return;
    }

    throw new ForbiddenException("Acesso negado");
  }
}
