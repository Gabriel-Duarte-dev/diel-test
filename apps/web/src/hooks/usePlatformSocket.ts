import { useEffect } from "react";
import { useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";

export function usePlatformSocket(token: string | null, storeIds: string[]) {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const storeIdsRef = useRef<string[]>(storeIds);

  storeIdsRef.current = storeIds;

  useEffect(() => {
    if (!token) {
      return;
    }

    const socket = io("http://localhost:3000/realtime");
    socketRef.current = socket;

    const subscribeVisibleStores = () => {
      for (const storeId of storeIdsRef.current) {
        socket.emit("subscribe:store", { storeId });
      }
    };

    socket.on("connect", subscribeVisibleStores);

    socket.on("platform:update", () => {
      queryClient.invalidateQueries({ queryKey: ["stores", token] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-snapshot", token] });
      queryClient.invalidateQueries({ queryKey: ["environment-summary"] });
      queryClient.invalidateQueries({ queryKey: ["environment-series"] });
    });

    socket.on("snapshot:update", () => {
      queryClient.invalidateQueries({ queryKey: ["stores", token] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-snapshot", token] });
      queryClient.invalidateQueries({ queryKey: ["environment-summary"] });
      queryClient.invalidateQueries({ queryKey: ["environment-series"] });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [queryClient, token]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      return;
    }

    for (const storeId of storeIds) {
      socket.emit("subscribe:store", { storeId });
    }
  }, [storeIds]);
}
