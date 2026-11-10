type Summary = {
  status: string;
  comfortRange: { min: number; max: number };
  store: { nome: string };
  metrics?: { comfortPercent?: number };
};

type Props = {
  summary: Summary | undefined;
  loading: boolean;
};

export function EnvironmentSummary({ summary, loading }: Props) {
  if (loading) {
    return <p className="mt-3 text-sm text-slate-500">Carregando resumo...</p>;
  }

  if (!summary) {
    return null;
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3 text-sm sm:grid-cols-4">
      <div>
        <small className="block text-xs uppercase tracking-wide text-slate-500">
          Status
        </small>
        <strong className="text-slate-900">{summary.status}</strong>
      </div>
      <div>
        <small className="block text-xs uppercase tracking-wide text-slate-500">
          Faixa de conforto
        </small>
        <strong className="text-slate-900">
          {summary.comfortRange.min}C - {summary.comfortRange.max}C
        </strong>
      </div>
      <div>
        <small className="block text-xs uppercase tracking-wide text-slate-500">
          Loja
        </small>
        <strong className="text-slate-900">{summary.store.nome}</strong>
      </div>
      <div>
        <small className="block text-xs uppercase tracking-wide text-slate-500">
          Conforto no periodo
        </small>
        <strong className="text-slate-900">
          {summary.metrics?.comfortPercent ?? 0}%
        </strong>
      </div>
    </div>
  );
}
