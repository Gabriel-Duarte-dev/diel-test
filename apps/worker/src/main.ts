import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";
import {
  indexEnvironmentsByDeviceId,
  isSpurious,
  isWithinWorkingHours,
  toUtcPacketTimestamp,
  toUtcSamples,
  validateTelemetryPacket,
  type TelemetryPacket,
} from "./telemetry";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run the telemetry worker");
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

const BATCH_SIZE = Number(process.env.INGESTION_BATCH_SIZE ?? 100);
const MAX_BATCH_SIZE = Number.isFinite(BATCH_SIZE) ? Math.min(Math.max(1, Math.floor(BATCH_SIZE)), 100) : 100;

type EnvironmentContext = {
  id: string;
  devId: string;
  storeId: string;
  faixaConfortoMin: number;
  faixaConfortoMax: number;
  horarioFuncionamento: Prisma.JsonValue;
  store: {
    id: string;
    fusoHorario: string;
  };
};

type PendingPacket = {
  packet: TelemetryPacket;
  sourceLine: number;
  sourceKey: string;
  packetUtc: Date;
  environment: EnvironmentContext | null;
};

type PendingReading = {
  id: string;
  devId: string;
  environmentId: string;
  packetTimestamp: Date;
  packetGmt: number;
  samplingTime: number;
  timestampUtc: Date;
  temperature: number;
  inComfort: boolean;
  inWorkingHours: boolean;
  isLatePacket: boolean;
  isSpurious: boolean;
  sourcePacketId: string;
};

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

async function loadEnvironmentContexts(): Promise<Map<string, EnvironmentContext>> {
  const environments = await prisma.environment.findMany({
    select: {
      id: true,
      devId: true,
      storeId: true,
      faixaConfortoMin: true,
      faixaConfortoMax: true,
      horarioFuncionamento: true,
      store: {
        select: {
          id: true,
          fusoHorario: true,
        },
      },
    },
  });

  // Telemetry packets identify devices by dev_id, not Environment.id.
  return indexEnvironmentsByDeviceId(environments);
}

