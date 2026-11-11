import * as fs from "node:fs";
import * as path from "node:path";
import { Prisma, PrismaClient, UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";
import { parseCadastro, type Cadastro } from "./seed-validation";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run the Prisma seed");
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

function parseScaleArg(): number {
  const cliArg = process.argv.find((arg) => arg.startsWith("--scale="));
  const cliValue = cliArg ? Number(cliArg.split("=")[1]) : undefined;
  const envValue = process.env.STORE_MULTIPLIER ? Number(process.env.STORE_MULTIPLIER) : undefined;
  const raw = cliValue ?? envValue ?? 1;
  if (!Number.isFinite(raw) || raw < 1 || !Number.isInteger(raw)) {
    throw new Error("STORE_MULTIPLIER/--scale must be a positive integer");
  }
  if (raw > 500) {
    throw new Error("STORE_MULTIPLIER/--scale cannot exceed 500");
  }
  return raw;
}

function mapRole(perfil: Cadastro["usuarios"][number]["perfil"]): UserRole {
  if (perfil === "admin_diel") return UserRole.ADMIN_DIEL;
  if (perfil === "gestor_cliente") return UserRole.GESTOR_CLIENTE;
  return UserRole.GERENTE_LOJA;
}

function expandId(id: string, index: number) {
  return index === 0 ? id : `${id}-X${index + 1}`;
}

async function pruneScaledRecords(cadastro: Cadastro, scale: number) {
  const expectedStoreIds = new Set(cadastro.lojas.flatMap((store) =>
    Array.from({ length: scale }, (_, index) => expandId(store.id, index)),
  ));
  const expectedEnvironmentIds = new Set(cadastro.ambientes.flatMap((environment) =>
    Array.from({ length: scale }, (_, index) => expandId(environment.id, index)),
  ));

  const [stores, environments] = await Promise.all([
    cadastro.lojas.length
      ? prisma.store.findMany({
          where: { OR: cadastro.lojas.map((store) => ({ id: { startsWith: `${store.id}-X` } })) },
          select: { id: true },
        })
      : Promise.resolve([]),
    cadastro.ambientes.length
      ? prisma.environment.findMany({
          where: { OR: cadastro.ambientes.map((environment) => ({ id: { startsWith: `${environment.id}-X` } })) },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const staleEnvironmentIds = environments
    .map((item) => item.id)
    .filter((id) => !expectedEnvironmentIds.has(id) && /-X\d+$/.test(id));
  const staleStoreIds = stores
    .map((item) => item.id)
    .filter((id) => !expectedStoreIds.has(id) && /-X\d+$/.test(id));

  if (staleEnvironmentIds.length) {
    await prisma.environment.deleteMany({ where: { id: { in: staleEnvironmentIds } } });
  }
  if (staleStoreIds.length) {
    await prisma.store.deleteMany({ where: { id: { in: staleStoreIds } } });
  }
}

async function main() {
  const root = path.resolve(__dirname, "../../../");
  const cadastroPath = path.join(root, "dados", "cadastro.json");
  const cadastro = parseCadastro(JSON.parse(fs.readFileSync(cadastroPath, "utf-8")) as unknown);
  const scale = parseScaleArg();
  const seededPasswordHash = await hash("dev-only-change-me", 12);

  const expandedStores = cadastro.lojas.flatMap((store) => Array.from({ length: scale }, (_, index) => ({
    ...store,
    id: expandId(store.id, index),
    nome: index === 0 ? store.nome : `${store.nome} ${index + 1}`,
    latitude: Number((store.latitude + index * 0.0003).toFixed(6)),
    longitude: Number((store.longitude + index * 0.0003).toFixed(6)),
  })));

  const expandedEnvironments = cadastro.ambientes.flatMap((environment) => Array.from({ length: scale }, (_, index) => ({
    ...environment,
    id: expandId(environment.id, index),
    loja_id: expandId(environment.loja_id, index),
    dev_id: expandId(environment.dev_id, index),
    nome: index === 0 ? environment.nome : `${environment.nome} ${index + 1}`,
  })));

  for (const client of cadastro.clientes) {
    await prisma.client.upsert({
      where: { id: client.id },
      update: { nome: client.nome, segmento: client.segmento },
      create: { id: client.id, nome: client.nome, segmento: client.segmento },
    });
  }

  for (const store of expandedStores) {
    await prisma.store.upsert({
      where: { id: store.id },
      update: {
        clientId: store.cliente_id,
        nome: store.nome,
        tipo: store.tipo,
        cidade: store.cidade,
        uf: store.uf,
        latitude: store.latitude,
        longitude: store.longitude,
        fusoHorario: store.fuso_horario,
        horarioFuncionamento: store.horario_funcionamento as Prisma.InputJsonValue,
      },
      create: {
        id: store.id,
        clientId: store.cliente_id,
        nome: store.nome,
        tipo: store.tipo,
        cidade: store.cidade,
        uf: store.uf,
        latitude: store.latitude,
        longitude: store.longitude,
        fusoHorario: store.fuso_horario,
        horarioFuncionamento: store.horario_funcionamento as Prisma.InputJsonValue,
      },
    });
  }

  for (const env of expandedEnvironments) {
    await prisma.environment.upsert({
      where: { id: env.id },
      update: {
        nome: env.nome,
        faixaConfortoMin: env.faixa_conforto_c.min,
        faixaConfortoMax: env.faixa_conforto_c.max,
        horarioFuncionamento: env.horario_funcionamento as Prisma.InputJsonValue,
        storeId: env.loja_id,
        devId: env.dev_id,
      },
      create: {
        id: env.id,
        nome: env.nome,
        faixaConfortoMin: env.faixa_conforto_c.min,
        faixaConfortoMax: env.faixa_conforto_c.max,
        horarioFuncionamento: env.horario_funcionamento as Prisma.InputJsonValue,
        storeId: env.loja_id,
        devId: env.dev_id,
      },
    });

    await prisma.device.upsert({
      where: { id: env.dev_id },
      update: { environmentId: env.id },
      create: { id: env.dev_id, environmentId: env.id },
    });
  }

  for (const user of cadastro.usuarios) {
    const persistedUser = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        nome: user.nome,
        role: mapRole(user.perfil),
        clientId: user.cliente_id ?? null,
        senha: seededPasswordHash,
      },
      create: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        senha: seededPasswordHash,
        role: mapRole(user.perfil),
        clientId: user.cliente_id ?? null,
      },
      select: { id: true },
    });

    const desiredStoreIds = user.lojas?.flatMap((storeId) =>
      Array.from({ length: scale }, (_, index) => expandId(storeId, index)),
    ) ?? [];

    // Reconcile access instead of only adding rows: removed permissions are revoked.
    await prisma.$transaction(async (tx) => {
      await tx.userStoreAccess.deleteMany({
        where: desiredStoreIds.length
          ? { userId: persistedUser.id, storeId: { notIn: desiredStoreIds } }
          : { userId: persistedUser.id },
      });

      if (desiredStoreIds.length) {
        await tx.userStoreAccess.createMany({
          data: desiredStoreIds.map((storeId) => ({ userId: persistedUser.id, storeId })),
          skipDuplicates: true,
        });
      }
    });
  }

  if (process.env.SEED_PRUNE_SCALED_DATA === "true") {
    await pruneScaledRecords(cadastro, scale);
  }

  const storesCount = await prisma.store.count();
  console.log(`seed completed with ${storesCount} stores (scale=${scale})`);
  if (process.env.SEED_PRUNE_SCALED_DATA !== "true") {
    console.log("Scaled records were not pruned. Set SEED_PRUNE_SCALED_DATA=true to remove generated -Xn records.");
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
