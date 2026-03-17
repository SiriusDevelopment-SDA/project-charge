import styles from './GraficoCampanhas.module.css';
import { useDashboardCampaignsStats } from '../../hooks/controller/dashboard/useDashboardCampaignsStats';

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
  <div className={styles.progressBar}>
    <div className={styles.progressFill} style={{ width: `${progress}%` }} />
  </div>
);

const GraficoCampanhas: React.FC = () => {
  const { campaigns } = useDashboardCampaignsStats();

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>
        Envio de campanhas
      </h2>

      <div className={styles.tableHeader}>
        <div>#</div>
        <div>Campanha</div>
        <div>Uso</div>
        <div>Resposta</div>
      </div>

      <div className={styles.campaignList}>
        {campaigns.map((item) => (
          <div key={item.id} className={styles.campaignItem}>
            <div className={styles.campaignId}>
              {item.id}
            </div>

            <div className={styles.campaignName}>
              {item.name}
            </div>

            <div className={styles.progressContainer}>
              <ProgressBar progress={item.usage} />
            </div>

            <div className={styles.responseContainer}>
              <div className={styles.responseBadge}>
                {item.response}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GraficoCampanhas;
