"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { useDashboardReturnRate } from "../../hooks/controller/dashboard/useDashboardReturnRate";
import styles from "./GraficoDisparo.module.css";

type CustomBarLabelProps = { x?: number; y?: number; width?: number; value?: number };

const CustomBarLabel = ({ x = 0, y = 0, width = 0, value = 0 }: CustomBarLabelProps) => {
  if (!value) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 5}
      fill="rgba(212,166,0,0.8)"
      fontSize={10}
      fontWeight={600}
      textAnchor="middle"
    >
      {value}%
    </text>
  );
};

type TooltipEntry = { value?: number };
type CustomTooltipProps = { active?: boolean; payload?: TooltipEntry[]; label?: string };

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  const rate = payload[0]?.value ?? 0;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      <p className={styles.tooltipVal}>
        {rate}%
        <span> de resposta</span>
      </p>
      <p className={styles.tooltipSub}>
        {rate >= 60 ? "Excelente" : rate >= 30 ? "Regular" : rate > 0 ? "Baixo" : "Sem dados"}
      </p>
    </div>
  );
};

const GraficoDisparo: React.FC = () => {
  const { returnRate, loading } = useDashboardReturnRate();

  const data = useMemo(
    () =>
      returnRate.map((item) => ({
        month: item.month,
        rate: item.disparo > 0 ? Math.round((item.retorno / item.disparo) * 100) : 0,
      })),
    [returnRate]
  );

  const avg = useMemo(() => {
    const nonZero = data.filter((d) => d.rate > 0);
    if (!nonZero.length) return 0;
    return Math.round(nonZero.reduce((sum, d) => sum + d.rate, 0) / nonZero.length);
  }, [data]);

  if (loading) return <div className={styles.skeleton} />;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Taxa de Resposta Mensal</h2>
          <p className={styles.subtitle}>Percentual de clientes que responderam após o disparo</p>
        </div>
        {avg > 0 && (
          <div className={styles.avgBadge}>
            <span className={styles.avgLabel}>Média</span>
            <span className={styles.avgValue}>{avg}%</span>
          </div>
        )}
      </div>

      <div className={styles.chartArea}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 12, left: -16, bottom: 16 }}>
            <defs>
              <linearGradient id="rateBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(212,166,0,0.9)" />
                <stop offset="100%" stopColor="rgba(212,166,0,0.25)" />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />

            {avg > 0 && (
              <ReferenceLine
                y={avg}
                stroke="rgba(212,166,0,0.3)"
                strokeDasharray="4 4"
                label={{
                  value: `Média ${avg}%`,
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "rgba(212,166,0,0.5)",
                }}
              />
            )}

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
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              dx={-6}
            />

            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(212,166,0,0.04)" }} />

            <Bar dataKey="rate" radius={[4, 4, 1, 1]} barSize={26} fill="url(#rateBarGrad)">
              <LabelList content={<CustomBarLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default GraficoDisparo;
