import { useNetworkContext } from "../../contexts/NetworkContext";

export function NetworkPagination() {
  const { pagination, onChangePage, onChangeLimit } = useNetworkContext();

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-500">
        Mostrando pagina {pagination.page} de{" "}
        {Math.max(pagination.totalPages, 1)} · {pagination.total} lojas
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          por pagina
          <select
            data-testid="store-limit"
            value={pagination.limit}
            onChange={(event) => onChangeLimit(Number(event.target.value))}
            className="ml-2 h-9 rounded-lg border border-slate-300 px-2 text-sm"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </label>

        <button
          data-testid="store-prev-page"
          onClick={() => onChangePage(Math.max(1, pagination.page - 1))}
          disabled={pagination.page <= 1}
          className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-40"
        >
          Anterior
        </button>
        <button
          data-testid="store-next-page"
          onClick={() =>
            onChangePage(
              Math.min(pagination.totalPages || 1, pagination.page + 1),
            )
          }
          disabled={pagination.page >= pagination.totalPages}
          className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-40"
        >
          Proxima
        </button>
      </div>
    </div>
  );
}
