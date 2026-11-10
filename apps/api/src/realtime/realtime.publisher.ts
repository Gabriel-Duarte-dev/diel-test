import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../services/prisma.service";
import { RealtimeGateway } from "./realtime.gateway";

@Injectable()
export class RealtimePublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimePublisher.name);
  private timer: NodeJS.Timeout | null = null;
  private lastReferenceTimeIso: string | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly realtimeGateway: RealtimeGateway) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.publishUpdatesIfChanged();
    }, 5000);
  }

  private async publishUpdatesIfChanged() {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const state = await this.prisma.ingestionState.findUnique({
        where: { id: "default" },
        select: { referenceTimeUtc: true },
      });

      const referenceTime = state?.referenceTimeUtc ?? null;
      const referenceTimeIso = referenceTime?.toISOString() ?? null;

      if (!referenceTimeIso || referenceTimeIso === this.lastReferenceTimeIso) {
        return;
      }

      const previousReferenceIso = this.lastReferenceTimeIso;
      this.lastReferenceTimeIso = referenceTimeIso;

      this.realtimeGateway.broadcastPlatformUpdate({
        referenceTime: referenceTimeIso,
        emittedAt: new Date().toISOString(),
      });

      if (!previousReferenceIso || !referenceTime) {
        return;
      }

      const previousReference = new Date(previousReferenceIso);

      const changedEnvironmentRows = await this.prisma.telemetryReading.findMany({
        where: {
          packetTimestamp: {
            gt: previousReference,
            lte: referenceTime,
          },
        },
        distinct: ["environmentId"],
        select: { environmentId: true },
      });

      if (!changedEnvironmentRows.length) {
        return;
      }

      const changedStoreRows = await this.prisma.environment.findMany({
        where: {
          id: {
            in: changedEnvironmentRows.map((item) => item.environmentId),
          },
        },
        distinct: ["storeId"],
        select: { storeId: true },
      });

      for (const row of changedStoreRows) {
        this.realtimeGateway.broadcastStoreSnapshot(row.storeId, {
          storeId: row.storeId,
          referenceTime: referenceTimeIso,
          emittedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.logger.error("Realtime publisher tick failed", error as Error);
    } finally {
      this.running = false;
    }
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
