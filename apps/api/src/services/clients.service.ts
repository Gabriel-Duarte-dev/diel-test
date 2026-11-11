import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { AuthUser } from "../auth/auth.types";

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser) {
    if (user.role === "ADMIN_DIEL") {
      const clients = await this.prisma.client.findMany({
        orderBy: { nome: "asc" },
        select: { id: true, nome: true },
      });

      return { success: true, data: clients };
    }

    if (user.role === "GESTOR_CLIENTE") {
      if (!user.clientId) return { success: true, data: [] };

      const client = await this.prisma.client.findUnique({
        where: { id: user.clientId },
        select: { id: true, nome: true },
      });

      return { success: true, data: client ? [client] : [] };
    }

    const stores = await this.prisma.store.findMany({
      where: {
        id: {
          in: user.storeIds.length ? user.storeIds : ["__none__"],
        },
      },
      select: {
        client: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
    });

    const byId = new Map<string, { id: string; nome: string }>();
    for (const store of stores) {
      if (store.client) {
        byId.set(store.client.id, { id: store.client.id, nome: store.client.nome });
      }
    }

    return {
      success: true,
      data: Array.from(byId.values()).sort((a, b) => a.nome.localeCompare(b.nome)),
    };
  }
}