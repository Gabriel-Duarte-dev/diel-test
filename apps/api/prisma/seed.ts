import * as fs from "node:fs";
import * as path from "node:path";
import { Prisma, PrismaClient, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

type Cadastro = {
  clientes: Array<{ id: string; nome: string; segmento: string }>;
  lojas: Array<{
    id: string;
    cliente_id: string;
    nome: string;
    tipo: string;
    cidade: string;
    uf: string;
    latitude: number;
    longitude: number;
    fuso_horario: string;
    horario_funcionamento: unknown;
  }>;
  ambientes: Array<{
    id: string;
    loja_id: string;
    nome: string;
    faixa_conforto_c: { min: number; max: number };
    horario_funcionamento: unknown;
    dev_id: string;
  }>;
  usuarios: Array<{
    id: string;
    nome: string;
    email: string;
    perfil: "admin_diel" | "gestor_cliente" | "gerente_loja";
    cliente_id?: string;
    lojas?: string[];
  }>;
};

function parseScaleArg() {
  const cliArg = process.argv.find((arg) => arg.startsWith("--scale="));
  const cliValue = cliArg ? Number(cliArg.split("=")[1]) : undefined;
  const envValue = process.env.STORE_MULTIPLIER ? Number(process.env.STORE_MULTIPLIER) : undefined;
  const raw = cliValue ?? envValue ?? 1;

  if (!Number.isFinite(raw) || raw < 1) {
    return 1;
  }

  return Math.floor(raw);
}

function mapRole(perfil: Cadastro["usuarios"][number]["perfil"]): UserRole {
  if (perfil === "admin_diel") return UserRole.ADMIN_DIEL;
  if (perfil === "gestor_cliente") return UserRole.GESTOR_CLIENTE;
  return UserRole.GERENTE_LOJA;
}

async function main() {
  const root = path.resolve(__dirname, "../../../");
  const cadastroPath = path.join(root, "dados", "cadastro.json");
  const cadastro = JSON.parse(fs.readFileSync(cadastroPath, "utf-8")) as Cadastro;
  const scale = parseScaleArg();
  const seededPasswordHash = await hash("dev-only-change-me", 12);

  const expandedStores = cadastro.lojas.flatMap((store) => {
    return Array.from({ length: scale }, (_, index) => {
      const suffix = index === 0 ? "" : `-X${index + 1}`;
      const labelSuffix = index === 0 ? "" : ` ${index + 1}`;

      return {
        ...store,
        id: `${store.id}${suffix}`,
        nome: `${store.nome}${labelSuffix}`,
        latitude: Number((store.latitude + index * 0.0003).toFixed(6)),
        longitude: Number((store.longitude + index * 0.0003).toFixed(6)),
        sourceStoreId: store.id,
        scaleIndex: index,
      };
    });
  });

  const expandedEnvironments = cadastro.ambientes.flatMap((environment) => {
    return Array.from({ length: scale }, (_, index) => {
      const suffix = index === 0 ? "" : `-X${index + 1}`;
      const labelSuffix = index === 0 ? "" : ` ${index + 1}`;

      return {
        ...environment,
        id: `${environment.id}${suffix}`,
        loja_id: `${environment.loja_id}${suffix}`,
        dev_id: `${environment.dev_id}${suffix}`,
        nome: `${environment.nome}${labelSuffix}`,
      };
    });
  });

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
      create: {
        id: env.dev_id,
        environmentId: env.id,
      },
    });
  }

  for (const user of cadastro.usuarios) {
    await prisma.user.upsert({
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
    });

    if (user.lojas?.length) {
      const scaledStores = user.lojas.flatMap((storeId) =>
        Array.from({ length: scale }, (_, index) => {
          const suffix = index === 0 ? "" : `-X${index + 1}`;
          return `${storeId}${suffix}`;
        }),
      );

      for (const storeId of scaledStores) {
        await prisma.userStoreAccess.upsert({
          where: { userId_storeId: { userId: user.id, storeId } },
          update: {},
          create: { userId: user.id, storeId },
        });
      }
    }
  }

  const storesCount = await prisma.store.count();
  console.log(`seed completed with ${storesCount} stores (scale=${scale})`);
}

main()
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
