import { Namespace, Socket } from "socket.io";
import { UserRole } from "@prisma/client";
import { AuthService } from "../auth/auth.service";
import { AuthUser } from "../auth/auth.types";
import { RealtimeGateway } from "./realtime.gateway";

describe("RealtimeGateway", () => {
  const currentUser: AuthUser = {
    userId: "user-1",
    role: UserRole.GERENTE_LOJA,
    clientId: null,
    storeIds: ["store-1"],
  };

  it("authenticates the Socket.IO handshake before accepting the connection", async () => {
    const authService = {
      authenticate: jest.fn().mockResolvedValue({
        user: currentUser,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }),
    } as unknown as AuthService;
    const gateway = new RealtimeGateway(authService);
    let middleware: ((socket: Socket, next: (error?: Error) => void) => void) | undefined;
    const namespace = {
      use: jest.fn((handler: (socket: Socket, next: (error?: Error) => void) => void) => {
        middleware = handler;
      }),
    } as unknown as Namespace;

    gateway.afterInit(namespace);

    const client = {
      handshake: { auth: { token: "valid-token" }, headers: {} },
      data: {},
    };
    const nextResult = new Promise<Error | undefined>((resolve) => {
      middleware?.(client as unknown as Socket, (error) => resolve(error));
    });

    const error = await nextResult;

    expect(error).toBeUndefined();
    expect(authService.authenticate).toHaveBeenCalledWith("valid-token");
    expect(client.data).toEqual({
      authUser: currentUser,
      authExpiresAt: expect.any(Number),
    });
  });

  it("rejects a handshake without a token", async () => {
    const authService = {
      authenticate: jest.fn(),
    } as unknown as AuthService;
    const gateway = new RealtimeGateway(authService);
    let middleware: ((socket: Socket, next: (error?: Error) => void) => void) | undefined;
    const namespace = {
      use: jest.fn((handler: (socket: Socket, next: (error?: Error) => void) => void) => {
        middleware = handler;
      }),
    } as unknown as Namespace;

    gateway.afterInit(namespace);

    const client = { handshake: { auth: {}, headers: {} }, data: {} };
    const nextResult = new Promise<Error | undefined>((resolve) => {
      middleware?.(client as unknown as Socket, (error) => resolve(error));
    });

    const error = await nextResult;

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe("Unauthorized");
    expect(authService.authenticate).not.toHaveBeenCalled();
  });

  it("allows a store subscription only after checking current database permissions", async () => {
    const authService = {
      getAuthenticatedUserById: jest.fn().mockResolvedValue(currentUser),
      canAccessStore: jest.fn().mockResolvedValue(true),
    } as unknown as AuthService;
    const gateway = new RealtimeGateway(authService);
    const client = {
      data: { authUser: currentUser },
      join: jest.fn().mockResolvedValue(undefined),
    };

    const result = await gateway.subscribeStore(client as never, { storeId: "store-1" });
    expect(authService.getAuthenticatedUserById).toHaveBeenCalledWith("user-1");
    expect(authService.canAccessStore).toHaveBeenCalledWith(currentUser, "store-1");
    expect(client.join).toHaveBeenCalledWith("store:store-1");
    expect(result).toEqual({ ok: true });
  });



  it("returns a negative acknowledgement when the store id is missing", async () => {
    const authService = {
      getAuthenticatedUserById: jest.fn(),
      canAccessStore: jest.fn(),
    } as unknown as AuthService;
    const gateway = new RealtimeGateway(authService);
    const client = {
      data: { authUser: currentUser },
      join: jest.fn(),
    };

    const result = await gateway.subscribeStore(client as never, { storeId: " " });

    expect(result).toEqual({ ok: false, message: "storeId is required" });
    expect(authService.getAuthenticatedUserById).not.toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it("returns a positive acknowledgement after leaving a store room", async () => {
    const authService = {} as AuthService;
    const gateway = new RealtimeGateway(authService);
    const client = {
      leave: jest.fn().mockResolvedValue(undefined),
    };

    const result = await gateway.unsubscribeStore(client as never, { storeId: "store-1" });

    expect(client.leave).toHaveBeenCalledWith("store:store-1");
    expect(result).toEqual({ ok: true });
  });

  it("revalidates room membership before sending a store snapshot", async () => {
    const authorizedSocket = {
      data: {
        authUser: { ...currentUser, userId: "authorized-user" },
        authExpiresAt: Math.floor(Date.now() / 1000) + 3600,
      },
      leave: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
    const revokedSocket = {
      data: {
        authUser: { ...currentUser, userId: "revoked-user" },
        authExpiresAt: Math.floor(Date.now() / 1000) + 3600,
      },
      leave: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
    const authService = {
      getAuthorizedUserIdsForStore: jest.fn().mockResolvedValue(new Set(["authorized-user"])),
    } as unknown as AuthService;
    const gateway = new RealtimeGateway(authService);
    gateway.server = {
      in: jest.fn().mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([authorizedSocket, revokedSocket]),
      }),
    } as unknown as Namespace;

    await gateway.broadcastStoreSnapshot("store-1", { storeId: "store-1" });

    expect(authorizedSocket.emit).toHaveBeenCalledWith("snapshot:update", { storeId: "store-1" });
    expect(authorizedSocket.leave).not.toHaveBeenCalled();
    expect(revokedSocket.leave).toHaveBeenCalledWith("store:store-1");
    expect(revokedSocket.emit).toHaveBeenCalledWith("authorization:revoked", { storeId: "store-1" });
  });

  it("rejects a store subscription when access has been revoked", async () => {
    const authService = {
      getAuthenticatedUserById: jest.fn().mockResolvedValue(currentUser),
      canAccessStore: jest.fn().mockResolvedValue(false),
    } as unknown as AuthService;
    const gateway = new RealtimeGateway(authService);
    const client = {
      data: { authUser: currentUser },
      join: jest.fn(),
    };

    const result = await gateway.subscribeStore(client as never, { storeId: "store-2" });
    expect(client.join).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, message: "Acesso negado" });
  });
});
