import { UnauthorizedException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { sign, verify, type JwtPayload } from "jsonwebtoken";
import { PrismaService } from "../services/prisma.service";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  const originalJwtSecrets = process.env.JWT_SECRETS;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
    store: {
      findUnique: jest.Mock;
    };
  };
  let service: AuthService;

  beforeEach(() => {
    process.env.JWT_SECRETS = "test-secret,previous-secret";
    prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      store: {
        findUnique: jest.fn(),
      },
    };
    service = new AuthService(prisma as unknown as PrismaService);
  });

  afterAll(() => {
    if (originalJwtSecrets === undefined) {
      delete process.env.JWT_SECRETS;
    } else {
      process.env.JWT_SECRETS = originalJwtSecrets;
    }
  });

  it("issues an identity-only JWT without authorization claims", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      nome: "Ana Ribeiro",
      senha: await hash("secret123", 4),
      role: UserRole.GESTOR_CLIENTE,
    });

    const result = await service.login("ana@example.com", "secret123");
    const payload = verify(result.data.accessToken, "test-secret") as JwtPayload;

    expect(payload.sub).toBe("user-1");
    expect(payload.exp).toEqual(expect.any(Number));
    expect(payload).not.toHaveProperty("role");
    expect(payload).not.toHaveProperty("clientId");
    expect(payload).not.toHaveProperty("storeIds");
  });

  it("ignores legacy authorization claims and loads current permissions from the database", async () => {
    const legacyToken = sign(
      {
        userId: "user-1",
        role: UserRole.ADMIN_DIEL,
        clientId: "stale-client",
        storeIds: ["stale-store"],
      },
      "previous-secret",
      { expiresIn: "1h" },
    );

    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      role: UserRole.GERENTE_LOJA,
      clientId: null,
      stores: [{ storeId: "current-store" }],
    });

    const session = await service.authenticate(legacyToken);

    expect(session.user).toEqual({
      userId: "user-1",
      role: UserRole.GERENTE_LOJA,
      clientId: null,
      storeIds: ["current-store"],
    });
    expect(session.expiresAt).toEqual(expect.any(Number));
  });

  it("rejects a validly signed token when its user no longer exists", async () => {
    const token = sign({ sub: "deleted-user" }, "test-secret", { expiresIn: "1h" });
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.authenticate(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("checks store room access against current role and relationships", async () => {
    prisma.store.findUnique.mockResolvedValue({ clientId: "client-1" });

    await expect(
      service.canAccessStore(
        {
          userId: "manager-1",
          role: UserRole.GERENTE_LOJA,
          clientId: null,
          storeIds: ["store-1"],
        },
        "store-1",
      ),
    ).resolves.toBe(true);

    await expect(
      service.canAccessStore(
        {
          userId: "manager-2",
          role: UserRole.GERENTE_LOJA,
          clientId: null,
          storeIds: ["another-store"],
        },
        "store-1",
      ),
    ).resolves.toBe(false);
  });

  it("builds a current authorized user set for an outgoing store snapshot", async () => {
    prisma.store.findUnique.mockResolvedValue({ clientId: "client-1" });
    prisma.user.findMany.mockResolvedValue([
      { id: "admin", role: UserRole.ADMIN_DIEL, clientId: null, stores: [] },
      { id: "client-manager", role: UserRole.GESTOR_CLIENTE, clientId: "client-1", stores: [] },
      { id: "other-client-manager", role: UserRole.GESTOR_CLIENTE, clientId: "client-2", stores: [] },
      { id: "store-manager", role: UserRole.GERENTE_LOJA, clientId: null, stores: [{ storeId: "store-1" }] },
      { id: "revoked-manager", role: UserRole.GERENTE_LOJA, clientId: null, stores: [] },
    ]);

    const authorized = await service.getAuthorizedUserIdsForStore("store-1", [
      "admin",
      "client-manager",
      "other-client-manager",
      "store-manager",
      "revoked-manager",
    ]);

    expect([...authorized].sort()).toEqual(["admin", "client-manager", "store-manager"]);
  });
});
