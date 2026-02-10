import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./styleModal.module.css";

export type ModalType = "success" | "warning" | "error" | "info" | "modaltemplates";

export type ModalButton = {
  label: string;
  variant?: "success" | "danger" | "primary" | "BtnOpcoes";
  onClick: () => void;
};

export type DynamicModalProps = {
  open: boolean;
  type: ModalType;
  title: string;
  description?: string | ReactNode;
  buttons: ModalButton[];
  onClose: () => void;
};

export default function DynamicModal({
  open,
  type,
  title,
  description,
  buttons,
  onClose,
}: DynamicModalProps) {
  if (!open) return null;

  return createPortal(
    <div className={styles.modalOverlay}>
      <div
        className={styles.modalBackdrop}
        onClick={onClose}
      />

      <div
        className={`${styles.modalContainer} ${styles[`modal-${type}`]}`}
        onClick={(e) => e.stopPropagation()}
      >
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

        <div className={styles.modalActions}>
          {buttons.map((btn, index) => (
            <button
              key={index}
              className={`${styles.btn} ${
                styles[`btn-${btn.variant || "primary"}`]
              }`}
              onClick={btn.onClick}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body 
  );
}
