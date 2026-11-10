import type { StoresQueryFilters, StoresResponse } from "../types/domain";
import { apiRequest, authHeaders } from "./http";

export async function fetchStores(token: string, filters: StoresQueryFilters) {
  const params = new URLSearchParams();

  if (filters.clientId !== "ALL") {
    params.set("clientId", filters.clientId);
  }
  if (filters.search) {
    params.set("search", filters.search);
  }
  if (filters.status !== "ALL") {
    params.set("status", filters.status);
  }

  params.set("sortBy", filters.sortBy);
  params.set("sortDir", filters.sortDir);
  params.set("period", filters.period);
  params.set("page", String(filters.page));
  params.set("limit", String(filters.limit));

  return apiRequest<StoresResponse>(`/stores?${params.toString()}`, {
    headers: authHeaders(token),
  });
}
