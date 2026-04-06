import { useDashboardAging } from "../../hooks/controller/dashboard/useDashboardAging";
import styles from "./GraficoAging.module.css";

const BUCKET_COLORS = [
  "rgba(212,166,0,0.85)",
  "rgba(251,146,60,0.85)",
  "rgba(249,115,22,0.85)",
  "rgba(239,68,68,0.8)",
  "rgba(185,28,28,0.85)",
];


const GraficoAging: React.FC = () => {
  const { aging, loading } = useDashboardAging();

  if (loading) return <div className={styles.skeleton} />;

  const maxCount = Math.max(...aging.buckets.map((b) => b.count), 1);
  const total = aging.buckets.reduce((s, b) => s + b.count, 0);
  const totalValue = aging.buckets.reduce((s, b) => s + b.totalValue, 0);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Faturas Vencidas por Faixa</h2>
          <p className={styles.subtitle}>Distribuição por tempo de atraso</p>
        </div>
        <div className={styles.totalBadge}>
          <span className={styles.totalVal}>{total}</span>
          <span className={styles.totalLabel}>faturas</span>
        </div>
      </div>

      <div className={styles.buckets}>
        {aging.buckets.map((bucket, i) => {
          const pct = maxCount > 0 ? Math.round((bucket.count / maxCount) * 100) : 0;
          const valueFormatted = bucket.totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
          return (
            <div key={bucket.label} className={styles.row}>
              <div className={styles.rowHeader}>
                <div className={styles.labelDot} style={{ background: BUCKET_COLORS[i] }} />
                <span className={styles.rowLabel}>{bucket.label}</span>
                <span className={styles.rowCount} style={{ color: BUCKET_COLORS[i] }}>
                  {bucket.count}
                </span>
                <span className={styles.rowValue}>{valueFormatted}</span>
              </div>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{
                    width: `${pct}%`,
                    background: BUCKET_COLORS[i],
                    boxShadow: `0 0 6px ${BUCKET_COLORS[i]}`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <div className={styles.footerItem}>
          <span className={styles.footerLabel}>Total inadimplentes</span>
          <span className={styles.footerVal}>{total}</span>
        </div>
        <div className={styles.footerDivider} />
        <div className={styles.footerItem}>
          <span className={styles.footerLabel}>Valor total em aberto</span>
          <span className={styles.footerVal} style={{ color: "rgba(239,68,68,0.85)" }}>
            {totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
    </div>
  );
};

export default GraficoAging;
