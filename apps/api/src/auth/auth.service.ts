import { Injectable, UnauthorizedException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { compare } from "bcryptjs";
import { sign, verify, type JwtPayload } from "jsonwebtoken";
import { PrismaService } from "../services/prisma.service";
import { AuthenticatedSession, AuthUser } from "./auth.types";

type AuthUserRecord = {
  id: string;
  role: UserRole;
  clientId: string | null;
  stores: Array<{ storeId: string }>;
};

type VerifiedToken = {
  userId: string;
  expiresAt: number;
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, senha: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        nome: true,
        senha: true,
        role: true,
      },
    });

    const isValidPassword = user ? await this.verifyPassword(senha, user.senha) : false;

    if (!user || !isValidPassword) {
      throw new UnauthorizedException("Credenciais invalidas");
    }

    // The JWT identifies the user only. Roles and store permissions are
    // loaded from PostgreSQL on every authenticated HTTP/WS operation.
    const [activeSecret] = this.getJwtSecrets();
    const accessToken = sign({ sub: user.id }, activeSecret, { expiresIn: "12h" });

    return {
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          nome: user.nome,
          role: user.role,
        },
      },
    };
  }

  /**
   * Verifies the JWT and resolves the user's current permissions from the DB.
   * Legacy tokens containing userId are accepted during rollout, but all other
   * legacy claims (role/clientId/storeIds) are intentionally ignored.
   */
  async authenticate(token: string): Promise<AuthenticatedSession> {
    const verified = this.verifyAccessToken(token);
    const user = await this.getAuthenticatedUserById(verified.userId);

    return {
      user,
      expiresAt: verified.expiresAt,
    };
  }

  /** Loads a fresh authorization context. Use this instead of cached JWT claims. */
  async getAuthenticatedUserById(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        clientId: true,
        stores: {
          select: { storeId: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException("Usuario nao encontrado");
    }

    return this.toAuthUser(user);
  }

  /**
   * Checks store access against current database records. This is used both
   * when a socket joins a room and when room updates are delivered.
   */
  async canAccessStore(user: AuthUser, storeId: string): Promise<boolean> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { clientId: true },
    });

    if (!store) {
      return false;
    }

    if (user.role === UserRole.ADMIN_DIEL) {
      return true;
    }

    if (user.role === UserRole.GESTOR_CLIENTE) {
      return Boolean(user.clientId && user.clientId === store.clientId);
    }

    if (user.role === UserRole.GERENTE_LOJA) {
      return user.storeIds.includes(storeId);
    }

    return false;
  }

  /**
   * Batch authorization for sockets currently subscribed to a store room.
   * This makes permission revocation effective on the next room broadcast,
   * without trusting the permissions captured at the original handshake.
   */
  async getAuthorizedUserIdsForStore(storeId: string, userIds: string[]): Promise<Set<string>> {
    const uniqueUserIds = [...new Set(userIds)];
    if (!uniqueUserIds.length) {
      return new Set();
    }

    const [store, users] = await Promise.all([
      this.prisma.store.findUnique({
        where: { id: storeId },
        select: { clientId: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: uniqueUserIds } },
        select: {
          id: true,
          role: true,
          clientId: true,
          stores: {
            select: { storeId: true },
          },
        },
      }),
    ]);

    if (!store) {
      return new Set();
    }

    const authorizedIds = users
      .filter((user) => {
        if (user.role === UserRole.ADMIN_DIEL) {
          return true;
        }

        if (user.role === UserRole.GESTOR_CLIENTE) {
          return Boolean(user.clientId && user.clientId === store.clientId);
        }

        if (user.role === UserRole.GERENTE_LOJA) {
          return user.stores.some((access) => access.storeId === storeId);
        }

        return false;
      })
      .map((user) => user.id);

    return new Set(authorizedIds);
  }

  private verifyAccessToken(token: string): VerifiedToken {
    for (const secret of this.getJwtSecrets()) {
      try {
        const decoded = verify(token, secret);
        if (!decoded || typeof decoded !== "object") {
          continue;
        }

        const payload = decoded as JwtPayload & { userId?: unknown };
        // `userId` supports tokens issued by the previous implementation.
        // Authorization claims from those tokens are deliberately ignored.
        const userId =
          typeof payload.sub === "string"
            ? payload.sub
            : typeof payload.userId === "string"
              ? payload.userId
              : null;

        if (!userId || typeof payload.exp !== "number") {
          continue;
        }

        return { userId, expiresAt: payload.exp };
      } catch {
        // Try the next configured secret to support secret rotation.
        continue;
      }
    }

    throw new UnauthorizedException("Token invalido");
  }

  private toAuthUser(user: AuthUserRecord): AuthUser {
    return {
      userId: user.id,
      role: user.role,
      clientId: user.clientId,
      storeIds: user.stores.map((item) => item.storeId),
    };
  }

  private async verifyPassword(plainPassword: string, storedPassword: string) {
    if (this.isBcryptHash(storedPassword)) {
      return compare(plainPassword, storedPassword);
    }

    return false;
  }

  private isBcryptHash(value: string) {
    return value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$");
  }

  private getJwtSecrets() {
    const secrets = (process.env.JWT_SECRETS || process.env.JWT_SECRET || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (!secrets.length) {
      throw new UnauthorizedException("Configuracao JWT ausente");
    }

    return secrets;
  }
}
