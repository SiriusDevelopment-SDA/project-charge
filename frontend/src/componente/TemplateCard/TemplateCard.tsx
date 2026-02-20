import { useState } from "react";
import { Play, Trash2 } from "lucide-react";
import type { TemplateBalloonCardProps } from "../../types";
import { BaseCard } from "../Index";
import styles from "./TemplateCard.module.css";

export function TemplateBalloonCard({
  title,
  message,
  category,
  onUse,
  onDelete,
  showExpand = true,
  children,   
}: TemplateBalloonCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className={styles.CardWrap}>
      <BaseCard classname={styles.TemplateCard}>
        {/* BALÃO */}
        {isOpen && (
          <div className={styles.Balloon}>
            <span className={styles.BalloonTitle}>{title}</span>
            <p className={styles.BalloonMessage}>{message}</p>
          </div>
        )}

        <div className={styles.CardInner}>
          <div className={styles.CardHeader}>
            <span className={styles.CardTitle}>{title}</span>

            <div className={styles.ContainerCatogoria}>
              <span className={styles.CardBadge}>{category}</span>

              {(onUse || onDelete) && (
                <div className={styles.CardIcons}>
                  {onUse && (
                    <button className={styles.BtnUse} onClick={onUse}>
                      <Play size={16} />
                    </button>
                  )}

                  {onDelete && (
                    <button
                      className={styles.BtnDelete}
                      onClick={onDelete}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <p className={styles.CardMessage}>{message}</p>

          {children}

         {/* 🔥 CONTROLE AQUI */}
          {showExpand && (
            <span
              className={styles.VerMais}
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen((prev) => !prev);
              }}
            >
              {isOpen ? "Fechar" : "Ver mais"}
            </span>
          )}

        </div>
      </BaseCard>
    </div>
  );
}
