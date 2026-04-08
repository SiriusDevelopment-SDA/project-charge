import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useDashboardPaymentProfile } from "../../hooks/controller/dashboard/useDashboardPaymentProfile";
import styles from "./GraficoPaymentProfile.module.css";

const BUCKET_COLORS: Record<string, string> = {
  "Pontual":       "#4ade80",
  "Atrasa 1-15d":  "#facc15",
  "Atrasa 15-30d": "#fb923c",
  "Crônico +30d":  "#f87171",
};

type TooltipProps = { active?: boolean; payload?: { value: number }[]; label?: string };
const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      <p className={styles.tooltipVal}>{payload[0].value.toFixed(1).replace(".", ",")}% pontuais</p>
    </div>
  );
};

const GraficoPaymentProfile: React.FC = () => {
  const { profile, loading } = useDashboardPaymentProfile();

  if (loading) return <div className={styles.skeleton} />;

  const totalClients = profile.distribution.reduce((s, b) => s + b.count, 0);
  const bestBucket = [...profile.distribution].sort((a, b) => b.count - a.count)[0];

  return (
    <div className={styles.container}>

      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Perfil de Pagamento</h2>
          <p className={styles.subtitle}>Comportamento histórico de atraso por cliente</p>
        </div>
        <div className={styles.totalBadge}>
          <span className={styles.totalVal}>{totalClients}</span>
          <span className={styles.totalLabel}>clientes</span>
        </div>
      </div>

      <div className={styles.body}>

        {/* ── distribuição ── */}
        <div className={styles.distribution}>
          {profile.distribution.map((bucket) => {
            const color = BUCKET_COLORS[bucket.label] ?? "#94a3b8";
            return (
              <div key={bucket.label} className={styles.row}>
                <div className={styles.rowHeader}>
                  <span className={styles.dot} style={{ background: color }} />
                  <span className={styles.rowLabel}>{bucket.label}</span>
                  <span className={styles.rowCount} style={{ color }}>
                    {bucket.count}
                    <span className={styles.rowPct}>({bucket.pct}%)</span>
                  </span>
                </div>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ width: `${bucket.pct}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* ── tendência ── */}
        <div className={styles.trendPanel}>
          <p className={styles.trendLabel}>% pagamentos pontuais por mês</p>
          <div className={styles.trendChart}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={profile.trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }} dy={6} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(74,222,128,0.1)" }} />
                <Line
                  type="monotone"
                  dataKey="onTimePct"
                  stroke="#4ade80"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#4ade80", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#4ade80" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      <div className={styles.footer}>
        <div className={styles.footerItem}>
          <span className={styles.footerLabel}>Perfil predominante</span>
          <span className={styles.footerVal}>{bestBucket?.label ?? "—"}</span>
        </div>
        <div className={styles.footerDivider} />
        <div className={styles.footerItem}>
          <span className={styles.footerLabel}>Pontuais</span>
          <span className={styles.footerVal}>
            {profile.distribution.find(b => b.label === "Pontual")?.pct ?? 0}%
          </span>
        </div>
        <div className={styles.footerDivider} />
        <div className={styles.footerItem}>
          <span className={styles.footerLabel}>Crônicos</span>
          <span className={styles.footerVal} style={{ color: "#f87171" }}>
            {profile.distribution.find(b => b.label === "Crônico +30d")?.pct ?? 0}%
          </span>
        </div>
      </div>

    </div>
  );
};

export default GraficoPaymentProfile;
