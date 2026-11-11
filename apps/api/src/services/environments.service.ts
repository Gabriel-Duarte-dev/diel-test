import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EnvironmentStatus, Prisma } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import {
  aggregateSeries,
  calculateWorkingSecondsBetween,
  type ReadingPoint,
  type SeriesAggregation,
} from "../domain/telemetry-math";
import { DateRangeQuery } from "../presentation/dto/date-range.query";
import { SeriesQuery } from "../presentation/dto/series.query";
import { PrismaService } from "./prisma.service";
import { WeatherService } from "./weather.service";

const MAX_RANGE_DAYS = 90;

type AggregatedSeriesRow = {
  timestamp: Date;
  temperature: number;
  sampleCount: number;
  inComfort: boolean | null;
  inWorkingHours: boolean;
};

type SeriesPoint = {
  timestamp: Date;
  temperature: number;
  inComfort: boolean;
  inWorkingHours: boolean;
  sampleCount: number;
  isSpurious?: boolean;
  isLatePacket?: boolean;
};

type GapRow = {
  from: Date;
  to: Date;
};

@Injectable()
export class EnvironmentsService {
  constructor(private readonly prisma: PrismaService, private readonly weatherService: WeatherService) {}

  async getSummary(environmentId: string, user: AuthUser, query: DateRangeQuery = {}) {
    const environment = await this.prisma.environment.findUnique({
      where: { id: environmentId },
      include: { store: true, device: true },
    });

    if (!environment) throw new NotFoundException("Ambiente nao encontrado");
    await this.assertEnvironmentAccess(environment, user);

    const referenceTime = await this.getReferenceTime();
    const { fromDate, toDate } = this.resolveRange(referenceTime, query);
    // Compute summary metrics in PostgreSQL instead of loading every reading
    // from a potentially 90-day window into the API process.
    const baseMetrics = await this.getSummaryMetrics(environmentId, fromDate, toDate);
    const expectedWorkingSeconds = calculateWorkingSecondsBetween(
      fromDate,
      toDate,
      environment.store.fusoHorario,
      environment.horarioFuncionamento,
    );
    const metrics = {
      ...baseMetrics,
      // This captures leading/trailing gaps too, including periods with no
      // readings at all. It is more reliable than summing only internal gaps.
      missingSeconds: Math.max(0, expectedWorkingSeconds - baseMetrics.monitoredSeconds),
    };

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
        period: { from: fromDate.toISOString(), to: toDate.toISOString() },
        metrics,
      },
      meta: { referenceTime: referenceTime.toISOString() },
    };
  }

  async getSeries(environmentId: string, query: SeriesQuery, user: AuthUser) {
    const environment = await this.prisma.environment.findUnique({
      where: { id: environmentId },
      include: { store: true },
    });
    if (!environment) throw new NotFoundException("Ambiente nao encontrado");
    await this.assertEnvironmentAccess(environment, user);

    const referenceTime = await this.getReferenceTime();
    const { fromDate, toDate } = this.resolveRange(referenceTime, query);
    const aggregation = query.aggregation ?? "hourly";
    if (aggregation === "raw" && toDate.getTime() - fromDate.getTime() > 24 * 60 * 60 * 1000) {
      throw new BadRequestException("A agregacao raw e limitada a 24 horas; utilize hourly ou 5min para periodos maiores");
    }

    let series: SeriesPoint[];
    let gaps: Array<{ from: string; to: string; reason: string; missingSeconds?: number }>;

    if (aggregation === "raw") {
      const rawReadings = await this.prisma.telemetryReading.findMany({
        where: { environmentId, timestampUtc: { gte: fromDate, lte: toDate } },
        orderBy: { timestampUtc: "asc" },
        take: 100_001,
      });
      if (rawReadings.length > 100_000) {
        throw new BadRequestException("A serie raw excede 100.000 pontos; utilize uma agregacao para esse periodo");
      }
      series = aggregateSeries(rawReadings as ReadingPoint[], "raw");
      const gapRows = await this.getGaps(environmentId, fromDate, toDate);
      gaps = this.mapGaps(
        gapRows,
        environment.store.fusoHorario,
        environment.horarioFuncionamento,
      );
    } else {
      // Aggregation and gap detection run in PostgreSQL. The API no longer
      // loads every telemetry row into memory for hourly/daily/5-minute charts.
      const [aggregatedRows, gapRows] = await Promise.all([
        this.getSeriesByAggregation(environmentId, aggregation, fromDate, toDate),
        this.getGaps(environmentId, fromDate, toDate),
      ]);
      series = aggregatedRows.map((row) => ({ ...row, inComfort: Boolean(row.inComfort) }));
      gaps = this.mapGaps(
        gapRows,
        environment.store.fusoHorario,
        environment.horarioFuncionamento,
      );
    }

    const hasValidSamples = series.some(
      (point) => point.isSpurious !== true && point.sampleCount > 0,
    );
    const status = this.resolveStatus(environment.status, hasValidSamples);
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
        aggregation,
        series,
        gaps,
        externalTemperature,
      },
      meta: { referenceTime: referenceTime.toISOString(), points: series.length },
    };
  }

  private resolveStatus(status: EnvironmentStatus, hasValidSamples: boolean) {
    return hasValidSamples ? status : "SEM_DADOS";
  }

  private resolveRange(referenceTime: Date, query: DateRangeQuery) {
    const toDate = query.to ? new Date(query.to) : referenceTime;
    let fromDate: Date;

    if (query.from) {
      fromDate = new Date(query.from);
    } else {
      const hours = query.period === "last_week" ? 24 * 7 : query.period === "last_30_days" ? 24 * 30 : 24;
      fromDate = new Date(toDate.getTime() - hours * 60 * 60 * 1000);
    }

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException("Intervalo de datas invalido");
    }
    if (fromDate > toDate) {
      throw new BadRequestException("A data inicial deve ser anterior a data final");
    }
    if (toDate.getTime() - fromDate.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(`O intervalo maximo permitido e de ${MAX_RANGE_DAYS} dias`);
    }

    return { fromDate, toDate };
  }

  private async getReferenceTime() {
    const state = await this.prisma.ingestionState.findUnique({ where: { id: "default" } });
    return state?.referenceTimeUtc ?? new Date();
  }

  private mapGaps(gaps: GapRow[], timezone: string, schedule: unknown) {
    return gaps.map((gap) => ({
      from: gap.from.toISOString(),
      to: gap.to.toISOString(),
      reason: "NO_DATA",
      missingSeconds: calculateWorkingSecondsBetween(gap.from, gap.to, timezone, schedule),
    }));
  }

  private async getSummaryMetrics(environmentId: string, fromDate: Date, toDate: Date) {
    const rows = await this.prisma.$queryRaw<Array<{
      monitoredSeconds: number | string | bigint;
      comfortSeconds: number | string | bigint;
      outOfRangeSeconds: number | string | bigint;
    }>>(Prisma.sql`
      SELECT
        COALESCE(SUM("samplingTime") FILTER (WHERE "inWorkingHours"), 0)::bigint AS "monitoredSeconds",
        COALESCE(SUM("samplingTime") FILTER (WHERE "inWorkingHours" AND "inComfort"), 0)::bigint AS "comfortSeconds",
        COALESCE(SUM("samplingTime") FILTER (WHERE "inWorkingHours" AND NOT "inComfort"), 0)::bigint AS "outOfRangeSeconds"
      FROM "TelemetryReading"
      WHERE "environmentId" = ${environmentId}
        AND "timestampUtc" >= ${fromDate}
        AND "timestampUtc" <= ${toDate}
        AND "isSpurious" = false
    `);

    const row = rows[0];
    const monitoredSeconds = Number(row?.monitoredSeconds ?? 0);
    const comfortSeconds = Number(row?.comfortSeconds ?? 0);
    return {
      comfortPercent: monitoredSeconds > 0
        ? Number(((comfortSeconds / monitoredSeconds) * 100).toFixed(2))
        : 0,
      monitoredSeconds,
      comfortSeconds,
      outOfRangeSeconds: Number(row?.outOfRangeSeconds ?? 0),
    };
  }

  private async getSeriesByAggregation(
    environmentId: string,
    aggregation: Exclude<SeriesAggregation, "raw">,
    fromDate: Date,
    toDate: Date,
  ): Promise<AggregatedSeriesRow[]> {
    const bucketExpr = aggregation === "hourly"
      ? Prisma.sql`date_trunc('hour', "timestampUtc")`
      : aggregation === "daily"
        ? Prisma.sql`date_trunc('day', "timestampUtc")`
        : Prisma.sql`date_bin('5 minutes', "timestampUtc", timestamp '2000-01-01 00:00:00')`;

    return this.prisma.$queryRaw<AggregatedSeriesRow[]>(Prisma.sql`
      SELECT
        ${bucketExpr} AS "timestamp",
        round(avg("temperature")::numeric, 2)::float8 AS "temperature",
        count(*)::int AS "sampleCount",
        COALESCE(bool_and("inComfort") FILTER (WHERE "inWorkingHours"), false) AS "inComfort",
        bool_or("inWorkingHours") AS "inWorkingHours"
      FROM "TelemetryReading"
      WHERE "environmentId" = ${environmentId}
        AND "timestampUtc" >= ${fromDate}
        AND "timestampUtc" <= ${toDate}
        AND "isSpurious" = false
      GROUP BY 1
      ORDER BY 1 ASC
    `);
  }

  private async getGaps(environmentId: string, fromDate: Date, toDate: Date) {
    return this.prisma.$queryRaw<GapRow[]>(Prisma.sql`
      WITH previous_reading AS (
        SELECT "timestampUtc", "samplingTime"
        FROM "TelemetryReading"
        WHERE "environmentId" = ${environmentId}
          AND "timestampUtc" < ${fromDate}
          AND "isSpurious" = false
        ORDER BY "timestampUtc" DESC
        LIMIT 1
      ),
      range_readings AS (
        SELECT "timestampUtc", "samplingTime"
        FROM "TelemetryReading"
        WHERE "environmentId" = ${environmentId}
          AND "timestampUtc" >= ${fromDate}
          AND "timestampUtc" <= ${toDate}
          AND "isSpurious" = false
      ),
      relevant_readings AS (
        SELECT * FROM previous_reading
        UNION ALL
        SELECT * FROM range_readings
      ),
      ordered_readings AS (
        SELECT
          *,
          lag("timestampUtc") OVER (ORDER BY "timestampUtc") AS "previousTimestamp",
          lag("samplingTime") OVER (ORDER BY "timestampUtc") AS "previousSamplingTime"
        FROM relevant_readings
      ),
      first_range_reading AS (
        SELECT "timestampUtc", "samplingTime"
        FROM range_readings
        ORDER BY "timestampUtc" ASC
        LIMIT 1
      ),
      last_relevant_reading AS (
        SELECT "timestampUtc", "samplingTime"
        FROM relevant_readings
        ORDER BY "timestampUtc" DESC
        LIMIT 1
      ),
      gaps AS (
        -- Missing intervals between two readings inside the requested range.
        SELECT
          ("previousTimestamp" + ("previousSamplingTime" * INTERVAL '1 second')) AS "from",
          "timestampUtc" AS "to"
        FROM ordered_readings
        WHERE "timestampUtc" >= ${fromDate}
          AND "timestampUtc" <= ${toDate}
          AND "previousTimestamp" >= ${fromDate}
          AND extract(epoch FROM ("timestampUtc" - "previousTimestamp")) > "previousSamplingTime" * 2

        UNION ALL

        -- A gap between the beginning of the selected period (or prior sample)
        -- and the first sample in the range.
        SELECT
          GREATEST(
            ${fromDate},
            COALESCE(
              (previous."timestampUtc" + previous."samplingTime" * INTERVAL '1 second'),
              ${fromDate}
            )
          ) AS "from",
          first_read."timestampUtc" AS "to"
        FROM first_range_reading first_read
        LEFT JOIN previous_reading previous ON TRUE
        WHERE extract(epoch FROM (
          first_read."timestampUtc" - GREATEST(
            ${fromDate},
            COALESCE(
              (previous."timestampUtc" + previous."samplingTime" * INTERVAL '1 second'),
              ${fromDate}
            )
          )
        )) > COALESCE(previous."samplingTime", first_read."samplingTime") * 2

        UNION ALL

        -- A gap from the final expected sample through the end of the range.
        SELECT
          GREATEST(
            ${fromDate},
            last_read."timestampUtc" + last_read."samplingTime" * INTERVAL '1 second'
          ) AS "from",
          ${toDate} AS "to"
        FROM last_relevant_reading last_read
        WHERE extract(epoch FROM (${toDate} - last_read."timestampUtc")) > last_read."samplingTime" * 2

        UNION ALL

        -- If there is no valid reading before or inside this period, the whole
        -- requested range is uncovered and should still be visible on the chart.
        SELECT ${fromDate} AS "from", ${toDate} AS "to"
        WHERE NOT EXISTS (SELECT 1 FROM relevant_readings)
      )
      SELECT "from", "to"
      FROM gaps
      WHERE "from" < "to"
      ORDER BY "from" ASC
    `);
  }

  private async assertEnvironmentAccess(
    environment: { id: string; storeId: string; store: { clientId: string } },
    user: AuthUser,
  ) {
    if (user.role === "ADMIN_DIEL") return;
    if (user.role === "GESTOR_CLIENTE" && user.clientId && environment.store.clientId === user.clientId) return;
    if (user.role === "GERENTE_LOJA" && user.storeIds.includes(environment.storeId)) return;
    throw new ForbiddenException("Acesso negado");
  }
}
