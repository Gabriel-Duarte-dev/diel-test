import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { ListStoresQuery } from "../presentation/dto/list-stores.query";
import { PrismaService } from "./prisma.service";

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListStoresQuery, user: AuthUser) {
    const userScope = this.buildUserScope(user);
    const where: Prisma.StoreWhereInput = {
      ...userScope,
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.search
        ? {
            OR: [
              { nome: { contains: query.search, mode: "insensitive" } },
              { cidade: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const referenceTime = await this.getReferenceTime();
    const { fromDate, toDate } = this.getRange(query.period, referenceTime);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const requiresDerivedComputation = Boolean(query.status) || query.sortBy === "comfortPercent";

    if (!requiresDerivedComputation) {
      const [total, stores] = await Promise.all([
        this.prisma.store.count({ where }),
        this.prisma.store.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: this.resolveStoreOrderBy(query.sortBy, query.sortDir),
          include: {
            ambientes: {
              include: {
                readings: {
                  where: {
                    timestampUtc: {
                      gte: fromDate,
                      lte: toDate,
                    },
                  },
                },
              },
            },
          },
        }),
      ]);

      const computed = stores.map((store) => this.computeStoreMetrics(store));

      return {
        success: true,
        data: computed,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        meta: {
          referenceTime: referenceTime.toISOString(),
        },
      };
    }

    const stores = await this.prisma.store.findMany({
      where,
      include: {
        ambientes: {
          include: {
            device: true,
            readings: {
              where: {
                timestampUtc: {
                  gte: fromDate,
                  lte: toDate,
                },
              },
            },
          },
        },
      },
    });

    const computed = stores.map((store) => this.computeStoreMetrics(store));

    const filtered = query.status ? computed.filter((store) => store.status === query.status) : computed;

    const sorted = [...filtered].sort((a, b) => {
      const direction = query.sortDir === "desc" ? -1 : 1;
      const sortBy = query.sortBy ?? "nome";

      if (sortBy === "comfortPercent") {
        return (a.comfortPercent - b.comfortPercent) * direction;
      }
      if (sortBy === "cidade") {
        return a.cidade.localeCompare(b.cidade) * direction;
      }
      return a.nome.localeCompare(b.nome) * direction;
    });

    const start = (page - 1) * limit;
    const paged = sorted.slice(start, start + limit);

    return {
      success: true,
      data: paged,
      pagination: {
        page,
        limit,
        total: filtered.length,
        totalPages: Math.ceil(filtered.length / limit),
      },
      meta: {
        referenceTime: referenceTime.toISOString(),
      },
    };
  }

  private computeStoreMetrics(store: {
    id: string;
    nome: string;
    cidade: string;
    uf: string;
    ambientes: Array<{
      id: string;
      status: string;
      readings: Array<{ samplingTime: number; inComfort: boolean; inWorkingHours: boolean }>;
    }>;
  }) {
    const environments = store.ambientes;
    const environmentsOutOfRange = environments.filter((env) => env.status === "FORA_FAIXA").length;
    const allReadings = environments.flatMap((env) => env.readings);
    const monitoredSeconds = allReadings.reduce((acc, item) => acc + item.samplingTime, 0);
    const comfortSeconds = allReadings.reduce(
      (acc, item) => acc + (item.inComfort && item.inWorkingHours ? item.samplingTime : 0),
      0,
    );
    const comfortPercent = monitoredSeconds > 0 ? (comfortSeconds / monitoredSeconds) * 100 : 0;

    const status = this.resolveStoreStatus(environmentsOutOfRange, environments.length, allReadings.length);

    return {
      id: store.id,
      nome: store.nome,
      cidade: store.cidade,
      uf: store.uf,
      status,
      environmentsCount: environments.length,
      environmentsOutOfRange,
      comfortPercent: Number(comfortPercent.toFixed(2)),
      defaultEnvironmentId: store.ambientes[0]?.id ?? null,
    };
  }

  private resolveStoreOrderBy(sortBy?: ListStoresQuery["sortBy"], sortDir?: ListStoresQuery["sortDir"]) {
    const direction = sortDir ?? "asc";

    if (sortBy === "cidade") {
      return { cidade: direction } as Prisma.StoreOrderByWithRelationInput;
    }

    return { nome: direction } as Prisma.StoreOrderByWithRelationInput;
  }

  private resolveStoreStatus(outOfRangeCount: number, totalEnvironments: number, totalReadings: number) {
    if (totalEnvironments === 0 || totalReadings === 0) {
      return "SEM_DADOS";
    }
    if (outOfRangeCount > 0) {
      return "FORA_FAIXA";
    }
    return "CONFORTAVEL";
  }

  private buildUserScope(user: AuthUser): Prisma.StoreWhereInput {
    if (user.role === "ADMIN_DIEL") {
      return {};
    }

    if (user.role === "GESTOR_CLIENTE") {
      return { clientId: user.clientId ?? undefined };
    }

    return {
      id: {
        in: user.storeIds.length ? user.storeIds : ["__none__"],
      },
    };
  }

  private getRange(period: ListStoresQuery["period"], referenceTime: Date) {
    const map = {
      last_day: 24,
      last_week: 24 * 7,
      last_30_days: 24 * 30,
    } as const;

    const hours = map[period ?? "last_day"];
    const fromDate = new Date(referenceTime.getTime() - hours * 60 * 60 * 1000);
    return { fromDate, toDate: referenceTime };
  }

  private async getReferenceTime() {
    const state = await this.prisma.ingestionState.findUnique({ where: { id: "default" } });
    return state?.referenceTimeUtc ?? new Date();
  }
}
