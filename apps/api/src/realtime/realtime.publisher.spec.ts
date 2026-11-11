import { PrismaService } from "../services/prisma.service";
import { RealtimeGateway } from "./realtime.gateway";
import { RealtimePublisher } from "./realtime.publisher";

describe("RealtimePublisher", () => {
  function createPublisher(
    events: Array<{ id: bigint; storeId: string; referenceTimeUtc: Date }> = [],
    snapshotResult = true,
  ) {
    const prisma = {
      ingestionState: {
        findUnique: jest.fn().mockResolvedValue({
          referenceTimeUtc: new Date("2026-01-01T12:00:00.000Z"),
        }),
      },
      ingestionEvent: {
        findMany: jest.fn().mockResolvedValue(events),
        updateMany: jest.fn().mockResolvedValue({ count: events.length }),
      },
    } as unknown as PrismaService & {
      ingestionEvent: { findMany: jest.Mock; updateMany: jest.Mock };
    };
    const gateway = {
      broadcastPlatformUpdate: jest.fn().mockReturnValue(true),
      broadcastStoreSnapshot: jest.fn().mockResolvedValue(snapshotResult),
    } as unknown as RealtimeGateway & {
      broadcastPlatformUpdate: jest.Mock;
      broadcastStoreSnapshot: jest.Mock;
    };
    const publisher = new RealtimePublisher(prisma, gateway);
    const runTick = (publisher as unknown as { publishUpdatesIfChanged: () => Promise<void> })
      .publishUpdatesIfChanged.bind(publisher);
    return { publisher, prisma, gateway, runTick };
  }

  it("publishes and acknowledges pending store events only after successful emission", async () => {
    const { prisma, gateway, runTick } = createPublisher([
      { id: 1n, storeId: "store-1", referenceTimeUtc: new Date("2026-01-01T11:00:00.000Z") },
      { id: 2n, storeId: "store-1", referenceTimeUtc: new Date("2026-01-01T11:30:00.000Z") },
    ]);

    await runTick();

    expect(gateway.broadcastStoreSnapshot).toHaveBeenCalledWith(
      "store-1",
      expect.objectContaining({ referenceTime: "2026-01-01T11:30:00.000Z" }),
    );
    expect(prisma.ingestionEvent.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1n, 2n] }, processedAt: null },
      data: { processedAt: expect.any(Date) },
    });
  });

  it("keeps pending events when a store snapshot cannot be emitted", async () => {
    const { prisma, gateway, runTick } = createPublisher([
      { id: 3n, storeId: "store-2", referenceTimeUtc: new Date("2026-01-01T11:00:00.000Z") },
    ], false);

    await runTick();

    expect(gateway.broadcastStoreSnapshot).toHaveBeenCalledTimes(1);
    expect(prisma.ingestionEvent.updateMany).not.toHaveBeenCalled();
  });
});
