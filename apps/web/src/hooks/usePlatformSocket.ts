import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";

type SubscriptionAck = { ok?: boolean; message?: string };
type ReconcileSubscriptions = () => void;

const WS_URL = import.meta.env.VITE_WS_URL ?? "http://localhost:3000/realtime";

export function usePlatformSocket(token: string | null, storeIds: string[]) {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const desiredStoreIdsRef = useRef<string[]>(storeIds);
  const subscribedStoreIdsRef = useRef<Set<string>>(new Set());
  const pendingSubscribeRef = useRef<Set<string>>(new Set());
  const pendingUnsubscribeRef = useRef<Set<string>>(new Set());
  const reconcileRef = useRef<ReconcileSubscriptions>(() => undefined);

  desiredStoreIdsRef.current = [...new Set(storeIds.filter(Boolean))];

  useEffect(() => {
    if (!token) return;

    const socket = io(WS_URL, {
      auth: { token },
      reconnectionAttempts: 3,
      timeout: 10_000,
    });
    socketRef.current = socket;

    const reconcileSubscriptions = () => {
      if (!socket.connected) return;

      const desired = new Set(desiredStoreIdsRef.current);
      const subscribed = subscribedStoreIdsRef.current;
      const pendingSubscribe = pendingSubscribeRef.current;
      const pendingUnsubscribe = pendingUnsubscribeRef.current;

      for (const storeId of subscribed) {
        if (desired.has(storeId) || pendingUnsubscribe.has(storeId)) continue;

        pendingUnsubscribe.add(storeId);
        socket.timeout(8_000).emit(
          "unsubscribe:store",
          { storeId },
          (error: Error | null, ack?: SubscriptionAck) => {
            pendingUnsubscribe.delete(storeId);
            if (!error && ack?.ok) subscribed.delete(storeId);
            // A store can be selected again while its unsubscribe is in flight.
            if (desiredStoreIdsRef.current.includes(storeId) && socket.connected) {
              reconcileSubscriptions();
            }
          },
        );
      }

      for (const storeId of desired) {
        if (subscribed.has(storeId) || pendingSubscribe.has(storeId) || pendingUnsubscribe.has(storeId)) {
          continue;
        }

        pendingSubscribe.add(storeId);
        socket.timeout(8_000).emit(
          "subscribe:store",
          { storeId },
          (error: Error | null, ack?: SubscriptionAck) => {
            pendingSubscribe.delete(storeId);
            if (!error && ack?.ok) {
              // Record the server-side join even if the UI deselected the store
              // while the request was in flight; the next reconciliation leaves it.
              subscribed.add(storeId);
              reconcileSubscriptions();
            }
          },
        );
      }
    };

    reconcileRef.current = reconcileSubscriptions;

    socket.on("connect", () => {
      subscribedStoreIdsRef.current.clear();
      pendingSubscribeRef.current.clear();
      pendingUnsubscribeRef.current.clear();
      reconcileSubscriptions();
    });

    socket.on("disconnect", () => {
      subscribedStoreIdsRef.current.clear();
      pendingSubscribeRef.current.clear();
      pendingUnsubscribeRef.current.clear();
    });

    socket.on("connect_error", (error) => {
      // An expired/revoked JWT requires a fresh login; don't keep a stale socket.
      if (/unauthorized/i.test(error.message)) socket.disconnect();
    });

    const invalidateDashboard = () => {
      queryClient.invalidateQueries({ queryKey: ["stores", token] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-snapshot", token] });
      queryClient.invalidateQueries({ queryKey: ["environment-summary"] });
      queryClient.invalidateQueries({ queryKey: ["environment-series"] });
    };

    socket.on("platform:update", invalidateDashboard);
    socket.on("snapshot:update", invalidateDashboard);
    socket.on("authorization:revoked", (payload: { storeId: string }) => {
      subscribedStoreIdsRef.current.delete(payload.storeId);
      pendingSubscribeRef.current.delete(payload.storeId);
      pendingUnsubscribeRef.current.delete(payload.storeId);
      invalidateDashboard();
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      subscribedStoreIdsRef.current.clear();
      pendingSubscribeRef.current.clear();
      pendingUnsubscribeRef.current.clear();
      if (socketRef.current === socket) {
        socketRef.current = null;
        reconcileRef.current = () => undefined;
      }
    };
  }, [queryClient, token]);

  useEffect(() => {
    reconcileRef.current();
  }, [storeIds]);
}
