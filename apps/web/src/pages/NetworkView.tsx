import { NetworkFilters } from "../components/network/NetworkFilters";
import { NetworkKpiCards } from "../components/network/NetworkKpiCards";
import { NetworkPagination } from "../components/network/NetworkPagination";
import { StoreCard } from "../components/network/StoreCard";
import { useNetworkContext } from "../contexts/NetworkContext";
export function NetworkView() {
  const { stores, storesLoading } = useNetworkContext();

  const hasResults = stores.length > 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-panel sm:p-5">
      <h2 className="text-xl font-semibold text-slate-900">Visao da rede</h2>
      <p className="mt-1 text-sm text-slate-500">
        Monitore centenas de lojas com filtros server-side e paginação.
      </p>
      <NetworkKpiCards />
      <NetworkFilters />

      {storesLoading && (
        <p className="mt-4 text-sm text-slate-500">Carregando lojas...</p>
      )}

      {!storesLoading && !hasResults && (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
          Nenhuma loja encontrada com os filtros atuais.
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {stores.map((store) => (
          <StoreCard key={store.id} store={store} />
        ))}
      </div>
      <NetworkPagination />
    </div>
  );
}
