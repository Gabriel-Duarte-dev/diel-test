import { PrismaService } from "./prisma.service";
import { DashboardService } from "./dashboard.service";
import { UserRole } from "@prisma/client";

describe("DashboardService", () => {
  function createService() {
    const prisma = {
      ingestionState: {
        findUnique: jest.fn().mockResolvedValue({ referenceTimeUtc: new Date("2026-01-15T12:00:00Z") }),
      },
      store: { count: jest.fn().mockResolvedValue(2) },
      environment: { count: jest.fn().mockResolvedValue(3) },
      $queryRaw: jest.fn().mockResolvedValue([{ monitoredSeconds: 100, comfortSeconds: 80 }]),
    } as unknown as PrismaService & {
      store: { count: jest.Mock };
      environment: { count: jest.Mock };
      $queryRaw: jest.Mock;
    };
    return { service: new DashboardService(prisma), prisma };
  }

  it("returns an empty snapshot for a client manager without a client", async () => {
    const { service, prisma } = createService();
    const result = await service.getSnapshot("last_day", {
      userId: "user-1",
      role: UserRole.GESTOR_CLIENTE,
      clientId: null,
      storeIds: [],
    });

    expect(result.data).toEqual({
      period: "last_day",
      storesTotal: 0,
      environmentsTotal: 0,
      environmentsOutOfRange: 0,
      avgComfortPercent: 0,
    });
    expect(prisma.store.count).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("uses database scopes without loading every store id for admins", async () => {
    const { service, prisma } = createService();
    const result = await service.getSnapshot("last_day", {
      userId: "admin-1",
      role: UserRole.ADMIN_DIEL,
      clientId: null,
      storeIds: [],
    });

    expect(result.data.avgComfortPercent).toBe(80);
    expect(prisma.store.count).toHaveBeenCalledWith({ where: {} });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
