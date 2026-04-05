import { useMemo } from "react";
import styles from "./GraficoCampanhas.module.css";
import { useDashboardCampaignsStats } from "../../hooks/controller/dashboard/useDashboardCampaignsStats";
import { Megaphone } from "lucide-react";

const GraficoCampanhas: React.FC = () => {
  const { campaigns } = useDashboardCampaignsStats();

  const sorted = useMemo(
    () => [...campaigns].sort((a, b) => b.response - a.response),
    [campaigns]
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Campanhas</h2>
          <p className={styles.subtitle}>Performance de envio e engajamento</p>
        </div>
        <div className={styles.headerBadge}>
          <Megaphone size={13} />
          <span>{campaigns.length} ativas</span>
        </div>
      </div>

      <div className={styles.tableHead}>
        <span className={styles.colName}>Campanha</span>
        <span className={styles.colUsage}>Uso</span>
        <span className={styles.colResponse}>Resposta</span>
      </div>

      <div className={styles.list}>
        {sorted.length === 0 && (
          <div className={styles.empty}>Nenhuma campanha encontrada</div>
        )}
        {sorted.map((item, index) => (
          <div key={item.id} className={styles.row} style={{ animationDelay: `${index * 60}ms` }}>
            <div className={styles.rowIndex}>{index + 1}</div>

            <div className={styles.rowName}>
              <span className={styles.campaignName}>{item.name}</span>
              <div className={styles.usageBarWrap}>
                <div className={styles.usageBar} style={{ width: `${item.usage}%` }} />
              </div>
              <span className={styles.usagePct}>{item.usage}%</span>
            </div>

            <div className={styles.responseBadge}>
              <span className={styles.responseVal}>{item.response}%</span>
              <div className={styles.responseDot} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GraficoCampanhas;
