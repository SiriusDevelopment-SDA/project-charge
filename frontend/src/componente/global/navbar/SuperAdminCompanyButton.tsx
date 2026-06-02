import { forwardRef } from "react";
import { formatCompanyName } from "../../../utils/formatCompanyName";
import styles from "./StyleSuperAdminCompanyButton.module.css";

export type SuperAdminCompanyButtonProps = {
  companyName: string | null;
  onClick: () => void;
  isOpen: boolean;
  disabled?: boolean;
};

const MAX_LABEL_CHARS = 24;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

const SuperAdminCompanyButton = forwardRef<
  HTMLButtonElement,
  SuperAdminCompanyButtonProps
>(function SuperAdminCompanyButton(
  { companyName, onClick, isOpen, disabled = false },
  ref,
) {
  const trimmed = companyName?.trim() ?? "";
  const formatted = trimmed ? formatCompanyName(trimmed) : "";
  const label = formatted ? truncate(formatted, MAX_LABEL_CHARS) : "Trocar empresa";

  return (
    <button
      ref={ref}
      type="button"
      className={styles.button}
      onClick={onClick}
      disabled={disabled}
      title="Trocar empresa"
      aria-label="Trocar empresa"
      aria-haspopup="menu"
      aria-expanded={isOpen}
    >
      <span className={styles.label}>{label}</span>
      <svg
        className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
});

export default SuperAdminCompanyButton;
