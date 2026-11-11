import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { PrismaService } from "./prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot(period: "last_day" | "last_week" | "last_30_days", user: AuthUser) {
    const referenceTime = await this.getReferenceTime();
    const fromDate = this.getFromDate(period, referenceTime);
    const scope = this.resolveStoreScope(user);

    if (!scope) {
      return this.emptySnapshot(period, referenceTime);
    }

    const [storesTotal, environmentsTotal, environmentsOutOfRange, aggregation] = await Promise.all([
      this.prisma.store.count({ where: scope.storeWhere }),
      this.prisma.environment.count({ where: { store: { is: scope.storeWhere } } }),
      this.prisma.environment.count({
        where: { store: { is: scope.storeWhere }, status: "FORA_FAIXA" },
      }),
      this.prisma.$queryRaw<Array<{
        monitoredSeconds: bigint | number | string;
        comfortSeconds: bigint | number | string;
      }>>(Prisma.sql`
        SELECT
          COALESCE(SUM(r."samplingTime"), 0)::bigint AS "monitoredSeconds",
          COALESCE(SUM(CASE WHEN r."inComfort" = true THEN r."samplingTime" ELSE 0 END), 0)::bigint AS "comfortSeconds"
        FROM "TelemetryReading" r
        INNER JOIN "Environment" e ON e."id" = r."environmentId"
        INNER JOIN "Store" s ON s."id" = e."storeId"
        WHERE ${scope.sql}
          AND r."timestampUtc" >= ${fromDate}
          AND r."timestampUtc" <= ${referenceTime}
          AND r."isSpurious" = false
          AND r."inWorkingHours" = true
      `),
    ]);

    const monitoredSeconds = Number(aggregation[0]?.monitoredSeconds ?? 0);
    const comfortSeconds = Number(aggregation[0]?.comfortSeconds ?? 0);

    return {
      success: true,
      data: {
        period,
        storesTotal,
        environmentsTotal,
        environmentsOutOfRange,
        avgComfortPercent: monitoredSeconds > 0
          ? Number(((comfortSeconds / monitoredSeconds) * 100).toFixed(2))
          : 0,
      },
      meta: { referenceTime: referenceTime.toISOString() },
    };
  }

  private emptySnapshot(period: "last_day" | "last_week" | "last_30_days", referenceTime: Date) {
    return {
      success: true,
      data: {
        period,
        storesTotal: 0,
        environmentsTotal: 0,
        environmentsOutOfRange: 0,
        avgComfortPercent: 0,
      },
      meta: { referenceTime: referenceTime.toISOString() },
    };
  }

  private resolveStoreScope(user: AuthUser): { storeWhere: Prisma.StoreWhereInput; sql: Prisma.Sql } | null {
    if (user.role === "ADMIN_DIEL") {
      return { storeWhere: {}, sql: Prisma.sql`TRUE` };
    }

    if (user.role === "GESTOR_CLIENTE") {
      if (!user.clientId) return null;
      return {
        storeWhere: { clientId: user.clientId },
        sql: Prisma.sql`s."clientId" = ${user.clientId}`,
      };
    }

    if (!user.storeIds.length) return null;
    return {
      storeWhere: { id: { in: user.storeIds } },
      sql: Prisma.sql`s."id" IN (${Prisma.join(user.storeIds)})`,
    };
  }

  private getFromDate(period: "last_day" | "last_week" | "last_30_days", referenceTime: Date) {
    const days = period === "last_week" ? 7 : period === "last_30_days" ? 30 : 1;
    return new Date(referenceTime.getTime() - days * 24 * 60 * 60 * 1000);
  }

  private async getReferenceTime() {
    const state = await this.prisma.ingestionState.findUnique({ where: { id: "default" } });
    return state?.referenceTimeUtc ?? new Date();
  }

}