async function flushBatch(batch: PendingPacket[]) {
  if (!batch.length) return;

  const touchedStores = new Map<string, Date>();
  const latestPacketByDevice = new Map<string, Date>();
  const pendingReadings = new Map<string, PendingReading>();

  await prisma.$transaction(async (tx) => {
    // Upsert raw packets by stable source key. Re-running the same file does not
    // duplicate the raw packet, while a changed file gets a new content hash.
    const rawPacketTuples = batch.map((item) => Prisma.sql`(
      ${randomUUID()}, ${item.packet.dev_id}, ${item.packetUtc}, ${item.packet.GMT},
      ${item.packet.samplingTime}, ${JSON.stringify(item.packet.Temperature)}::jsonb,
      ${Boolean(item.packet.saved_data)}, ${item.sourceLine}, ${item.sourceKey}, NOW()
    )`);

    const rawPackets = await tx.$queryRaw<Array<{ id: string; sourceKey: string }>>(Prisma.sql`
      INSERT INTO "RawTelemetryPacket" (
        "id", "devId", "timestamp", "gmt", "samplingTime", "temperatures",
        "savedData", "sourceLine", "sourceKey", "createdAt"
      ) VALUES ${Prisma.join(rawPacketTuples)}
      ON CONFLICT ("sourceKey") DO UPDATE SET
        "devId" = EXCLUDED."devId",
        "timestamp" = EXCLUDED."timestamp",
        "gmt" = EXCLUDED."gmt",
        "samplingTime" = EXCLUDED."samplingTime",
        "temperatures" = EXCLUDED."temperatures",
        "savedData" = EXCLUDED."savedData",
        "sourceLine" = EXCLUDED."sourceLine"
      RETURNING "id", "sourceKey"
    `);
    const rawPacketIds = new Map(rawPackets.map((packet) => [packet.sourceKey, packet.id]));

    for (let index = 0; index < batch.length; index += 1) {
      const item = batch[index];
      const previousDeviceTime = latestPacketByDevice.get(item.packet.dev_id);
      if (!previousDeviceTime || item.packetUtc > previousDeviceTime) {
        latestPacketByDevice.set(item.packet.dev_id, item.packetUtc);
      }

      const environment = item.environment;
      if (!environment) continue;
      const previousStoreTime = touchedStores.get(environment.storeId);
      if (!previousStoreTime || item.packetUtc > previousStoreTime) {
        touchedStores.set(environment.storeId, item.packetUtc);
      }

      for (const sample of toUtcSamples(item.packet)) {
        const spurious = isSpurious(sample.temperature);
        const inWorkingHours = isWithinWorkingHours(
          sample.timestampUtc,
          environment.store.fusoHorario,
          environment.horarioFuncionamento,
        );
        const key = `${item.packet.dev_id}:${sample.timestampUtc.getTime()}`;
        // Duplicated samples may occur in separate packets in the same batch.
        // Keep the last packet's version to avoid PostgreSQL's same-row conflict.
        pendingReadings.set(key, {
          id: randomUUID(),
          devId: item.packet.dev_id,
          environmentId: environment.id,
          packetTimestamp: item.packetUtc,
          packetGmt: item.packet.GMT,
          samplingTime: item.packet.samplingTime,
          timestampUtc: sample.timestampUtc,
          temperature: sample.temperature,
          inComfort:
            sample.temperature >= environment.faixaConfortoMin &&
            sample.temperature <= environment.faixaConfortoMax,
          inWorkingHours,
          isLatePacket: sample.isLatePacket,
          isSpurious: spurious,
          sourcePacketId: rawPacketIds.get(item.sourceKey)!,
        });
      }
    }

    // Ensure device rows exist with one parameterized bulk upsert instead of
    // issuing one Prisma upsert request per device.
    const deviceContexts = new Map<string, string>();
    for (const item of batch) {
      if (item.environment) deviceContexts.set(item.packet.dev_id, item.environment.id);
    }
    const deviceContextTuples = [...deviceContexts.entries()].map(([deviceId, environmentId]) =>
      Prisma.sql`(${deviceId}, ${environmentId}, NOW(), NOW())`,
    );
    if (deviceContextTuples.length) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "Device" ("id", "environmentId", "createdAt", "updatedAt")
        VALUES ${Prisma.join(deviceContextTuples)}
        ON CONFLICT ("id") DO UPDATE SET
          "environmentId" = EXCLUDED."environmentId",
          "updatedAt" = NOW()
      `);
    }

    const readings = [...pendingReadings.values()];
    // Keep each INSERT under PostgreSQL's bind-parameter limit, even if a
    // malformed but validly-shaped source packet contains many samples.
    const READINGS_PER_INSERT = 2_000;
    for (let offset = 0; offset < readings.length; offset += READINGS_PER_INSERT) {
      const chunk = readings.slice(offset, offset + READINGS_PER_INSERT);
      const readingTuples = chunk.map((reading) => Prisma.sql`(
        ${reading.id}, ${reading.devId}, ${reading.environmentId},
        ${reading.packetTimestamp}, ${reading.packetGmt}, ${reading.samplingTime},
        ${reading.timestampUtc}, ${reading.temperature}, ${reading.inComfort},
        ${reading.inWorkingHours}, ${reading.isLatePacket}, ${reading.isSpurious},
        ${reading.sourcePacketId}, NOW()
      )`);

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "TelemetryReading" (
          "id", "devId", "environmentId", "packetTimestamp", "packetGmt",
          "samplingTime", "timestampUtc", "temperature", "inComfort",
          "inWorkingHours", "isLatePacket", "isSpurious", "sourcePacketId", "createdAt"
        ) VALUES ${Prisma.join(readingTuples)}
        ON CONFLICT ("devId", "timestampUtc") DO UPDATE SET
          "environmentId" = EXCLUDED."environmentId",
          "packetTimestamp" = EXCLUDED."packetTimestamp",
          "packetGmt" = EXCLUDED."packetGmt",
          "samplingTime" = EXCLUDED."samplingTime",
          "temperature" = EXCLUDED."temperature",
          "inComfort" = EXCLUDED."inComfort",
          "inWorkingHours" = EXCLUDED."inWorkingHours",
          "isLatePacket" = EXCLUDED."isLatePacket",
          "isSpurious" = EXCLUDED."isSpurious",
          "sourcePacketId" = EXCLUDED."sourcePacketId"
      `);
    }

    const deviceTuples = [...latestPacketByDevice.entries()].map(([deviceId, timestamp]) =>
      Prisma.sql`(${deviceId}, ${timestamp}::TIMESTAMP(3))`,
    );
    if (deviceTuples.length) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "Device" AS device
        SET "lastPacketAt" = GREATEST(COALESCE(device."lastPacketAt", incoming."lastPacketAt"), incoming."lastPacketAt"),
            "updatedAt" = NOW()
        FROM (VALUES ${Prisma.join(deviceTuples)}) AS incoming("id", "lastPacketAt")
        WHERE device."id" = incoming."id"
      `);
    }

    const batchReferenceTime = batch.reduce(
      (latest, item) => (item.packetUtc > latest ? item.packetUtc : latest),
      batch[0].packetUtc,
    );
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "IngestionState" ("id", "referenceTimeUtc", "updatedAt")
      VALUES ('default', ${batchReferenceTime}, NOW())
      ON CONFLICT ("id") DO UPDATE SET
        "referenceTimeUtc" = GREATEST("IngestionState"."referenceTimeUtc", EXCLUDED."referenceTimeUtc"),
        "updatedAt" = NOW()
    `);

    // Recalculate status only for devices/environments belonging to stores
    // touched by this batch. A full reconciliation runs once after ingestion.
    // This avoids repeatedly scanning every synthetic device in a scaled seed.
    const touchedStoreIds = [...touchedStores.keys()];
    if (touchedStoreIds.length) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "Device" AS device
        SET "status" = CASE
          WHEN device."lastPacketAt" IS NULL
            OR device."lastPacketAt" < state."referenceTimeUtc" - INTERVAL '24 hours'
            THEN 'SEM_DADOS'::"DeviceStatus"
          WHEN device."lastPacketAt" < state."referenceTimeUtc" - INTERVAL '5 minutes'
            THEN 'OFFLINE'::"DeviceStatus"
          ELSE 'ONLINE'::"DeviceStatus"
        END,
        "updatedAt" = NOW()
        FROM "IngestionState" AS state
        WHERE state."id" = 'default'
          AND device."environmentId" IN (
            SELECT environment."id"
            FROM "Environment" AS environment
            WHERE environment."storeId" IN (${Prisma.join(touchedStoreIds)})
          )
      `);

      await tx.$executeRaw(Prisma.sql`
        UPDATE "Environment" AS environment
        SET "status" = CASE
          WHEN device."status" <> 'ONLINE'::"DeviceStatus"
            OR latest."timestampUtc" IS NULL
            OR latest."packetTimestamp" < device."lastPacketAt"
            THEN 'SEM_DADOS'::"EnvironmentStatus"
          WHEN latest."inWorkingHours" = false
            THEN 'SEM_DADOS'::"EnvironmentStatus"
          WHEN latest."inComfort" = true
            THEN 'CONFORTAVEL'::"EnvironmentStatus"
          ELSE 'FORA_FAIXA'::"EnvironmentStatus"
        END,
        "updatedAt" = NOW()
        FROM "Device" AS device
        LEFT JOIN LATERAL (
          SELECT reading."timestampUtc", reading."packetTimestamp", reading."inWorkingHours", reading."inComfort"
          FROM "TelemetryReading" AS reading
          WHERE reading."environmentId" = device."environmentId"
            AND reading."isSpurious" = false
          ORDER BY reading."timestampUtc" DESC
          LIMIT 1
        ) AS latest ON TRUE
        WHERE environment."id" = device."environmentId"
          AND environment."storeId" IN (${Prisma.join(touchedStoreIds)})
      `);
    }

    if (touchedStores.size) {
      await tx.ingestionEvent.createMany({
        data: [...touchedStores.entries()].map(([storeId, referenceTimeUtc]) => ({
          storeId,
          referenceTimeUtc,
        })),
      });
    }
  }, { maxWait: 10_000, timeout: 60_000 });
}

async function ingest() {
  const inputPath = process.env.TELEMETRY_FILE
    ? path.resolve(process.env.TELEMETRY_FILE)
    : path.resolve(__dirname, "../../../dados/telemetrias.jsonl");
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Telemetry file not found: ${inputPath}`);
  }

  const sourceHash = await hashFile(inputPath);
  const environments = await loadEnvironmentContexts();
  const lines = createInterface({ input: createReadStream(inputPath), crlfDelay: Infinity });

  let sourceLine = 0;
  let processedPackets = 0;
  let skippedEmptyLines = 0;
  let batch: PendingPacket[] = [];

  for await (const line of lines) {
    sourceLine += 1;
    if (!line.trim()) {
      skippedEmptyLines += 1;
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`Invalid JSON at line ${sourceLine}`);
    }

    const packet = validateTelemetryPacket(parsed, sourceLine);
    const packetUtc = toUtcPacketTimestamp(packet.timestamp, packet.GMT);
    batch.push({
      packet,
      sourceLine,
      sourceKey: `${sourceHash}:${sourceLine}`,
      packetUtc,
      environment: environments.get(packet.dev_id) ?? null,
    });

    if (batch.length >= MAX_BATCH_SIZE) {
      await flushBatch(batch);
      processedPackets += batch.length;
      console.log(`processed ${processedPackets} packets (line ${sourceLine})`);
      batch = [];
    }
  }

  if (batch.length) {
    await flushBatch(batch);
    processedPackets += batch.length;
  }

  const state = await prisma.ingestionState.findUnique({ where: { id: "default" } });
  if (state) {
    await recalculateStatuses(state.referenceTimeUtc);
  }

  console.log(
    `ingestion completed: ${processedPackets} packets; ${skippedEmptyLines} empty lines; ${sourceLine} lines; batch=${MAX_BATCH_SIZE}`,
  );
}

