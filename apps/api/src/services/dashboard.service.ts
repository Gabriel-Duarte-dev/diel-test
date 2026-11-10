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

    const storeScope = await this.resolveStoreScope(user);

    if (storeScope.length === 0 || (storeScope.length === 1 && storeScope[0] === "__none__")) {
      return {
        success: true,
        data: {
          period,
          storesTotal: 0,
          environmentsTotal: 0,
          environmentsOutOfRange: 0,
          avgComfortPercent: 0,
        },
        meta: {
          referenceTime: referenceTime.toISOString(),
        },
      };
    }

    const environmentWhere = {
      storeId: {
        in: storeScope,
      },
    };

    const [environmentsTotal, environmentsOutOfRange, stores] = await Promise.all([
      this.prisma.environment.count({
        where: environmentWhere,
      }),
      this.prisma.environment.count({
        where: {
          ...environmentWhere,
          status: "FORA_FAIXA",
        },
      }),
      this.prisma.environment.findMany({
        where: environmentWhere,
        distinct: ["storeId"],
        select: { storeId: true },
      }),
    ]);

    const readingsAggregation = await this.prisma.$queryRaw<
      Array<{ monitoredseconds: bigint | number | string | null; comfortseconds: bigint | number | string | null }>
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(r."samplingTime"), 0) AS monitoredSeconds,
        COALESCE(SUM(CASE WHEN r."inComfort" = true AND r."inWorkingHours" = true THEN r."samplingTime" ELSE 0 END), 0) AS comfortSeconds
      FROM "TelemetryReading" r
      INNER JOIN "Environment" e ON e."id" = r."environmentId"
      WHERE e."storeId" IN (${Prisma.join(storeScope)})
        AND r."timestampUtc" >= ${fromDate}
        AND r."timestampUtc" <= ${referenceTime}
    `);

    const monitoredSeconds = Number(readingsAggregation[0]?.monitoredseconds ?? 0);
    const comfortSeconds = Number(readingsAggregation[0]?.comfortseconds ?? 0);

    return {
      success: true,
      data: {
        period,
        storesTotal: stores.length,
        environmentsTotal,
        environmentsOutOfRange,
        avgComfortPercent: monitoredSeconds > 0 ? Number(((comfortSeconds / monitoredSeconds) * 100).toFixed(2)) : 0,
      },
      meta: {
        referenceTime: referenceTime.toISOString(),
      },
    };
  }

  private getFromDate(period: "last_day" | "last_week" | "last_30_days", referenceTime: Date) {
    if (period === "last_week") {
      return new Date(referenceTime.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    if (period === "last_30_days") {
      return new Date(referenceTime.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    return new Date(referenceTime.getTime() - 24 * 60 * 60 * 1000);
  }

  private async getReferenceTime() {
    const state = await this.prisma.ingestionState.findUnique({ where: { id: "default" } });
    return state?.referenceTimeUtc ?? new Date();
  }

  private async resolveStoreScope(user: AuthUser) {
    if (user.role === "ADMIN_DIEL") {
      const stores = await this.prisma.store.findMany({ select: { id: true } });
      return stores.map((item) => item.id);
    }

    if (user.role === "GESTOR_CLIENTE") {
      const stores = await this.prisma.store.findMany({
        where: { clientId: user.clientId ?? undefined },
        select: { id: true },
      });
      return stores.map((item) => item.id);
    }

    return user.storeIds.length ? user.storeIds : ["__none__"];
  }
}
