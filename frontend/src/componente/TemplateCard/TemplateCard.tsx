import styles from "./TemplateCard.module.css";
import { Play, Trash2 } from "lucide-react";

export type TemplateBalloonCardProps = {
  title: string;
  message: string;
  category: string;
  onUse?: () => void;
  onDelete?: () => void;
};

export function TemplateBalloonCard({
  title,
  message,
  category,
  onUse,
  onDelete,
}: TemplateBalloonCardProps) {
  return (
    <div className={styles.wrapper}>
      {/* BALÃO (hover) */}
      <div className={styles.balloon}>
        <span className={styles.balloonTitle}>{title}</span>
        <p className={styles.balloonMessage}>{message}</p>
      </div>

      {/* CARD BASE */}
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          <span className={styles.badge}>{category}</span>

          <div className={styles.actions}>
            <Play size={16} onClick={onUse} />
            <Trash2 size={16} onClick={onDelete} />
          </div>
        </div>

        <p className={styles.message}>{message}</p>

        <span className={styles.more}>Ver mais</span>
      </div>
    </div>
  );
}
