import { ForbiddenException } from "@nestjs/common";
import { EnvironmentsService } from "./environments.service";

describe("EnvironmentsService", () => {
  function createService() {
    const prisma = {
      environment: {
        findUnique: jest.fn(),
      },
      ingestionState: {
        findUnique: jest.fn().mockResolvedValue({ referenceTimeUtc: new Date("2026-01-15T00:00:00Z") }),
      },
      telemetryReading: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const weatherService = {
      getExternalSeriesForStore: jest.fn().mockResolvedValue([]),
    } as any;

    return {
      service: new EnvironmentsService(prisma, weatherService),
      prisma,
      weatherService,
    };
  }

  it("bloqueia acesso de gerente fora do escopo", async () => {
    const { service, prisma } = createService();

    prisma.environment.findUnique
      .mockResolvedValueOnce({
        id: "AMB-001",
        nome: "Ambiente",
        faixaConfortoMin: 21,
        faixaConfortoMax: 25,
        status: "SEM_DADOS",
        storeId: "LOJA-RJ-001",
        store: {
          id: "LOJA-RJ-001",
          clientId: "CLI-001",
          nome: "Loja",
          cidade: "Rio",
        },
        device: null,
      })
      .mockResolvedValueOnce({
        id: "AMB-001",
        storeId: "LOJA-RJ-001",
        store: {
          id: "LOJA-RJ-001",
          clientId: "CLI-001",
        },
      });

    await expect(
      service.getSummary(
        "AMB-001",
        {
          userId: "USR-3",
          role: "GERENTE_LOJA",
          clientId: null,
          storeIds: ["LOJA-SP-001"],
        },
        undefined,
        undefined,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("retorna serie agregada para usuario autorizado", async () => {
    const { service, prisma } = createService();

    prisma.environment.findUnique
      .mockResolvedValueOnce({
        id: "AMB-001",
        faixaConfortoMin: 21,
        faixaConfortoMax: 25,
        status: "CONFORTAVEL",
        storeId: "LOJA-RJ-001",
      })
      .mockResolvedValueOnce({
        id: "AMB-001",
        storeId: "LOJA-RJ-001",
        store: {
          id: "LOJA-RJ-001",
          clientId: "CLI-001",
        },
      });

    prisma.telemetryReading.findMany.mockResolvedValue([
      {
        timestampUtc: new Date("2026-01-14T10:00:00Z"),
        temperature: 22,
        inComfort: true,
        inWorkingHours: true,
        isLatePacket: false,
        isSpurious: false,
        samplingTime: 30,
      },
      {
        timestampUtc: new Date("2026-01-14T10:10:00Z"),
        temperature: 24,
        inComfort: true,
        inWorkingHours: true,
        isLatePacket: false,
        isSpurious: false,
        samplingTime: 30,
      },
    ]);

    const result = await service.getSeries(
      "AMB-001",
      { aggregation: "hourly", period: "last_day" } as any,
      {
        userId: "USR-4",
        role: "GESTOR_CLIENTE",
        clientId: "CLI-001",
        storeIds: [],
      },
    );

    expect(result.success).toBe(true);
    expect(result.data.series.length).toBeGreaterThan(0);
    expect(result.meta.points).toBe(result.data.series.length);
  });

  it("inclui temperatura externa quando includeExternal=true", async () => {
    const { service, prisma, weatherService } = createService();

    prisma.environment.findUnique
      .mockResolvedValueOnce({
        id: "AMB-001",
        faixaConfortoMin: 21,
        faixaConfortoMax: 25,
        status: "CONFORTAVEL",
        storeId: "LOJA-RJ-001",
        store: {
          id: "LOJA-RJ-001",
          clientId: "CLI-001",
          latitude: -22.9,
          longitude: -43.2,
        },
      })
      .mockResolvedValueOnce({
        id: "AMB-001",
        storeId: "LOJA-RJ-001",
        store: {
          id: "LOJA-RJ-001",
          clientId: "CLI-001",
        },
      });

    prisma.telemetryReading.findMany.mockResolvedValue([]);
    weatherService.getExternalSeriesForStore.mockResolvedValue([
      { timestampUtc: new Date("2026-01-14T10:00:00Z"), temperature: 29.1, source: "open-meteo" },
    ]);

    const result = await service.getSeries(
      "AMB-001",
      { aggregation: "hourly", period: "last_day", includeExternal: "true" } as any,
      {
        userId: "USR-4",
        role: "GESTOR_CLIENTE",
        clientId: "CLI-001",
        storeIds: [],
      },
    );

    expect(weatherService.getExternalSeriesForStore).toHaveBeenCalledTimes(1);
    expect(result.data.externalTemperature).toHaveLength(1);
  });
});
