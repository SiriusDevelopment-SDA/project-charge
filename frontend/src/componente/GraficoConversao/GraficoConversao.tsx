"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useDashboardDebtConversion } from "../../hooks/controller/dashboard/useDashboardDebtConversion";
import styles from "./GraficoConversao.module.css";

type TooltipEntry = { value?: number; name?: string };
type CustomTooltipProps = { active?: boolean; payload?: TooltipEntry[]; label?: string };

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  const rate = payload[0]?.value ?? 0;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      <p className={styles.tooltipVal}>{rate}%</p>
      <p className={styles.tooltipSub}>taxa de conversão</p>
    </div>
  );
};

function rateColor(rate: number): string {
  if (rate >= 60) return "rgba(74,222,128,0.85)";
  if (rate >= 35) return "rgba(212,166,0,0.85)";
  if (rate >= 15) return "rgba(251,146,60,0.85)";
  return "rgba(239,68,68,0.75)";
}

const GraficoConversao: React.FC = () => {
  const { debtConversion, loading } = useDashboardDebtConversion();

  if (loading) return <div className={styles.skeleton} />;

  const data = debtConversion.brackets;
  const bestBracket = [...data].sort((a, b) => b.keptRate - a.keptRate)[0];
  const totalPromises = data.reduce((s, b) => s + b.total, 0);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Conversão por Faixa de Dívida</h2>
          <p className={styles.subtitle}>Taxa de cumprimento de promessas por valor da dívida</p>
        </div>
        {bestBracket && bestBracket.total > 0 && (
          <div className={styles.bestBadge}>
            <span className={styles.bestVal}>{bestBracket.keptRate}%</span>
            <span className={styles.bestLabel}>{bestBracket.label}</span>
          </div>
        )}
      </div>

      <div className={styles.chartArea}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 10 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar dataKey="keptRate" radius={[4, 4, 1, 1]} barSize={32}>
              {data.map((entry) => (
                <Cell key={entry.label} fill={rateColor(entry.keptRate)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.bracketList}>
        {data.filter((b) => b.total > 0).map((bracket) => (
          <div key={bracket.label} className={styles.bracketRow}>
            <span className={styles.bracketLabel}>{bracket.label}</span>
            <span className={styles.bracketStats}>
              {bracket.kept}/{bracket.total}
            </span>
            <span className={styles.bracketRate} style={{ color: rateColor(bracket.keptRate) }}>
              {bracket.keptRate}%
            </span>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <div className={styles.footerItem}>
          <span className={styles.footerLabel}>Promessas analisadas</span>
          <span className={styles.footerVal}>{totalPromises}</span>
        </div>
        <div className={styles.footerDivider} />
        <div className={styles.footerItem}>
          <span className={styles.footerLabel}>Melhor faixa</span>
          <span className={styles.footerVal}>{bestBracket?.total > 0 ? bestBracket.label : "—"}</span>
        </div>
      </div>
    </div>
  );
};

export default GraficoConversao;
