import { useEffect, useMemo, useState } from "react";
import { useEnvironmentData } from "../hooks/useEnvironmentData";
import type { EnvironmentOption, StoresPeriod } from "../types/domain";
import { EnvironmentControls } from "../components/environment/EnvironmentControls";
import { EnvironmentSummary } from "../components/environment/EnvironmentSummary";
import { EnvironmentChart } from "../components/environment/EnvironmentChart";
import { EnvironmentDiagnostics } from "../components/environment/EnvironmentDiagnostics";

type Props = {
  environmentId: string | null;
  environmentOptions: EnvironmentOption[];
  token: string;
};

export function EnvironmentView({
  environmentId,
  environmentOptions,
  token,
}: Props) {
  const [selected, setSelected] = useState<string | null>(environmentId);
  const [period, setPeriod] = useState<StoresPeriod>("last_day");

  useEffect(() => {
    if (environmentId) setSelected(environmentId);
  }, [environmentId]);

  const {
    summary,
    summaryLoading,
    summaryError,
    chartData,
    gaps,
    seriesLoading,
    seriesError,
  } = useEnvironmentData(selected, token, period);

  const summaryErrorMessage = summaryError instanceof Error ? summaryError.message : null;
  const seriesErrorMessage = seriesError instanceof Error ? seriesError.message : null;

  const label = useMemo(
    () =>
      environmentOptions.find((item) => item.id === selected)?.label ??
      "Selecione um ambiente",
    [environmentOptions, selected],
  );

  const periodLabel =
    period === "last_day"
      ? "Ultimo dia"
      : period === "last_week"
        ? "Ultima semana"
        : "Ultimos 30 dias";

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-panel sm:p-5"
      id="graphic"
    >
      <h2 className="text-xl font-semibold text-slate-900">
        Detalhe do ambiente
      </h2>
      <EnvironmentControls
        selectedEnvironmentId={selected ?? ""}
        environmentOptions={environmentOptions}
        period={period}
        onSelectEnvironment={setSelected}
        onSelectPeriod={setPeriod}
      />

      <p className="mt-2 text-sm text-slate-500">
        {label} · {periodLabel}
      </p>

      {summaryErrorMessage ? (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Nao foi possivel carregar o resumo: {summaryErrorMessage}
        </p>
      ) : null}
      {seriesErrorMessage ? (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Nao foi possivel carregar a serie: {seriesErrorMessage}
        </p>
      ) : null}

      <EnvironmentSummary summary={summary} loading={summaryLoading} />
      <EnvironmentChart
        chartData={chartData}
        loading={seriesLoading}
        comfortRange={summary?.comfortRange}
      />
      <EnvironmentDiagnostics gaps={gaps} device={summary?.device} />
    </div>
  );
}
