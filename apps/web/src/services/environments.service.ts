import { apiRequest, authHeaders } from "./http";
import type {
  EnvironmentSummaryResponse,
  EnvironmentSeriesResponse,
  StoresPeriod,
} from "../types/domain";

export async function fetchEnvironmentSummary(environmentId: string, token: string) {
  return apiRequest<EnvironmentSummaryResponse>(`/environments/${environmentId}/summary`, {
    headers: authHeaders(token),
  });
}

export async function fetchEnvironmentSeries(
  environmentId: string,
  token: string,
  period: StoresPeriod,
) {
  const params = new URLSearchParams({
    period,
    aggregation: "hourly",
    includeExternal: "true",
  });

  return apiRequest<EnvironmentSeriesResponse>(
    `/environments/${environmentId}/series?${params.toString()}`,
    {
      headers: authHeaders(token),
    },
  );
}
