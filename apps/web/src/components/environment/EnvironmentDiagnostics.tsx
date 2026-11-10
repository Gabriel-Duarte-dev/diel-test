type Gap = { from: string; to: string; reason: string };

type DeviceInfo = {
  status?: string;
  lastPacketAt?: string | null;
};

type Props = {
  gaps: Gap[];
  device?: DeviceInfo;
};

export function EnvironmentDiagnostics({ gaps, device }: Props) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
      <div className="rounded-xl border border-slate-200 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Lacunas detectadas
        </p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{gaps.length}</p>
        {gaps.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {gaps.slice(0, 3).map((gap, index) => (
              <li key={`${gap.from}-${index}`}>
                {new Date(gap.from).toLocaleString("pt-BR")} ate{" "}
                {new Date(gap.to).toLocaleString("pt-BR")}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            Sem indisponibilidade relevante no periodo.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Dispositivo
        </p>
        <p className="mt-1 text-sm text-slate-700">
          Status atual: <strong>{device?.status ?? "SEM_DADOS"}</strong>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Ultimo pacote:{" "}
          {device?.lastPacketAt
            ? new Date(device.lastPacketAt).toLocaleString("pt-BR")
            : "nao disponivel"}
        </p>
      </div>
    </div>
  );
}
