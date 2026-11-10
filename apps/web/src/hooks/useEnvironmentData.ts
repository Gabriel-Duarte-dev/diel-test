import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEnvironmentSeries, fetchEnvironmentSummary } from "../services/environments.service";
import type { StoresPeriod } from "../types/domain";

export function useEnvironmentData(environmentId: string | null, token: string, period: StoresPeriod) {
  const summaryQuery = useQuery({
    queryKey: ["environment-summary", environmentId],
    queryFn: () => fetchEnvironmentSummary(environmentId as string, token),
    enabled: Boolean(environmentId),
    refetchInterval: 5000,
  });

  const seriesQuery = useQuery({
    queryKey: ["environment-series", environmentId, period],
    queryFn: () => fetchEnvironmentSeries(environmentId as string, token, period),
    enabled: Boolean(environmentId),
    refetchInterval: 15000,
  });

  const chartData = useMemo(() => {
    const internalSeries = seriesQuery.data?.data?.series ?? [];
    const externalSeries = seriesQuery.data?.data?.externalTemperature ?? [];

    const byTimestamp = new Map<string, { timestamp: string; interna?: number; externa?: number }>();

    for (const point of internalSeries) {
      const key = new Date(point.timestamp).toISOString();
      byTimestamp.set(key, {
        ...(byTimestamp.get(key) ?? { timestamp: key }),
        interna: point.temperature,
      });
    }

    for (const point of externalSeries) {
      const key = new Date(point.timestampUtc).toISOString();
      byTimestamp.set(key, {
        ...(byTimestamp.get(key) ?? { timestamp: key }),
        externa: point.temperature,
      });
    }

    return Array.from(byTimestamp.values())
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((item) => ({
        ...item,
        label: new Date(item.timestamp).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
      }));
  }, [seriesQuery.data]);

  return {
    summary: summaryQuery.data?.data,
    summaryLoading: summaryQuery.isLoading,
    chartData,
    gaps: seriesQuery.data?.data?.gaps ?? [],
    seriesLoading: seriesQuery.isLoading,
  };
}
