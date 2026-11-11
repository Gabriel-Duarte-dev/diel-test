import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { ListStoresQuery } from "../presentation/dto/list-stores.query";
import { PrismaService } from "./prisma.service";

type StoreSummaryRow = {
  id: string;
  nome: string;
  cidade: string;
  uf: string;
  environmentsCount: number;
  environmentsWithData: number;
  environmentsOutOfRange: number;
  monitoredSeconds: number | string | bigint;
  comfortSeconds: number | string | bigint;
  defaultEnvironmentId: string | null;
  status: "CONFORTAVEL" | "FORA_FAIXA" | "SEM_DADOS";
};

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListStoresQuery, user: AuthUser) {
    const referenceTime = await this.getReferenceTime();
    const { fromDate, toDate } = this.getRange(query.period, referenceTime);
    const clauses = [this.buildUserScope(user)];

    // Additional client filters are ANDed with authorization scope; they can
    // narrow the result but can never replace or broaden the user's scope.
    if (query.clientId) clauses.push(Prisma.sql`s."clientId" = ${query.clientId}`);
    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;
      clauses.push(Prisma.sql`(s."nome" ILIKE ${search} OR s."cidade" ILIKE ${search})`);
    }

    const statusFilter = query.status
      ? Prisma.sql`"status" = ${query.status}`
      : Prisma.sql`TRUE`;
    const sortExpression = query.sortBy === "cidade"
      ? Prisma.sql`"cidade"`
      : query.sortBy === "comfortPercent"
        ? Prisma.sql`CASE
            WHEN "monitoredSeconds" > 0
              THEN "comfortSeconds"::double precision / "monitoredSeconds"
            ELSE 0
          END`
        : Prisma.sql`"nome"`;
    const sortDirection = query.sortDir === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;

    // Aggregate the readings in PostgreSQL and do status filtering, sorting,
    // counting and pagination there as well. The API only receives one page.
    const rows = await this.prisma.$queryRaw<Array<StoreSummaryRow & {
      total: number | string | bigint;
    }>>(Prisma.sql`
      WITH environment_stats AS (
        SELECT
          e."id" AS "environmentId",
          e."storeId",
          COUNT(r."id") FILTER (
            WHERE r."isSpurious" = false AND r."inWorkingHours" = true
          )::int AS "workingSampleCount",
          COUNT(r."id") FILTER (
            WHERE r."isSpurious" = false
              AND r."inWorkingHours" = true
              AND r."inComfort" = false
          )::int AS "outOfRangeSampleCount",
          COALESCE(SUM(r."samplingTime") FILTER (
            WHERE r."isSpurious" = false AND r."inWorkingHours" = true
          ), 0)::bigint AS "monitoredSeconds",
          COALESCE(SUM(r."samplingTime") FILTER (
            WHERE r."isSpurious" = false
              AND r."inWorkingHours" = true
              AND r."inComfort" = true
          ), 0)::bigint AS "comfortSeconds"
        FROM "Environment" e
        LEFT JOIN "TelemetryReading" r
          ON r."environmentId" = e."id"
          AND r."timestampUtc" >= ${fromDate}
          AND r."timestampUtc" <= ${toDate}
        GROUP BY e."id", e."storeId"
      ), store_stats AS (
        SELECT
          s."id",
          s."nome",
          s."cidade",
          s."uf",
          COUNT(es."environmentId")::int AS "environmentsCount",
          COUNT(es."environmentId") FILTER (WHERE es."workingSampleCount" > 0)::int AS "environmentsWithData",
          COUNT(es."environmentId") FILTER (WHERE es."outOfRangeSampleCount" > 0)::int AS "environmentsOutOfRange",
          COALESCE(SUM(es."monitoredSeconds"), 0)::bigint AS "monitoredSeconds",
          COALESCE(SUM(es."comfortSeconds"), 0)::bigint AS "comfortSeconds",
          MIN(es."environmentId") AS "defaultEnvironmentId",
          CASE
            WHEN COUNT(es."environmentId") = 0 THEN 'SEM_DADOS'
            WHEN COUNT(es."environmentId") FILTER (WHERE es."outOfRangeSampleCount" > 0) > 0 THEN 'FORA_FAIXA'
            WHEN COUNT(es."environmentId") FILTER (WHERE es."workingSampleCount" > 0) < COUNT(es."environmentId") THEN 'SEM_DADOS'
            ELSE 'CONFORTAVEL'
          END AS "status"
        FROM "Store" s
        LEFT JOIN environment_stats es ON es."storeId" = s."id"
        WHERE ${Prisma.join(clauses, " AND ")}
        GROUP BY s."id", s."nome", s."cidade", s."uf"
      ), filtered_stores AS (
        SELECT * FROM store_stats WHERE ${statusFilter}
      ), total_count AS (
        SELECT COUNT(*)::int AS "total" FROM filtered_stores
      ), page_rows AS (
        SELECT
          filtered_stores.*,
          ROW_NUMBER() OVER (ORDER BY ${sortExpression} ${sortDirection}, "id" ASC) AS "__pageOrder"
        FROM filtered_stores
        ORDER BY ${sortExpression} ${sortDirection}, "id" ASC
        LIMIT ${limit} OFFSET ${offset}
      )
      SELECT page_rows.*, total_count."total"
      FROM total_count
      LEFT JOIN page_rows ON TRUE
      ORDER BY page_rows."__pageOrder" ASC
    `);

    const total = Number(rows[0]?.total ?? 0);
    const pageRows = rows.filter((store) => typeof store.id === "string");
    const data = pageRows.map((store) => ({
      id: store.id,
      nome: store.nome,
      cidade: store.cidade,
      uf: store.uf,
      status: store.status,
      environmentsCount: Number(store.environmentsCount),
      environmentsOutOfRange: Number(store.environmentsOutOfRange),
      comfortPercent: this.getComfortPercent(store),
      defaultEnvironmentId: store.defaultEnvironmentId,
    }));

    return {
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      meta: { referenceTime: referenceTime.toISOString() },
    };
  }

  private getComfortPercent(store: StoreSummaryRow) {
    const monitoredSeconds = Number(store.monitoredSeconds ?? 0);
    const comfortSeconds = Number(store.comfortSeconds ?? 0);
    return monitoredSeconds > 0 ? Number(((comfortSeconds / monitoredSeconds) * 100).toFixed(2)) : 0;
  }

  private buildUserScope(user: AuthUser): Prisma.Sql {
    if (user.role === "ADMIN_DIEL") return Prisma.sql`TRUE`;
    if (user.role === "GESTOR_CLIENTE") {
      return user.clientId ? Prisma.sql`s."clientId" = ${user.clientId}` : Prisma.sql`FALSE`;
    }
    return user.storeIds.length
      ? Prisma.sql`s."id" IN (${Prisma.join(user.storeIds)})`
      : Prisma.sql`FALSE`;
  }

  private getRange(period: ListStoresQuery["period"], referenceTime: Date) {
    const map = { last_day: 24, last_week: 24 * 7, last_30_days: 24 * 30 } as const;
    const hours = map[period ?? "last_day"];
    return {
      fromDate: new Date(referenceTime.getTime() - hours * 60 * 60 * 1000),
      toDate: referenceTime,
    };
  }

  private async getReferenceTime() {
    const state = await this.prisma.ingestionState.findUnique({ where: { id: "default" } });
    return state?.referenceTimeUtc ?? new Date();
  }
}
