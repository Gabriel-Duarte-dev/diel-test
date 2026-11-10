import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@WebSocketGateway({
  namespace: "/realtime",
  cors: {
    origin: process.env.WS_CORS_ORIGIN ?? "http://localhost:5173",
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    client.emit("connected", { at: new Date().toISOString() });
  }

  handleDisconnect(client: Socket) {
    client.disconnect();
  }

  @SubscribeMessage("subscribe:store")
  async subscribeStore(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { storeId: string },
  ) {
    if (!payload?.storeId) {
      throw new WsException("storeId is required");
    }

    await client.join(`store:${payload.storeId}`);

    return { ok: true };
  }

  broadcastStoreSnapshot(storeId: string, data: unknown) {
    this.server.to(`store:${storeId}`).emit("snapshot:update", data);
  }

  broadcastPlatformUpdate(data: unknown) {
    this.server.emit("platform:update", data);
  }
}
