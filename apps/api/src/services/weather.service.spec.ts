import { PrismaService } from "./prisma.service";
import { WeatherService } from "./weather.service";

describe("WeatherService", () => {
  const store = { id: "store-1", latitude: -23.5, longitude: -46.6 };
  const from = new Date("2026-01-01T00:00:00.000Z");
  const to = new Date("2026-01-01T02:00:00.000Z");

  afterEach(() => jest.restoreAllMocks());

  function createService(cachedRows: Array<{ timestampUtc: Date }> = []) {
    const prisma = {
      externalTemperature: {
        findMany: jest.fn().mockResolvedValue(cachedRows),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaService & {
      externalTemperature: {
        findMany: jest.Mock;
        createMany: jest.Mock;
      };
    };
    return { service: new WeatherService(prisma), prisma };
  }

  it("does not fetch when every expected UTC hour is cached", async () => {
    const { service } = createService([
      { timestampUtc: from },
      { timestampUtc: new Date("2026-01-01T01:00:00.000Z") },
      { timestampUtc: to },
    ]);
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true } as Response);

    await service.getExternalSeriesForStore(store, from, to);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches again when the cached range contains a hole", async () => {
    const { service, prisma } = createService([
      { timestampUtc: from },
      { timestampUtc: to },
    ]);
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        hourly: {
          time: ["2026-01-01T00:00", "2026-01-01T01:00", "2026-01-01T02:00"],
          temperature_2m: [25, 26, 27],
        },
      }),
    } as Response);

    await service.getExternalSeriesForStore(store, from, to);

    expect(prisma.externalTemperature.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ timestampUtc: new Date("2026-01-01T01:00:00.000Z") }),
      ]),
      skipDuplicates: true,
    }));
  });

  it("does not throw when Open-Meteo is unavailable", async () => {
    const { service } = createService();
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("network unavailable"));

    await expect(service.getExternalSeriesForStore(store, from, to)).resolves.toEqual([]);
  });
});
