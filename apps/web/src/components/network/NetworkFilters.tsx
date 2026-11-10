import type { StoreStatus, StoresSortBy, SortDir } from "../../types/domain";
import { useNetworkContext } from "../../contexts/NetworkContext";

export function NetworkFilters() {
  const {
    clients,
    filters,
    onChangeClientId,
    onChangeSearch,
    onChangeStatus,
    onChangeSortBy,
    onChangeSortDir,
  } = useNetworkContext();

  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <label className="block xl:col-span-1">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Cliente
        </span>
        <select
          data-testid="store-client"
          value={filters.clientId}
          onChange={(event) => onChangeClientId(event.target.value)}
          className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none transition focus:border-diel-cyan"
        >
          <option value="ALL">Todos os clientes</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.nome}
            </option>
          ))}
        </select>
      </label>

      <label className="block xl:col-span-1">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Buscar loja
        </span>
        <input
          data-testid="store-search"
          value={filters.search}
          onChange={(event) => onChangeSearch(event.target.value)}
          placeholder="Nome ou cidade"
          className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none transition focus:border-diel-cyan"
        />
      </label>

      <label className="block xl:col-span-1">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Status
        </span>
        <select
          data-testid="store-status"
          value={filters.status}
          onChange={(event) =>
            onChangeStatus(event.target.value as "ALL" | StoreStatus)
          }
          className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none transition focus:border-diel-cyan"
        >
          <option value="ALL">Todos</option>
          <option value="CONFORTAVEL">Confortavel</option>
          <option value="FORA_FAIXA">Fora da faixa</option>
          <option value="SEM_DADOS">Sem dados</option>
        </select>
      </label>

      <label className="block xl:col-span-1">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Ordenar por
        </span>
        <select
          data-testid="store-sort-by"
          value={filters.sortBy}
          onChange={(event) =>
            onChangeSortBy(event.target.value as StoresSortBy)
          }
          className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none transition focus:border-diel-cyan"
        >
          <option value="nome">Nome</option>
          <option value="cidade">Cidade</option>
          <option value="comfortPercent">Conforto</option>
        </select>
      </label>

      <label className="block xl:col-span-1">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Direcao
        </span>
        <select
          data-testid="store-sort-dir"
          value={filters.sortDir}
          onChange={(event) => onChangeSortDir(event.target.value as SortDir)}
          className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none transition focus:border-diel-cyan"
        >
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </select>
      </label>
    </div>
  );
}
