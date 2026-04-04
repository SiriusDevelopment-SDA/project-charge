import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./styleModal.module.css";

export type ModalType = "success" | "warning" | "error" | "info" | "modaltemplates" | "custom";

export type ModalButton = {
  label: string;
  variant?: "success" | "danger" | "primary" | "BtnOpcoes";
  onClick: () => void;
  disabled?: boolean;
};

export type DynamicModalProps = {
  open: boolean;
  type: ModalType;
  size?: "default" | "wide";
  title: string;
  description?: string | ReactNode;
  buttons?: ModalButton[];
  onClose: () => void;
  customContent?: ReactNode;
  containerClassName?: string;
};

export default function DynamicModal({
  open,
  type,
  size = "default",
  title,
  description,
  buttons,
  onClose,
  customContent,
  containerClassName = "",
}: DynamicModalProps) {
  if (!open) return null;

  return createPortal(
    <div className={styles.modalOverlay}>
      <div
        className={styles.modalBackdrop}
        onClick={onClose}
      />

      <div
        className={`${styles.modalContainer} ${styles[`modal-${type}`]} ${styles[`modal-${size}`]} ${containerClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {customContent ? (
          <>
            <h2 className={styles.modalTitle}>{title}</h2>
            <div className={styles.modalCustomContent}>
              {customContent}
            </div>
            {buttons && buttons.length > 0 && (
              <div className={styles.modalActions}>
                {buttons.map((btn, index) => (
                  <button
                    key={index}
                    className={`${styles.btn} ${
                      styles[`btn-${btn.variant || "primary"}`]
                    }`}
                    onClick={btn.onClick}
                    disabled={btn.disabled}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className={`${styles.modalIcon} ${styles[`icon-${type}`]}`}>
              {type === "success" && "✓"}
              {type === "warning" && "!"}
              {type === "error" && "✕"}
              {type === "info" && "i"}
              {type === "modaltemplates" && ""}
            </div>

            <h2 className={styles.modalTitle}>{title}</h2>

            {description && (
              <div className={styles.modalDescription}>
                {description}
              </div>
            )}

            {buttons && buttons.length > 0 && (
              <div className={styles.modalActions}>
                {buttons.map((btn, index) => (
                  <button
                    key={index}
                    className={`${styles.btn} ${
                      styles[`btn-${btn.variant || "primary"}`]
                    }`}
                    onClick={btn.onClick}
                    disabled={btn.disabled}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body 
  );
}
