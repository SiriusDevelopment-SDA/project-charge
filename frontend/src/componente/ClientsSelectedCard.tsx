"use client";

import styles from "../styles/ClientsSelectedCard.module.css";
import { Users } from "lucide-react";

interface ClientsSelectedCardProps {
  total: number;
}

export default function ClientsSelectedCard({
  total,
}: ClientsSelectedCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.iconWrapper}>
        <Users size={22} />
      </div>

      <div className={styles.content}>
        <span className={styles.label}>Clientes selecionados</span>
        <span className={styles.value}>{total}</span>
      </div>
    </div>
  );
}
