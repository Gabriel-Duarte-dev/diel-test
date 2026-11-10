import { Injectable, UnauthorizedException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { compare } from "bcryptjs";
import { sign, verify } from "jsonwebtoken";
import { PrismaService } from "../services/prisma.service";
import { AuthUser } from "./auth.types";

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, senha: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { stores: true },
    });

    const isValidPassword = user ? await this.verifyPassword(senha, user.senha) : false;

    if (!user || !isValidPassword) {
      throw new UnauthorizedException("Credenciais invalidas");
    }

    const payload = {
      userId: user.id,
      role: user.role,
      clientId: user.clientId,
      storeIds: user.stores.map((item) => item.storeId),
    };

    const [activeSecret] = this.getJwtSecrets();
    const accessToken = sign(payload, activeSecret, { expiresIn: "12h" });

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

  parseToken(token: string): AuthUser {
    for (const secret of this.getJwtSecrets()) {
      try {
        const decoded = verify(token, secret) as {
          userId: string;
          role: UserRole;
          clientId: string | null;
          storeIds: string[];
        };

        return {
          userId: decoded.userId,
          role: decoded.role,
          clientId: decoded.clientId,
          storeIds: decoded.storeIds ?? [],
        };
      } catch {
        continue;
      }
    }

    throw new UnauthorizedException("Token invalido");
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
    const secrets = (process.env.JWT_SECRETS ?? process.env.JWT_SECRET ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (!secrets.length) {
      throw new UnauthorizedException("Configuracao JWT ausente");
    }

    return secrets;
  }
}
