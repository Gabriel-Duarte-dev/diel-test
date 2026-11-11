import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePlatformSocket } from "../hooks/usePlatformSocket";
import { fetchClients } from "../services/clients.service";
import { fetchDashboardSnapshot } from "../services/dashboard.service";
import { fetchStores } from "../services/stores.service";
import type {
  ClientItem,
  DashboardSnapshotResponse,
  EnvironmentOption,
  StoreItem,
  StoresPagination,
  StoresPeriod,
  StoresQueryFilters,
  StoresSortBy,
  SortDir,
  StoreStatus,
} from "../types/domain";

export type NetworkContextValue = {
  clients: ClientItem[];
  stores: StoreItem[];
  storesLoading: boolean;
  selectedEnvironmentId: string | null;
  environmentOptions: EnvironmentOption[];
  snapshot: DashboardSnapshotResponse["data"] | undefined;
  snapshotLoading: boolean;
  filters: Pick<
    StoresQueryFilters,
    "clientId" | "search" | "status" | "sortBy" | "sortDir" | "period"
  >;
  pagination: StoresPagination;
  onChangeClientId: (value: string) => void;
  onChangeSearch: (value: string) => void;
  onChangeStatus: (value: "ALL" | StoreStatus) => void;
  onChangeSortBy: (value: StoresSortBy) => void;
  onChangeSortDir: (value: SortDir) => void;
  onChangePeriod: (value: StoresPeriod) => void;
  onChangePage: (value: number) => void;
  onChangeLimit: (value: number) => void;
  onSelectEnvironment: (environmentId: string) => void;
};

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({
  token,
  children,
}: {
  token: string;
  children: ReactNode;
}) {
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<
    string | null
  >(null);
  const [clientId, setClientId] = useState("ALL");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | StoreStatus>("ALL");
  const [sortBy, setSortBy] = useState<StoresSortBy>("nome");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [period, setPeriod] = useState<StoresPeriod>("last_day");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const filters = useMemo<
    Pick<
      StoresQueryFilters,
      "clientId" | "search" | "status" | "sortBy" | "sortDir" | "period"
    > &
      Pick<StoresQueryFilters, "page" | "limit">
  >(
    () => ({ clientId, search, status, sortBy, sortDir, period, page, limit }),
    [clientId, search, status, sortBy, sortDir, period, page, limit],
  );

  const clientsQuery = useQuery({
    queryKey: ["clients", token],
    queryFn: () => fetchClients(token),
    refetchInterval: 30000,
  });

  const storesQuery = useQuery({
    queryKey: ["stores", token, filters],
    queryFn: () => fetchStores(token, filters),
    refetchInterval: 30000,
  });

  const snapshotQuery = useQuery({
    queryKey: ["dashboard-snapshot", token, period],
    queryFn: () => fetchDashboardSnapshot(token, period),
    refetchInterval: 30000,
  });

  const subscribedStoreIds = useMemo(
    () => (storesQuery.data?.data ?? []).map((store) => store.id),
    [storesQuery.data?.data],
  );

  usePlatformSocket(token, subscribedStoreIds);

  useEffect(() => {
    setPage(1);
  }, [clientId, search, status, sortBy, sortDir, period, limit]);

  const environmentOptions = useMemo<EnvironmentOption[]>(() => {
    const stores = storesQuery.data?.data ?? [];

    return stores
      .filter((store) => Boolean(store.defaultEnvironmentId))
      .map((store) => ({
        id: store.defaultEnvironmentId as string,
        label: `${store.nome} - ambiente principal`,
      }));
  }, [storesQuery.data]);

  const pagination: StoresPagination = storesQuery.data?.pagination ?? {
    page: 1,
    limit,
    total: 0,
    totalPages: 1,
  };

  const value = useMemo<NetworkContextValue>(
    () => ({
      clients: clientsQuery.data?.data ?? [],
      stores: storesQuery.data?.data ?? [],
      storesLoading: storesQuery.isLoading,
      selectedEnvironmentId,
      environmentOptions,
      snapshot: snapshotQuery.data?.data,
      snapshotLoading: snapshotQuery.isLoading,
      filters: {
        clientId,
        search,
        status,
        sortBy,
        sortDir,
        period,
      },
      pagination,
      onChangeClientId: setClientId,
      onChangeSearch: setSearch,
      onChangeStatus: setStatus,
      onChangeSortBy: setSortBy,
      onChangeSortDir: setSortDir,
      onChangePeriod: setPeriod,
      onChangePage: setPage,
      onChangeLimit: setLimit,
      onSelectEnvironment: setSelectedEnvironmentId,
    }),
    [
      clientsQuery.data,
      storesQuery.data,
      storesQuery.isLoading,
      selectedEnvironmentId,
      environmentOptions,
      snapshotQuery.data,
      snapshotQuery.isLoading,
      clientId,
      search,
      status,
      sortBy,
      sortDir,
      period,
      pagination,
    ],
  );

  return (
    <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
  );
}

export function useNetworkContext() {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error("useNetworkContext must be used inside NetworkProvider");
  }
  return context;
}
