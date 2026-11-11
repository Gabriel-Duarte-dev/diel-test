import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../services/prisma.service";
import { RealtimeGateway } from "./realtime.gateway";

const PUBLISH_INTERVAL_MS = 5_000;
const OUTBOX_BATCH_SIZE = 200;

@Injectable()
export class RealtimePublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimePublisher.name);
  private timer: NodeJS.Timeout | null = null;
  private lastReferenceTimeIso: string | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly realtimeGateway: RealtimeGateway) {}

  onModuleInit() {
    void this.publishUpdatesIfChanged();
    this.timer = setInterval(() => void this.publishUpdatesIfChanged(), PUBLISH_INTERVAL_MS);
  }

  private async publishUpdatesIfChanged() {
    if (this.running) return;
    this.running = true;

    try {
      const state = await this.prisma.ingestionState.findUnique({
        where: { id: "default" },
        select: { referenceTimeUtc: true },
      });
      const referenceTime = state?.referenceTimeUtc ?? null;
      const referenceTimeIso = referenceTime?.toISOString() ?? null;

      const pendingEvents = await this.prisma.ingestionEvent.findMany({
        where: { processedAt: null },
        orderBy: { id: "asc" },
        take: OUTBOX_BATCH_SIZE,
        select: { id: true, storeId: true, referenceTimeUtc: true },
      });

      const referenceChanged = Boolean(referenceTimeIso && referenceTimeIso !== this.lastReferenceTimeIso);
      if (referenceChanged || pendingEvents.length > 0) {
        const published = this.realtimeGateway.broadcastPlatformUpdate({
          referenceTime: referenceTimeIso,
          emittedAt: new Date().toISOString(),
        });
        if (!published) return;
      }

      // Coalesce several rows for the same store, but keep every outbox row
      // pending until that store's snapshot has been successfully emitted.
      const eventsByStore = new Map<string, typeof pendingEvents>();
      for (const event of pendingEvents) {
        const events = eventsByStore.get(event.storeId) ?? [];
        events.push(event);
        eventsByStore.set(event.storeId, events);
      }

      for (const [storeId, events] of eventsByStore) {
        const storeReferenceTime = events.reduce(
          (latest, event) => event.referenceTimeUtc > latest ? event.referenceTimeUtc : latest,
          events[0].referenceTimeUtc,
        );

        const published = await this.realtimeGateway.broadcastStoreSnapshot(storeId, {
          storeId,
          referenceTime: storeReferenceTime.toISOString(),
          emittedAt: new Date().toISOString(),
        });
        if (!published) return;

        await this.prisma.ingestionEvent.updateMany({
          where: { id: { in: events.map((event) => event.id) }, processedAt: null },
          data: { processedAt: new Date() },
        });
      }

      // Advance only after the platform notification has been issued. Store
      // notifications are tracked independently by the durable outbox above.
      if (referenceChanged) this.lastReferenceTimeIso = referenceTimeIso;
    } catch (error) {
      // Failed events stay pending and will be retried on the next tick.
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
