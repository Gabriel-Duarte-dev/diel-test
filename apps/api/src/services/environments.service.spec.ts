import { ForbiddenException } from "@nestjs/common";
import { EnvironmentsService } from "./environments.service";

describe("EnvironmentsService", () => {
  function createService() {
    const prisma = {
      environment: {
        findUnique: jest.fn(),
      },
      ingestionState: {
        findUnique: jest.fn().mockResolvedValue({ referenceTimeUtc: new Date("2026-01-15T10:00:00Z") }),
      },
      telemetryReading: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
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

    prisma.environment.findUnique.mockResolvedValueOnce({
      id: "AMB-001",
      nome: "Ambiente",
      faixaConfortoMin: 21,
      faixaConfortoMax: 25,
      status: "SEM_DADOS",
      storeId: "LOJA-RJ-001",
      store: { id: "LOJA-RJ-001", clientId: "CLI-001", nome: "Loja", cidade: "Rio" },
      device: null,
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
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("uses SQL aggregates for summary metrics and counts only scheduled missing time", async () => {
    const { service, prisma } = createService();
    prisma.environment.findUnique.mockResolvedValueOnce({
      id: "AMB-001",
      nome: "Ambiente",
      faixaConfortoMin: 21,
      faixaConfortoMax: 25,
      status: "CONFORTAVEL",
      horarioFuncionamento: { qui: ["08:00", "17:00"] },
      store: {
        id: "STORE-1",
        clientId: "CLI-001",
        nome: "Loja",
        cidade: "Sao Paulo",
        fusoHorario: "UTC",
      },
      device: { id: "IOT001", status: "ONLINE", lastPacketAt: new Date("2026-01-15T11:00:00Z") },
    });
    prisma.$queryRaw.mockResolvedValueOnce([
      { monitoredSeconds: 3600n, comfortSeconds: 2700n, outOfRangeSeconds: 900n },
    ]);

    const result = await service.getSummary("AMB-001", {
      userId: "admin-1",
      role: "ADMIN_DIEL",
      clientId: null,
      storeIds: [],
    }, {
      from: "2026-01-15T08:00:00.000Z",
      to: "2026-01-15T10:00:00.000Z",
    });

    expect(prisma.telemetryReading.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result.data.period).toEqual({
      from: "2026-01-15T08:00:00.000Z",
      to: "2026-01-15T10:00:00.000Z",
    });
    expect(result.data.metrics).toEqual({
      comfortPercent: 75,
      monitoredSeconds: 3600,
      comfortSeconds: 2700,
      outOfRangeSeconds: 900,
      missingSeconds: 3600,
    });
  });

  it("retorna serie agregada para usuario autorizado", async () => {
    const { service, prisma } = createService();

    prisma.environment.findUnique.mockResolvedValueOnce({
      id: "AMB-001",
      faixaConfortoMin: 21,
      faixaConfortoMax: 25,
      status: "CONFORTAVEL",
      storeId: "LOJA-RJ-001",
      store: { id: "LOJA-RJ-001", clientId: "CLI-001", latitude: -22.9, longitude: -43.2 },
    });

    prisma.$queryRaw.mockResolvedValueOnce([
      { timestamp: new Date("2026-01-14T10:00:00Z"), temperature: 23, sampleCount: 2, inComfort: true, inWorkingHours: true },
    ]).mockResolvedValueOnce([]);

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

    prisma.environment.findUnique.mockResolvedValueOnce({
      id: "AMB-001",
      faixaConfortoMin: 21,
      faixaConfortoMax: 25,
      status: "CONFORTAVEL",
      storeId: "LOJA-RJ-001",
      store: { id: "LOJA-RJ-001", clientId: "CLI-001", latitude: -22.9, longitude: -43.2 },
    });

    prisma.$queryRaw.mockResolvedValueOnce([
      { timestamp: new Date("2026-01-14T10:00:00Z"), temperature: 23, sampleCount: 1, inComfort: true, inWorkingHours: true },
    ]).mockResolvedValueOnce([]);

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
