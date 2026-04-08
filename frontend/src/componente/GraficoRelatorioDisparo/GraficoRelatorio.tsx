import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import styles from "./GraficoRelatorio.module.css";
import { useDashboardReturnRate } from "../../hooks/controller/dashboard/useDashboardReturnRate";

type TooltipEntry = { dataKey?: string; color?: string; value?: number };
type CustomTooltipProps = { active?: boolean; payload?: TooltipEntry[]; label?: string };

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      {payload.map((entry: TooltipEntry) => (
        <div key={entry.dataKey} className={styles.tooltipRow}>
          <span
            className={styles.tooltipDot}
            style={{ background: entry.color, boxShadow: `0 0 6px ${entry.color}` }}
          />
          <span className={styles.tooltipKey}>
            {entry.dataKey === "disparo" ? "Disparos" : "Respostas"}
          </span>
          <span className={styles.tooltipVal} style={{ color: entry.color }}>
            {entry.value?.toLocaleString("pt-BR") ?? 0}
          </span>
        </div>
      ))}
    </div>
  );
};

const GraficoRelatorio: React.FC = () => {
  const { returnRate } = useDashboardReturnRate();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Disparos vs Respostas</h2>
          <p className={styles.subtitle}>Mensagens enviadas vs clientes que responderam</p>
        </div>
        <div className={styles.legend}>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: "rgba(212,166,0,0.9)" }} />
            <span className={styles.legendText}>Disparos</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: "rgba(255,255,255,0.35)" }} />
            <span className={styles.legendText}>Respostas</span>
          </div>
        </div>
      </div>

      <div className={styles.chartArea}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={returnRate} margin={{ top: 10, right: 16, left: -4, bottom: 16 }}>
            <defs>
              <linearGradient id="relGradDisparo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(212,166,0,1)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="rgba(212,166,0,1)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="relGradRetorno" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,1)" stopOpacity={0.1} />
                <stop offset="100%" stopColor="rgba(255,255,255,1)" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />

            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 11 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 11 }}
              tickFormatter={(v) => v.toLocaleString("pt-BR")}
              dx={-6}
            />

            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }} />

            <Area
              type="monotone"
              dataKey="disparo"
              stroke="rgba(212,166,0,0.85)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#relGradDisparo)"
              dot={false}
              activeDot={{ r: 5, fill: "#d4a600", stroke: "#000", strokeWidth: 1 }}
              animationDuration={1000}
            />
            <Area
              type="monotone"
              dataKey="retorno"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#relGradRetorno)"
              dot={false}
              activeDot={{ r: 5, fill: "rgba(255,255,255,0.7)", stroke: "#000", strokeWidth: 1 }}
              animationDuration={1200}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default GraficoRelatorio;
