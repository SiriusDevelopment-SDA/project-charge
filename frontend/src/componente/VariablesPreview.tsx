"use client";

import styles from "../styles/VariablesPreview.module.css";

interface VariableItem {
  label: string;
  value: string;
}

const variables: VariableItem[] = [
  { label: "{{1}}", value: "Cartão de crédito CS Mutual" },
  { label: "{{2}}", value: "US$ 12,34" },
  { label: "{{3}}", value: "1 de janeiro de 2024" },
  { label: "{{4}}", value: "Cartão de crédito CS Mutual" },
];

export default function VariablesPreview() {
  return (
    <div className={styles.card}>
      <h3 className={styles.title}>Amostra de variáveis</h3>

      <div className={styles.list}>
        {variables.map((item, index) => (
          <div key={index} className={styles.row}>
            <div className={styles.variable}>{item.label}</div>
            <div className={styles.value}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
