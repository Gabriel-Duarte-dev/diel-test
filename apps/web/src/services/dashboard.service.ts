import type { DashboardSnapshotResponse, StoresPeriod } from "../types/domain";
import { apiRequest, authHeaders } from "./http";

export async function fetchDashboardSnapshot(token: string, period: StoresPeriod) {
  return apiRequest<DashboardSnapshotResponse>(`/dashboard/snapshot?period=${period}`, {
    headers: authHeaders(token),
  });
}