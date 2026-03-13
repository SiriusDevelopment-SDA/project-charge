import { useMemo, useState } from "react";
import { MyButton } from "../global/MyButton/MyButton";
import styles from "./DispatchPreviewContent.module.css";

export type DispatchPreviewDetail = {
  label: string;
  value: string;
};

type DispatchPreviewContentProps = {
  eyebrow: string;
  headline: string;
  summary: string;
  audienceLabel: string;
  audienceCount: number | string;
  templateName: string;
  message: string;
  details?: DispatchPreviewDetail[];
  note?: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function DispatchPreviewContent({
  eyebrow,
  headline,
  summary,
  audienceLabel,
  audienceCount,
  templateName,
  message,
  details,
  note,
  confirmLabel,
  cancelLabel = "Cancelar",
  confirmDisabled = false,
  onCancel,
  onConfirm,
}: DispatchPreviewContentProps) {
  const [isMessageExpanded, setIsMessageExpanded] = useState(false);
  const shouldCollapseMessage = useMemo(
    () => message.trim().length > 220 || message.includes("\n"),
    [message],
  );

  return (
    <div className={styles.preview}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <strong>{headline}</strong>
          <p>{summary}</p>
        </div>

        <div className={styles.heroAudience}>
          <span>{audienceLabel}</span>
          <strong>{audienceCount.toString.length < 10 ? `0${audienceCount}` : audienceCount}</strong>
        </div>
      </section>

      <section className={styles.templateCard}>
        <div className={styles.templateHeader}>
          <div>
            <span className={styles.sectionLabel}>Template selecionado</span>
            <strong>{templateName}</strong>
          </div>
        </div>

        <div className={styles.messageBox}>
          <span className={styles.sectionLabel}>Mensagem</span>
          <p
            className={
              shouldCollapseMessage && !isMessageExpanded
                ? styles.messageCollapsed
                : styles.messageExpanded
            }
          >
            {message}
          </p>
          {shouldCollapseMessage && (
            <button
              type="button"
              className={styles.messageToggle}
              onClick={() => setIsMessageExpanded((previous) => !previous)}
            >
              {isMessageExpanded ? "Mostrar menos" : "Ler mensagem completa"}
            </button>
          )}
        </div>
      </section>

      {details && (
       <section className={styles.detailsGrid}>
          {details.map((detail) => (
            <article key={`${detail.label}-${detail.value}`} className={styles.detailCard}>
              <span>{detail.label}</span>
              <strong>{detail.value}</strong>
            </article>
          ))}
      </section>
      )}

      {note && <p className={styles.note}>{note}</p>}

      <div className={styles.actions}>
        <MyButton text={cancelLabel} variant="secondary" onClick={onCancel} />
        <MyButton
          text={confirmLabel}
          variant="btn-enviar"
          disabled={confirmDisabled}
          onClick={() => {
            void onConfirm();
          }}
        />
      </div>
    </div>
  );
}
