import type { EnvironmentOption, StoresPeriod } from "../../types/domain";

type Props = {
  selectedEnvironmentId: string;
  environmentOptions: EnvironmentOption[];
  period: StoresPeriod;
  onSelectEnvironment: (value: string) => void;
  onSelectPeriod: (value: StoresPeriod) => void;
};

export function EnvironmentControls({
  selectedEnvironmentId,
  environmentOptions,
  period,
  onSelectEnvironment,
  onSelectPeriod,
}: Props) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Ambiente
        </span>
        <select
          value={selectedEnvironmentId}
          onChange={(event) => onSelectEnvironment(event.target.value)}
          className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none transition focus:border-diel-cyan"
        >
          <option value="">Escolha</option>
          {environmentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Periodo
        </span>
        <div
          className="grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1"
          data-testid="period-select"
        >
          <button
            className={`h-9 rounded-lg text-xs font-semibold transition ${period === "last_day" ? "bg-white text-slate-900 shadow" : "text-slate-600"}`}
            onClick={() => onSelectPeriod("last_day")}
          >
            Ultimo dia
          </button>
          <button
            className={`h-9 rounded-lg text-xs font-semibold transition ${period === "last_week" ? "bg-white text-slate-900 shadow" : "text-slate-600"}`}
            onClick={() => onSelectPeriod("last_week")}
          >
            Semana
          </button>
          <button
            className={`h-9 rounded-lg text-xs font-semibold transition ${period === "last_30_days" ? "bg-white text-slate-900 shadow" : "text-slate-600"}`}
            onClick={() => onSelectPeriod("last_30_days")}
          >
            30 dias
          </button>
        </div>
      </div>
    </div>
  );
}
