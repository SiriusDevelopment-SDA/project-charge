"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { useDashboardForecast } from "../../hooks/controller/dashboard/useDashboardForecast";
import styles from "./GraficoPrevisao.module.css";

type CustomBarLabelProps = { x?: number; y?: number; width?: number; value?: number };

const CustomBarLabel = ({ x = 0, y = 0, width = 0, value = 0 }: CustomBarLabelProps) => {
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 5} fill="rgba(74,222,128,0.8)" fontSize={10} fontWeight={600} textAnchor="middle">
      {value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
    </text>
  );
};

type TooltipEntry = { value?: number };
type CustomTooltipProps = { active?: boolean; payload?: TooltipEntry[]; label?: string };

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  const amount = payload[0]?.value ?? 0;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      <p className={styles.tooltipVal}>
        {amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
      </p>
      <p className={styles.tooltipSub}>previsto</p>
    </div>
  );
};

const GraficoPrevisao: React.FC = () => {
  const { forecast, loading } = useDashboardForecast();

  if (loading) return <div className={styles.skeleton} />;

  const totalFormatted = forecast.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const totalCount = forecast.weeks.reduce((s, w) => s + w.count, 0);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Previsão de Recebimentos</h2>
          <p className={styles.subtitle}>Promessas pendentes para os próximos 30 dias</p>
        </div>
        <div className={styles.totalBadge}>
          <span className={styles.totalVal}>{totalFormatted}</span>
          <span className={styles.totalLabel}>previsto</span>
        </div>
      </div>

      <div className={styles.chartArea}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={forecast.weeks} margin={{ top: 28, right: 12, left: -12, bottom: 4 }}>
            <defs>
              <linearGradient id="forecastBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(74,222,128,0.85)" />
                <stop offset="100%" stopColor="rgba(74,222,128,0.2)" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(74,222,128,0.04)" }} />
            <Bar dataKey="amount" fill="url(#forecastBarGrad)" radius={[5, 5, 1, 1]} barSize={48}>
              <LabelList content={<CustomBarLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.footer}>
        <div className={styles.footerItem}>
          <span className={styles.footerLabel}>Promessas pendentes</span>
          <span className={styles.footerVal}>{totalCount}</span>
        </div>
        <div className={styles.footerDivider} />
        <div className={styles.footerItem}>
          <span className={styles.footerLabel}>Valor total previsto</span>
          <span className={styles.footerVal}>{totalFormatted}</span>
        </div>
      </div>
    </div>
  );
};

export default GraficoPrevisao;
