import * as fs from "node:fs";
import * as path from "node:path";
import { DeviceStatus, EnvironmentStatus, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

interface TelemetryPacket {
  dev_id: string;
  timestamp: string;
  GMT: number;
  samplingTime: number;
  Temperature: number[];
  saved_data?: boolean;
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

type Schedule = Record<string, [string, string] | null>;

function parseLocalTimestamp(raw: string) {
  const [datePart, timePart] = raw.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = timePart.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

function toUtcPacketTimestamp(raw: string, gmt: number) {
  return new Date(parseLocalTimestamp(raw) - gmt * 60 * 60 * 1000);
}

function hhmmToMinutes(hhmm: string) {
  const [hh, mm] = hhmm.split(":").map(Number);
  return hh * 60 + mm;
}

function getScheduleDayKey(dateUtc: Date, timezone: string) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: timezone,
  }).format(dateUtc);
  const map: Record<string, keyof Schedule> = {
    Mon: "seg",
    Tue: "ter",
    Wed: "qua",
    Thu: "qui",
    Fri: "sex",
    Sat: "sab",
    Sun: "dom",
  };

  return map[weekday] ?? "seg";
}

function isWithinWorkingHours(
  dateUtc: Date,
  timezone: string,
  scheduleRaw: unknown,
) {
  const schedule = (scheduleRaw ?? {}) as Schedule;
  const dayKey = getScheduleDayKey(dateUtc, timezone);
  const window = schedule[dayKey];

  if (!window) {
    return false;
  }

  const current = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(dateUtc);

  const currentMinutes = hhmmToMinutes(current);
  const startMinutes = hhmmToMinutes(window[0]);
  const endMinutes = hhmmToMinutes(window[1]);
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

function toUtcSamples(packet: TelemetryPacket) {
  const packetUtc = toUtcPacketTimestamp(packet.timestamp, packet.GMT);

  return packet.Temperature.map((temperature, index) => {
    const offsetSeconds =
      (packet.Temperature.length - 1 - index) * packet.samplingTime;
    return {
      timestampUtc: new Date(packetUtc.getTime() - offsetSeconds * 1000),
      temperature,
      isLatePacket: Boolean(packet.saved_data),
    };
  });
}

function isSpurious(value: number) {
  return value < -20 || value > 70;
}

async function ingest() {
  const inputPath = path.resolve(__dirname, "../../../dados/telemetrias.jsonl");
  const lines = fs.readFileSync(inputPath, "utf-8").trim().split("\n");

  let sourceLine = 0;
  let referenceTimeUtc: Date | null = null;

  for (const line of lines) {
    sourceLine += 1;
    const packet = JSON.parse(line) as TelemetryPacket;

    const packetUtc = toUtcPacketTimestamp(packet.timestamp, packet.GMT);
    const raw = await prisma.rawTelemetryPacket.create({
      data: {
        devId: packet.dev_id,
        timestamp: packetUtc,
        gmt: packet.GMT,
        samplingTime: packet.samplingTime,
        temperatures: packet.Temperature,
        sourceLine,
        savedData: Boolean(packet.saved_data),
      },
    });

    const environment = await prisma.environment.findUnique({
      where: { devId: packet.dev_id },
    });
    if (!environment) {
      continue;
    }

    const store = await prisma.store.findUnique({
      where: { id: environment.storeId },
    });
    if (!store) {
      continue;
    }

    const samples = toUtcSamples(packet);
    for (const sample of samples) {
      const inWorkingHours = isWithinWorkingHours(
        sample.timestampUtc,
        store.fusoHorario,
        environment.horarioFuncionamento,
      );
      const inComfort =
        sample.temperature >= environment.faixaConfortoMin &&
        sample.temperature <= environment.faixaConfortoMax;

      await prisma.telemetryReading.upsert({
        where: {
          devId_timestampUtc: {
            devId: packet.dev_id,
            timestampUtc: sample.timestampUtc,
          },
        },
        update: {
          temperature: sample.temperature,
          isLatePacket: sample.isLatePacket,
          isSpurious: isSpurious(sample.temperature),
          sourcePacketId: raw.id,
        },
        create: {
          devId: packet.dev_id,
          environmentId: environment.id,
          packetTimestamp: packetUtc,
          packetGmt: packet.GMT,
          samplingTime: packet.samplingTime,
          timestampUtc: sample.timestampUtc,
          temperature: sample.temperature,
          inComfort,
          inWorkingHours,
          isLatePacket: sample.isLatePacket,
          isSpurious: isSpurious(sample.temperature),
          sourcePacketId: raw.id,
        },
      });
    }

    await prisma.device.update({
      where: { id: packet.dev_id },
      data: {
        lastPacketAt: packetUtc,
        status: "ONLINE",
      },
    });

    referenceTimeUtc = packetUtc;

    if (sourceLine % 100 === 0) {
      console.log(`processed ${sourceLine} packets`);
    }
  }

  if (referenceTimeUtc) {
    await prisma.ingestionState.upsert({
      where: { id: "default" },
      update: { referenceTimeUtc },
      create: { id: "default", referenceTimeUtc },
    });

    await recalculateStatuses(referenceTimeUtc);
  }

  console.log(`ingestion completed: ${sourceLine} packets`);
}

async function recalculateStatuses(referenceTimeUtc: Date) {
  const onlineThreshold = new Date(referenceTimeUtc.getTime() - 5 * 60 * 1000);
  const semDadosThreshold = new Date(
    referenceTimeUtc.getTime() - 24 * 60 * 60 * 1000,
  );

  await prisma.device.updateMany({
    where: { lastPacketAt: { gte: onlineThreshold } },
    data: { status: DeviceStatus.ONLINE },
  });

  await prisma.device.updateMany({
    where: {
      lastPacketAt: {
        gte: semDadosThreshold,
        lt: onlineThreshold,
      },
    },
    data: { status: DeviceStatus.OFFLINE },
  });

  await prisma.device.updateMany({
    where: {
      OR: [{ lastPacketAt: null }, { lastPacketAt: { lt: semDadosThreshold } }],
    },
    data: { status: DeviceStatus.SEM_DADOS },
  });

  const environments = await prisma.environment.findMany({
    include: {
      device: true,
      readings: { orderBy: { timestampUtc: "desc" }, take: 1 },
    },
  });

  for (const environment of environments) {
    let nextStatus: EnvironmentStatus = EnvironmentStatus.SEM_DADOS;
    const latest = environment.readings[0];

    if (environment.device?.status === DeviceStatus.ONLINE && latest) {
      if (latest.inWorkingHours) {
        nextStatus = latest.inComfort
          ? EnvironmentStatus.CONFORTAVEL
          : EnvironmentStatus.FORA_FAIXA;
      }
    }

    await prisma.environment.update({
      where: { id: environment.id },
      data: { status: nextStatus },
    });
  }
}

ingest()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
