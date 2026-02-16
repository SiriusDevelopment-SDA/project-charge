import styles from './GraficoCampanhas.module.css';

/**
 * Interface para os dados de cada campanha.
 */
interface Campaign {
  id: string;
  name: string;
  usage: number; // Porcentagem de uso (0-100)
  response: number; // Porcentagem de resposta (0-100)
}

/**
 * Dados simulados baseados na imagem fornecida.
 */
const campaigns: Campaign[] = [
  { id: '01', name: 'Campanha 01', usage: 75, response: 45 },
  { id: '02', name: 'Campanha 02', usage: 65, response: 17 },
  { id: '03', name: 'Campanha 03', usage: 55, response: 19 },
  { id: '04', name: 'Campanha 04', usage: 35, response: 13 },
];

/**
 * Componente de Barra de Progresso Customizada com efeito Glow
 */
const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
  <div className={styles.progressBar}>
    <div className={styles.progressFill} style={{ width: `${progress}%` }} />
  </div>
);

/**
 * Componente de Lista de Envio de Campanhas
 * Reproduz o design de dashboard premium com tema escuro e detalhes dourados.
 */
const GraficoCampanhas: React.FC = () => {
  return (
    <div className={styles.container}>
      {/* Título da Seção */}
      <h2 className={styles.title}>
        Envio de campanhas
      </h2>

      {/* Cabeçalho da Tabela */}
      <div className={styles.tableHeader}>
        <div>#</div>
        <div>Campanha</div>
        <div>Uso</div>
        <div>Resposta</div>
      </div>

      {/* Lista de Campanhas */}
      <div className={styles.campaignList}>
        {campaigns.map((item) => (
          <div key={item.id} className={styles.campaignItem}>
            {/* Número de Ordem */}
            <div className={styles.campaignId}>
              {item.id}
            </div>

            {/* Nome da Campanha */}
            <div className={styles.campaignName}>
              {item.name}
            </div>

            {/* Barra de Progresso (Uso) */}
            <div className={styles.progressContainer}>
              <ProgressBar progress={item.usage} />
            </div>

            {/* Indicador de Resposta (Badge) */}
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
