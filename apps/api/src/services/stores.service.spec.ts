import { StoresService } from "./stores.service";

describe("StoresService", () => {
  function createService() {
    const prisma = {
      ingestionState: {
        findUnique: jest.fn().mockResolvedValue({ referenceTimeUtc: new Date("2026-01-15T00:00:00Z") }),
      },
      store: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    return {
      service: new StoresService(prisma),
      prisma,
    };
  }

  it("aplica escopo de gerente por lojas atribuidas", async () => {
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

    expect(prisma.store.findMany).toHaveBeenCalledTimes(1);
    const whereArg = prisma.store.findMany.mock.calls[0][0].where;
    expect(whereArg.id.in).toEqual(["LOJA-RJ-001", "LOJA-SP-001"]);
  });

  it("calcula status e conforto por loja", async () => {
    const { service, prisma } = createService();

    prisma.store.findMany.mockResolvedValue([
      {
        id: "LOJA-RJ-001",
        nome: "Loja Tijuca",
        cidade: "Rio de Janeiro",
        uf: "RJ",
        ambientes: [
          {
            id: "AMB-001",
            status: "FORA_FAIXA",
            readings: [
              { samplingTime: 30, inComfort: false, inWorkingHours: true },
              { samplingTime: 30, inComfort: true, inWorkingHours: true },
            ],
          },
        ],
      },
    ]);

    const result = await service.list(
      { page: 1, limit: 10, period: "last_day", sortBy: "comfortPercent", sortDir: "asc" } as any,
      {
        userId: "USR-2",
        role: "ADMIN_DIEL",
        clientId: null,
        storeIds: [],
      },
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0].status).toBe("FORA_FAIXA");
    expect(result.data[0].comfortPercent).toBe(50);
    expect(result.data[0].environmentsOutOfRange).toBe(1);
  });
});
