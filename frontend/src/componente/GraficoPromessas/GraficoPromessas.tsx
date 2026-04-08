"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useDashboardPromises } from "../../hooks/controller/dashboard/useDashboardPromises";
import { useDashboardCollectionsMetrics } from "../../hooks/controller/dashboard/useDashboardCollectionsMetrics";
import styles from "./GraficoPromessas.module.css";

type CustomTooltipProps = { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string };

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} className={styles.tooltipVal} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

const GraficoPromessas: React.FC = () => {
  const { promises, loading } = useDashboardPromises();
  const { metrics } = useDashboardCollectionsMetrics();

  if (loading) return <div className={styles.skeleton} />;

  const statusItems = [
    { label: "Cumpridas", value: promises.kept, color: "rgba(74,222,128,0.85)", bg: "rgba(74,222,128,0.1)" },
    { label: "Quebradas", value: promises.broken, color: "rgba(239,68,68,0.85)", bg: "rgba(239,68,68,0.1)" },
    { label: "Pendentes", value: promises.pending, color: "rgba(212,166,0,0.85)", bg: "rgba(212,166,0,0.1)" },
    { label: "Canceladas", value: promises.cancelled, color: "rgba(148,163,184,0.7)", bg: "rgba(148,163,184,0.07)" },
  ];

  const recoveredAmountFormatted = metrics.recoveredAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Promessas de Pagamento</h2>
          <p className={styles.subtitle}>Status e tendência mensal das promessas</p>
        </div>
        <div className={styles.rateBadge}>
          <span className={styles.rateVal}>{promises.keptRate}%</span>
          <span className={styles.rateLabel}>cumpridas</span>
        </div>
      </div>

      <div className={styles.statusGrid}>
        {statusItems.map((item) => (
          <div key={item.label} className={styles.statusCard} style={{ background: item.bg, borderColor: item.color }}>
            <span className={styles.statusValue} style={{ color: item.color }}>{item.value}</span>
            <span className={styles.statusLabel}>{item.label}</span>
          </div>
        ))}
      </div>

      <div className={styles.chartArea}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={promises.monthly} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
            <defs>
              <linearGradient id="totalBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(212,166,0,0.5)" />
                <stop offset="100%" stopColor="rgba(212,166,0,0.1)" />
              </linearGradient>
              <linearGradient id="keptBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(74,222,128,0.9)" />
                <stop offset="100%" stopColor="rgba(74,222,128,0.3)" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Legend
              wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.35)", paddingTop: 4 }}
              formatter={(value) => value === "total" ? "Promessas" : "Cumpridas"}
            />
            <Bar dataKey="total" name="total" fill="url(#totalBarGrad)" radius={[3, 3, 0, 0]} barSize={10} />
            <Bar dataKey="kept" name="kept" fill="url(#keptBarGrad)" radius={[3, 3, 0, 0]} barSize={10} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.footer}>
        <div className={styles.footerItem}>
          <span className={styles.footerLabel}>Total de promessas</span>
          <span className={styles.footerVal}>{promises.total}</span>
        </div>
        <div className={styles.footerDivider} />
        <div className={styles.footerItem}>
          <span className={styles.footerLabel}>Valor recuperado</span>
          <span className={styles.footerVal}>{recoveredAmountFormatted}</span>
        </div>
      </div>
    </div>
  );
};

export default GraficoPromessas;
