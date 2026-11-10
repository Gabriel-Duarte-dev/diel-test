import { useNetworkContext } from "../../contexts/NetworkContext";

function KpiCard({ title, value }: { title: string; value: string | number }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </article>
  );
}

export function NetworkKpiCards() {
  const { snapshot, snapshotLoading, filters, onChangePeriod } =
    useNetworkContext();

  if (snapshotLoading) {
    return (
      <p className="mt-4 text-sm text-slate-500">
        Carregando indicadores da rede...
      </p>
    );
  }

  if (!snapshot) {
    return null;
  }

  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Indicadores da rede
        </p>
        <div
          className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1"
          data-testid="network-period-select"
        >
          <button
            className={`h-8 rounded-md px-2 text-xs font-semibold ${filters.period === "last_day" ? "bg-white text-slate-900 shadow" : "text-slate-600"}`}
            onClick={() => onChangePeriod("last_day")}
          >
            1D
          </button>
          <button
            className={`h-8 rounded-md px-2 text-xs font-semibold ${filters.period === "last_week" ? "bg-white text-slate-900 shadow" : "text-slate-600"}`}
            onClick={() => onChangePeriod("last_week")}
          >
            7D
          </button>
          <button
            className={`h-8 rounded-md px-2 text-xs font-semibold ${filters.period === "last_30_days" ? "bg-white text-slate-900 shadow" : "text-slate-600"}`}
            onClick={() => onChangePeriod("last_30_days")}
          >
            30D
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard title="Lojas" value={snapshot.storesTotal} />
        <KpiCard title="Ambientes" value={snapshot.environmentsTotal} />
        <KpiCard
          title="Fora da faixa"
          value={snapshot.environmentsOutOfRange}
        />
        <KpiCard
          title="Conforto medio"
          value={`${snapshot.avgComfortPercent}%`}
        />
      </div>
    </section>
  );
}
