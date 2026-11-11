import { Logger, UnauthorizedException } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Namespace, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";
import { AuthUser } from "../auth/auth.types";

type RealtimeSocketData = {
  authUser?: AuthUser;
  authExpiresAt?: number;
  authExpirationTimer?: NodeJS.Timeout;
};

type RealtimeSocket = Socket & { data: RealtimeSocketData };
type SubscriptionResult = { ok: boolean; message?: string };

@WebSocketGateway({
  namespace: "/realtime",
  cors: {
    origin: process.env.WS_CORS_ORIGIN ?? "http://localhost:5173",
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Namespace;

  constructor(private readonly authService: AuthService) {}

  /**
   * Namespace middleware runs before Socket.IO completes the handshake, so
   * unauthenticated clients cannot connect and emit events.
   */
  afterInit(server: Namespace) {
    server.use((client, next) => {
      void this.authenticateSocket(client as RealtimeSocket)
        .then((session) => {
          const socket = client as RealtimeSocket;
          socket.data.authUser = session.user;
          socket.data.authExpiresAt = session.expiresAt;
          next();
        })
        .catch((error: unknown) => {
          this.logger.warn(`WebSocket authentication rejected: ${this.getErrorMessage(error)}`);
          next(new Error("Unauthorized"));
        });
    });
  }

  handleConnection(client: RealtimeSocket) {
    const expiresAt = client.data.authExpiresAt;
    if (expiresAt) {
      const delay = Math.max(0, expiresAt * 1000 - Date.now());
      client.data.authExpirationTimer = setTimeout(() => {
        client.disconnect(true);
      }, delay);
    }

    client.emit("connected", { at: new Date().toISOString() });
  }

  handleDisconnect(client: RealtimeSocket) {
    if (client.data.authExpirationTimer) {
      clearTimeout(client.data.authExpirationTimer);
      client.data.authExpirationTimer = undefined;
    }
  }

  // Returning a value lets Nest's Socket.IO adapter answer the client's
  // acknowledgement callback without relying on the @Ack decorator.
  @SubscribeMessage("subscribe:store")
  async subscribeStore(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() payload: { storeId: string },
  ): Promise<SubscriptionResult> {
    const storeId = typeof payload?.storeId === "string" ? payload.storeId.trim() : "";
    const authenticatedUser = client.data.authUser;

    if (!storeId) {
      return { ok: false, message: "storeId is required" };
    }

    if (!authenticatedUser) {
      client.disconnect(true);
      return { ok: false, message: "Unauthorized" };
    }

    try {
      // Refresh authorization data at subscription time. Do not trust the
      // permissions cached at the original handshake.
      const currentUser = await this.authService.getAuthenticatedUserById(authenticatedUser.userId);
      const canAccess = await this.authService.canAccessStore(currentUser, storeId);

      if (!canAccess) {
        await client.leave(`store:${storeId}`);
        return { ok: false, message: "Acesso negado" };
      }

      client.data.authUser = currentUser;
      await client.join(`store:${storeId}`);
      return { ok: true };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        client.disconnect(true);
        return { ok: false, message: "Unauthorized" };
      }

      this.logger.error("Unable to authorize store subscription", this.getErrorMessage(error));
      return { ok: false, message: "Unable to authorize store subscription" };
    }
  }

  @SubscribeMessage("unsubscribe:store")
  async unsubscribeStore(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() payload: { storeId: string },
  ): Promise<SubscriptionResult> {
    const storeId = typeof payload?.storeId === "string" ? payload.storeId.trim() : "";
    if (!storeId) {
      return { ok: false, message: "storeId is required" };
    }

    await client.leave(`store:${storeId}`);
    return { ok: true };
  }

  /**
   * Re-checks active room members against PostgreSQL before sending data.
   * A permission revoked after connection is therefore removed before the
   * next store snapshot is delivered.
   */
  async broadcastStoreSnapshot(storeId: string, data: unknown): Promise<boolean> {
    if (!this.server) {
      return false;
    }

    const room = `store:${storeId}`;
    const sockets = await this.server.in(room).fetchSockets();
    if (!sockets.length) {
      return true;
    }

    const userIds = sockets
      .map((socket) => (socket.data as RealtimeSocketData).authUser?.userId)
      .filter((userId): userId is string => Boolean(userId));

    const authorizedUserIds = await this.authService.getAuthorizedUserIdsForStore(storeId, userIds);

    const nowInSeconds = Math.floor(Date.now() / 1000);

    await Promise.all(
      sockets.map(async (socket) => {
        const socketData = socket.data as RealtimeSocketData;
        const userId = socketData.authUser?.userId;
        const tokenExpired = !socketData.authExpiresAt || socketData.authExpiresAt <= nowInSeconds;

        if (!userId || tokenExpired || !authorizedUserIds.has(userId)) {
          await socket.leave(room);
          socket.emit("authorization:revoked", { storeId });

          if (tokenExpired) {
            socket.disconnect(true);
          }

          return;
        }

        socket.emit("snapshot:update", data);
      }),
    );
    return true;
  }

  broadcastPlatformUpdate(data: unknown): boolean {
    if (!this.server) return false;
    this.server.emit("platform:update", data);
    return true;
  }

  private async authenticateSocket(client: RealtimeSocket) {
    const authToken = client.handshake.auth?.token;
    const authorizationHeader = client.handshake.headers.authorization;
    const headerValue = Array.isArray(authorizationHeader)
      ? authorizationHeader[0]
      : authorizationHeader;

    const rawToken = typeof authToken === "string" ? authToken : headerValue;
    const token = rawToken?.startsWith("Bearer ") ? rawToken.slice("Bearer ".length).trim() : rawToken?.trim();

    if (!token) {
      throw new Error("Missing access token");
    }

    return this.authService.authenticate(token);
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Unknown error";
  }
}
