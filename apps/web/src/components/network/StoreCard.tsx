import type { StoreItem } from "../../types/domain";
import { useNetworkContext } from "../../contexts/NetworkContext";

type Props = {
  store: StoreItem;
};

function badgeClass(status: string) {
  if (status === "CONFORTAVEL") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "FORA_FAIXA") {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-slate-200 text-slate-600";
}

export function StoreCard({ store }: Props) {
  const { onSelectEnvironment } = useNetworkContext();

  function handleViewDetails() {
    if (!store.defaultEnvironmentId) {
      return;
    }

    onSelectEnvironment(store.defaultEnvironmentId);

    if (window.matchMedia("(max-width: 1279px)").matches) {
      document
        .getElementById("graphic")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <article className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[1.2fr_1fr_auto] sm:items-center">
      <div className="space-y-1">
        <strong className="text-base text-slate-900">{store.nome}</strong>
        <p className="text-sm text-slate-500">
          {store.cidade}/{store.uf}
        </p>
      </div>

      <div className="space-y-1 text-sm text-slate-600">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass(store.status)}`}
        >
          {store.status}
        </span>
        <p>{store.environmentsCount} ambientes</p>
        <p>{store.environmentsOutOfRange} fora da faixa</p>
        <p>Conforto no periodo: {store.comfortPercent}%</p>
      </div>

      <button
        className="h-10 rounded-xl bg-diel-ink px-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-slate-300"
        onClick={handleViewDetails}
        disabled={!store.defaultEnvironmentId}
      >
        Ver detalhes
      </button>
    </article>
  );
}
