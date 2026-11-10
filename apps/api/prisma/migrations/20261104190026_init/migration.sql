-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN_DIEL', 'GESTOR_CLIENTE', 'GERENTE_LOJA');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'SEM_DADOS');

-- CreateEnum
CREATE TYPE "EnvironmentStatus" AS ENUM ('CONFORTAVEL', 'FORA_FAIXA', 'SEM_DADOS');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "segmento" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "fusoHorario" TEXT NOT NULL,
    "horarioFuncionamento" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "faixaConfortoMin" DOUBLE PRECISION NOT NULL,
    "faixaConfortoMax" DOUBLE PRECISION NOT NULL,
    "horarioFuncionamento" JSONB NOT NULL,
    "devId" TEXT NOT NULL,
    "status" "EnvironmentStatus" NOT NULL DEFAULT 'SEM_DADOS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "lastPacketAt" TIMESTAMP(3),
    "status" "DeviceStatus" NOT NULL DEFAULT 'SEM_DADOS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStoreAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,

    CONSTRAINT "UserStoreAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawTelemetryPacket" (
    "id" TEXT NOT NULL,
    "devId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "gmt" INTEGER NOT NULL,
    "samplingTime" INTEGER NOT NULL,
    "temperatures" JSONB NOT NULL,
    "savedData" BOOLEAN NOT NULL DEFAULT false,
    "sourceLine" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawTelemetryPacket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetryReading" (
    "id" TEXT NOT NULL,
    "devId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "packetTimestamp" TIMESTAMP(3) NOT NULL,
    "packetGmt" INTEGER NOT NULL,
    "samplingTime" INTEGER NOT NULL,
    "timestampUtc" TIMESTAMP(3) NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "inComfort" BOOLEAN NOT NULL,
    "inWorkingHours" BOOLEAN NOT NULL,
    "isLatePacket" BOOLEAN NOT NULL DEFAULT false,
    "isSpurious" BOOLEAN NOT NULL DEFAULT false,
    "sourcePacketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemetryReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComfortMetric" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "comfortPercent" DOUBLE PRECISION NOT NULL,
    "monitoredSeconds" INTEGER NOT NULL,
    "comfortSeconds" INTEGER NOT NULL,
    "outOfRangeSeconds" INTEGER NOT NULL,
    "missingSeconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComfortMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionState" (
    "id" TEXT NOT NULL,
    "referenceTimeUtc" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Store_clientId_idx" ON "Store"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Environment_devId_key" ON "Environment"("devId");

-- CreateIndex
CREATE INDEX "Environment_storeId_idx" ON "Environment"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_environmentId_key" ON "Device"("environmentId");

-- CreateIndex
CREATE INDEX "Device_status_idx" ON "Device"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_clientId_idx" ON "User"("clientId");

-- CreateIndex
CREATE INDEX "UserStoreAccess_userId_idx" ON "UserStoreAccess"("userId");

-- CreateIndex
CREATE INDEX "UserStoreAccess_storeId_idx" ON "UserStoreAccess"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStoreAccess_userId_storeId_key" ON "UserStoreAccess"("userId", "storeId");

-- CreateIndex
CREATE INDEX "RawTelemetryPacket_devId_timestamp_idx" ON "RawTelemetryPacket"("devId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "TelemetryReading_environmentId_timestampUtc_idx" ON "TelemetryReading"("environmentId", "timestampUtc" DESC);

-- CreateIndex
CREATE INDEX "TelemetryReading_devId_timestampUtc_idx" ON "TelemetryReading"("devId", "timestampUtc" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TelemetryReading_devId_timestampUtc_key" ON "TelemetryReading"("devId", "timestampUtc");

-- CreateIndex
CREATE INDEX "ComfortMetric_environmentId_periodStart_periodEnd_idx" ON "ComfortMetric"("environmentId", "periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStoreAccess" ADD CONSTRAINT "UserStoreAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStoreAccess" ADD CONSTRAINT "UserStoreAccess_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetryReading" ADD CONSTRAINT "TelemetryReading_devId_fkey" FOREIGN KEY ("devId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetryReading" ADD CONSTRAINT "TelemetryReading_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComfortMetric" ADD CONSTRAINT "ComfortMetric_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
