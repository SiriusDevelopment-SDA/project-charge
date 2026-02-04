// TemplatesUsageCard.tsx
"use client";

import styles from "./GraficoTemplates.module.css";

type TemplateUsage = {
  id: number;
  nome: string;
  quantidade: number;
};

type Props = {
  title?: string;
  data: TemplateUsage[];
};

export function TemplatesUsageCard({
  title = "Templates mais usados",
  data
}: Props) {
  const maxValue = Math.max(...data.map(item => item.quantidade));

  return (
    <div className={styles.card}>
      <h3 className={styles.title}>{title}</h3>

      <div className={styles.table}>
        <div className={`${styles.row} ${styles.header}`}>
          <span>#</span>
          <span>Campanha</span>
          <span>Qtd de uso</span>
        </div>

        {data.map((item, index) => {
          const percent = (item.quantidade / maxValue) * 100;

          return (
            <div key={item.id} className={styles.row}>
              <span className={styles.index}>
                {String(index + 1).padStart(2, "0")}
              </span>

              <span className={styles.name}>{item.nome}</span>

              <span className={styles.barWrapper}>
                <span
                  className={styles.bar}
                  style={{ width: `${percent}%` }}
                />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
