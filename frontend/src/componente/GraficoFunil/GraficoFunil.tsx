import styles from "./GraficoFunil.module.css";
import { useDashboardCollectionsMetrics } from "../../hooks/controller/dashboard/useDashboardCollectionsMetrics";
import { Users, MessageSquareText, TrendingUp } from "lucide-react";

const GraficoFunil: React.FC = () => {
  const { metrics } = useDashboardCollectionsMetrics();

  const total = metrics.chargedCustomers30d;
  const responded = metrics.respondedAfterCharge30d;
  const noResponse = metrics.noResponseOver24h;
  const rate = metrics.responseRate30d;

  const respondedPct = total > 0 ? Math.round((responded / total) * 100) : 0;
  const noResponsePct = total > 0 ? Math.round((noResponse / total) * 100) : 0;

  const steps = [
    {
      label: "Cobrados",
      value: total,
      pct: 100,
      icon: <Users size={13} />,
      color: "rgba(212,166,0,0.85)",
      bg: "rgba(212,166,0,0.12)",
    },
    {
      label: "Responderam",
      value: responded,
      pct: respondedPct,
      icon: <MessageSquareText size={13} />,
      color: "rgba(212,166,0,0.55)",
      bg: "rgba(212,166,0,0.07)",
    },
    {
      label: "Sem retorno +24h",
      value: noResponse,
      pct: noResponsePct,
      icon: <TrendingUp size={13} />,
      color: "rgba(239,68,68,0.65)",
      bg: "rgba(239,68,68,0.07)",
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Funil de Cobrança</h2>
          <p className={styles.subtitle}>Conversão nos últimos 30 dias</p>
        </div>
        <div className={styles.rateBadge}>
          <span className={styles.rateVal}>{rate.toFixed(1).replace(".", ",")}%</span>
          <span className={styles.rateLabel}>taxa</span>
        </div>
      </div>

      <div className={styles.funnel}>
        {steps.map((step, i) => (
          <div key={step.label} className={styles.step}>
            <div className={styles.stepTop}>
              <div className={styles.stepIcon} style={{ color: step.color, background: step.bg }}>
                {step.icon}
              </div>
              <span className={styles.stepLabel}>{step.label}</span>
              <span className={styles.stepValue} style={{ color: step.color }}>
                {step.value.toLocaleString("pt-BR")}
              </span>
            </div>
            <div className={styles.barTrack}>
              <div
                className={styles.barFill}
                style={{
                  width: `${step.pct}%`,
                  background: step.color,
                  opacity: 0.7 - i * 0.1,
                }}
              />
            </div>
            <div className={styles.stepPct} style={{ color: step.color }}>
              {step.pct}%
            </div>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <div className={styles.footerItem}>
          <span className={styles.footerLabel}>Follow-ups abertos</span>
          <span className={styles.footerVal}>{metrics.openFollowups}</span>
        </div>
        <div className={styles.footerDivider} />
        <div className={styles.footerItem}>
          <span className={styles.footerLabel}>Taxa de retorno</span>
          <span className={styles.footerVal}>
            {rate.toFixed(1).replace(".", ",")}%
          </span>
        </div>
      </div>
    </div>
  );
};

export default GraficoFunil;
