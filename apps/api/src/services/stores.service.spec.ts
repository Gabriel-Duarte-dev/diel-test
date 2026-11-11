import { StoresService } from "./stores.service";

describe("StoresService", () => {
  function createService(rows: unknown[] = []) {
    const prisma = {
      ingestionState: {
        findUnique: jest.fn().mockResolvedValue({ referenceTimeUtc: new Date("2026-01-15T00:00:00Z") }),
      },
      $queryRaw: jest.fn().mockResolvedValue(
        rows.length
          ? rows.map((row) => Object.assign({}, row, { total: rows.length }))
          : [{ id: null, total: 0 }],
      ),
    } as any;
    return { service: new StoresService(prisma), prisma };
  }

  it("queries only stores assigned to a store manager", async () => {
    const { service, prisma } = createService();
    await service.list(
      { page: 1, limit: 10, period: "last_day" } as any,
      {
        userId: "USR-1",
        role: "GERENTE_LOJA",
        clientId: null,
        storeIds: ["LOJA-RJ-001", "LOJA-SP-001"],
      },
    );

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const query = prisma.$queryRaw.mock.calls[0][0];
    expect(query.values).toEqual(expect.arrayContaining(["LOJA-RJ-001", "LOJA-SP-001"]));
  });

  it("calculates status and comfort using valid samples during working hours", async () => {
    const { service } = createService([
      {
        id: "LOJA-RJ-001",
        nome: "Loja Tijuca",
        cidade: "Rio de Janeiro",
        uf: "RJ",
        environmentsCount: 1,
        environmentsWithData: 1,
        environmentsOutOfRange: 1,
        monitoredSeconds: 60n,
        comfortSeconds: 30n,
        defaultEnvironmentId: "AMB-001",
        status: "FORA_FAIXA",
      },
    ]);

    const result = await service.list(
      { page: 1, limit: 10, period: "last_day", sortBy: "comfortPercent", sortDir: "asc" } as any,
      { userId: "USR-2", role: "ADMIN_DIEL", clientId: null, storeIds: [] },
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0].status).toBe("FORA_FAIXA");
    expect(result.data[0].comfortPercent).toBe(50);
    expect(result.data[0].environmentsOutOfRange).toBe(1);
  });

  it("returns no stores for a client manager without a client association", async () => {
    const { service, prisma } = createService();
    await service.list(
      { page: 1, limit: 10, period: "last_day" } as any,
      { userId: "USR-3", role: "GESTOR_CLIENTE", clientId: null, storeIds: [] },
    );

    const query = prisma.$queryRaw.mock.calls[0][0];
    expect(query.values).not.toContain(undefined);
    expect(query.sql).toContain("FALSE");
  });

  it("combines a requested client filter with the authenticated store scope", async () => {
    const { service, prisma } = createService();
    await service.list(
      { page: 1, limit: 10, period: "last_day", clientId: "other-client" } as any,
      {
        userId: "manager-1",
        role: "GESTOR_CLIENTE",
        clientId: "own-client",
        storeIds: [],
      },
    );

    const query = prisma.$queryRaw.mock.calls[0][0];
    expect(query.values).toContain("own-client");
    expect(query.values).toContain("other-client");
    expect(query.sql).toContain(" AND ");
  });

  it("applies status filtering, sorting and pagination in PostgreSQL", async () => {
    const { service, prisma } = createService();
    await service.list(
      {
        page: 2,
        limit: 5,
        period: "last_day",
        status: "FORA_FAIXA",
        sortBy: "cidade",
        sortDir: "desc",
      } as any,
      { userId: "admin", role: "ADMIN_DIEL", clientId: null, storeIds: [] },
    );

    const query = prisma.$queryRaw.mock.calls[0][0];
    expect(query.sql).toContain('ORDER BY "cidade" DESC');
    expect(query.sql).toContain("LIMIT");
    expect(query.sql).toContain("OFFSET");
    expect(query.values).toEqual(expect.arrayContaining(["FORA_FAIXA", 5, 5]));
  });

  it("caps page size at 100 even when called outside DTO validation", async () => {
    const { service } = createService();
    const result = await service.list(
      { page: 1, limit: 1000, period: "last_day" } as any,
      { userId: "USR-2", role: "ADMIN_DIEL", clientId: null, storeIds: [] },
    );
    expect(result.pagination.limit).toBe(100);
  });
});
