"use client";

import styles from "../styles/VariablesPreview.module.css";

interface VariableItem {
  label: string;
  value: string;
}

interface VariablesPreviewProps {
  variables: VariableItem[];
}

export default function VariablesPreview({ variables }: VariablesPreviewProps) {
  return (
    <div className={styles.card}>
      <h3 className={styles.title}>Amostra de variáveis</h3>

      <div className={styles.list}>
        {variables.length > 0 ? (
          variables.map((item, index) => (
            <div key={index} className={styles.row}>
              <div className={styles.variable}>{item.label}</div>
              <div className={styles.value}>{item.value || "(vazio)"}</div>
            </div>
          ))
        ) : (
          <div className={styles.noVariables}>
            Nenhuma variável identificada no template selecionado.
          </div>
        )}
      </div>
    </div>
  );
}