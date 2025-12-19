"use client";

import styles from "../styles/MessagePreview.module.css";

type Props = {
  message: string;
};

export default function MessagePreview({ message }: Props) {
  return (
    <div className={styles.previewContainer}>
      <span className={styles.previewText}>
        {message ||
          "Selecione um cliente e um template para visualizar a mensagem"}
      </span>
    </div>
  );
}
