export type StoreStatus = "CONFORTAVEL" | "FORA_FAIXA" | "SEM_DADOS";
export type StoresSortBy = "nome" | "cidade" | "comfortPercent";
export type SortDir = "asc" | "desc";
export type StoresPeriod = "last_day" | "last_week" | "last_30_days";

export type StoresQueryFilters = {
  clientId: string;
  search: string;
  status: "ALL" | StoreStatus;
  sortBy: StoresSortBy;
  sortDir: SortDir;
  period: StoresPeriod;
  page: number;
  limit: number;
};

export type ClientItem = {
  id: string;
  nome: string;
};

export type StoreItem = {
  id: string;
  nome: string;
  cidade: string;
  uf: string;
  environmentsCount: number;
  status: StoreStatus;
  comfortPercent: number;
  environmentsOutOfRange: number;
  defaultEnvironmentId: string | null;
};

export type StoresPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type StoresResponse = {
  success: boolean;
  data: StoreItem[];
  pagination: StoresPagination;
};

export type LoginResponse = {
  success: boolean;
  data: {
    accessToken: string;
    user: {
      id: string;
      nome: string;
      role: string;
    };
  };
};

export type EnvironmentOption = {
  id: string;
  label: string;
};

export type EnvironmentSummaryResponse = {
  success: boolean;
  data: {
    id: string;
    nome: string;
    status: string;
    comfortRange: { min: number; max: number };
    store: { id: string; nome: string; cidade: string };
    metrics?: { comfortPercent?: number };
    device?: { status?: string; lastPacketAt?: string | null };
  };
};

export type EnvironmentSeriesResponse = {
  success: boolean;
  data: {
    series: Array<{ timestamp: string; temperature: number }>;
    externalTemperature: Array<{ timestampUtc: string; temperature: number }>;
    gaps: Array<{ from: string; to: string; reason: string }>;
  };
};

export type DashboardSnapshotResponse = {
  success: boolean;
  data: {
    period: StoresPeriod;
    storesTotal: number;
    environmentsTotal: number;
    environmentsOutOfRange: number;
    avgComfortPercent: number;
  };
  meta: {
    referenceTime: string;
  };
};
