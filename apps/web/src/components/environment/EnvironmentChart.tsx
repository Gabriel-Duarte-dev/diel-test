import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

type ChartPoint = {
  label: string;
  interna?: number;
  externa?: number;
};

type Props = {
  chartData: ChartPoint[];
  loading: boolean;
  comfortRange?: { min: number; max: number };
};

export function EnvironmentChart({ chartData, loading, comfortRange }: Props) {
  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <h3 className="text-base font-semibold text-slate-900">
        Temperatura interna x externa
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        A faixa de conforto aparece destacada em azul no grafico.
      </p>
      {loading && (
        <p className="mt-3 text-sm text-slate-500">Carregando serie...</p>
      )}
      {!loading && chartData.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">Sem dados no periodo.</p>
      )}
      {chartData.length > 0 && (
        <div className="mt-3 h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e8f4" />
              <XAxis dataKey="label" hide={chartData.length > 12} />
              <YAxis />
              <Tooltip />
              <Legend />
              {comfortRange && (
                <ReferenceArea
                  y1={comfortRange.min}
                  y2={comfortRange.max}
                  fill="#d7f0ff"
                  fillOpacity={0.45}
                  strokeOpacity={0}
                />
              )}
              <Line
                type="monotone"
                dataKey="interna"
                name="Interna"
                stroke="#0b60e0"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="externa"
                name="Externa"
                stroke="#be3f2f"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
