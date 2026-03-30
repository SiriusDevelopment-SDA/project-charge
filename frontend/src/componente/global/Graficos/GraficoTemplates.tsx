// TemplatesUsageCard.tsx
"use client";

import styles from "./GraficoTemplates.module.css";

type TemplateUsage = {
  id: number | string;
  nome: string;
  quantidade: number;
  percentual?: number;
};

type Props = {
  title?: string;
  data: TemplateUsage[];
  loading?: boolean;
  error?: boolean;
};

export function TemplatesUsageCard({
  title = "Templates mais usados",
  data,
  loading = false,
  error = false,
}: Props) {
  const maxValue = data.length > 0 ? Math.max(...data.map((item) => item.quantidade), 0) : 0;

  if (loading && data.length === 0) {
    return (
      <div className={styles.card}>
        <h3 className={styles.title}>{title}</h3>
        <div className={styles.emptyState}>Carregando uso dos templates...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.card}>
        <h3 className={styles.title}>{title}</h3>
        <div className={styles.emptyState}>Nao foi possivel carregar o uso dos templates.</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={styles.card}>
        <h3 className={styles.title}>{title}</h3>
        <div className={styles.emptyState}>Nenhum template com uso registrado ainda.</div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h3 className={styles.title}>{title}</h3>

      <div className={styles.table}>
        <div className={`${styles.row} ${styles.header}`}>
          <span>#</span>
          <span>Template</span>
          <span>Qunatidade de uso</span>
        </div>

        {data.map((item, index) => {
          const percent =
            typeof item.percentual === "number"
              ? item.percentual
              : maxValue > 0
                ? (item.quantidade / maxValue) * 100
                : 0;
          const percentLabel = `${percent.toLocaleString("pt-BR", {
            minimumFractionDigits: percent % 1 === 0 ? 0 : 1,
            maximumFractionDigits: 1,
          })}%`;
          const usageLabel = `${item.quantidade} uso${item.quantidade === 1 ? "" : "s"}`;

          return (
            <div key={item.id} className={styles.row}>
              <span className={styles.index}>
                {String(index + 1).padStart(2, "0")}
              </span>

              <span className={styles.name}>{item.nome}</span>

              <span className={styles.usageCell}>
                <span className={styles.barWrapper}>
                  <span
                    className={styles.bar}
                    style={{ width: `${percent}%` }}
                  />
                </span>
                <span className={styles.usageMeta}>
                  <span className={styles.usageCount}>{usageLabel}</span>
                  <strong className={styles.usagePercent}>{percentLabel}</strong>
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