async function recalculateStatuses(referenceTimeUtc: Date) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "Device"
      SET "status" = CASE
        WHEN "lastPacketAt" IS NULL
          OR "lastPacketAt" < ${referenceTimeUtc} - INTERVAL '24 hours'
          THEN 'SEM_DADOS'::"DeviceStatus"
        WHEN "lastPacketAt" < ${referenceTimeUtc} - INTERVAL '5 minutes'
          THEN 'OFFLINE'::"DeviceStatus"
        ELSE 'ONLINE'::"DeviceStatus"
      END,
      "updatedAt" = NOW()
    `);

    await tx.$executeRaw(Prisma.sql`
      WITH latest_readings AS (
        SELECT DISTINCT ON ("environmentId")
          "environmentId", "timestampUtc", "packetTimestamp", "inWorkingHours", "inComfort"
        FROM "TelemetryReading"
        WHERE "isSpurious" = false
        ORDER BY "environmentId", "timestampUtc" DESC
      ), environment_statuses AS (
        SELECT
          environment."id",
          device."status" AS "deviceStatus",
          latest."timestampUtc",
          latest."packetTimestamp",
          device."lastPacketAt" AS "deviceLastPacketAt",
          latest."inWorkingHours",
          latest."inComfort"
        FROM "Environment" AS environment
        LEFT JOIN "Device" AS device
          ON device."environmentId" = environment."id"
        LEFT JOIN latest_readings AS latest
          ON latest."environmentId" = environment."id"
      )
      UPDATE "Environment" AS environment
      SET "status" = CASE
        WHEN statuses."deviceStatus" IS DISTINCT FROM 'ONLINE'::"DeviceStatus"
          OR statuses."timestampUtc" IS NULL
          OR statuses."packetTimestamp" < statuses."deviceLastPacketAt"
          OR statuses."inWorkingHours" = false
          THEN 'SEM_DADOS'::"EnvironmentStatus"
        WHEN statuses."inComfort" = true
          THEN 'CONFORTAVEL'::"EnvironmentStatus"
        ELSE 'FORA_FAIXA'::"EnvironmentStatus"
      END,
      "updatedAt" = NOW()
      FROM environment_statuses AS statuses
      WHERE environment."id" = statuses."id"
    `);
  }, { maxWait: 10_000, timeout: 60_000 });
}

ingest()
  .catch((error: unknown) => {
    console.error("Telemetry ingestion failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
