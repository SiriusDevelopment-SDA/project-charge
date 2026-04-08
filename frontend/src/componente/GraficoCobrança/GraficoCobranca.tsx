"use client";

import { useContext, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import styles from "./GraficoCobranca.module.css";
import { DashboardContext } from "../../context/contextDashboard";

type TooltipEntry = { dataKey?: string; color?: string; value?: number };
type CustomTooltipProps = { active?: boolean; payload?: TooltipEntry[]; label?: string };

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className={styles.tooltipRow}>
          <span
            className={styles.tooltipDot}
            style={{ background: entry.color, boxShadow: `0 0 6px ${entry.color}` }}
          />
          <span className={styles.tooltipKey}>{entry.dataKey === "inadimplencia" ? "Inadimplência" : "Pagamentos"}</span>
          <span className={styles.tooltipVal} style={{ color: entry.color }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

const GraficoCobranca: React.FC = () => {
  const { charges, loading } = useContext(DashboardContext)!;

  const data = useMemo(() => charges.map((c) => ({
    month: c.month,
    inadimplencia: c.default,
    pagamentos: c.payments,
  })), [charges]);

  if (loading) return <div className={styles.skeleton} />;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Inadimplência vs Pagamentos</h2>
          <p className={styles.subtitle}>Evolução anual por mês</p>
        </div>
        <div className={styles.legend}>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: "rgba(239,68,68,0.8)" }} />
            <span className={styles.legendText}>Inadimplência</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: "rgba(212,166,0,0.9)" }} />
            <span className={styles.legendText}>Pagamentos</span>
          </div>
        </div>
      </div>

      <div className={styles.chartArea}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 16, left: -8, bottom: 16 }}>
            <defs>
              <linearGradient id="gradInadimplencia" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(239,68,68,1)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="rgba(239,68,68,1)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradPagamentos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(212,166,0,1)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="rgba(212,166,0,1)" stopOpacity={0} />
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
              allowDecimals={false}
              dx={-6}
              domain={[0, (max: number) => Math.max(max + 2, 5)]}
            />

            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }} />

            <Area
              type="monotone"
              dataKey="inadimplencia"
              stroke="rgba(239,68,68,0.7)"
              strokeWidth={2}
              fill="url(#gradInadimplencia)"
              fillOpacity={1}
              dot={false}
              activeDot={{ r: 5, fill: "rgba(239,68,68,0.9)", stroke: "#000", strokeWidth: 1 }}
              animationDuration={1000}
            />
            <Area
              type="monotone"
              dataKey="pagamentos"
              stroke="rgba(212,166,0,0.85)"
              strokeWidth={2}
              fill="url(#gradPagamentos)"
              fillOpacity={1}
              dot={false}
              activeDot={{ r: 5, fill: "#d4a600", stroke: "#000", strokeWidth: 1 }}
              animationDuration={1200}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default GraficoCobranca;
