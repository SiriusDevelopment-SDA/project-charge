import { forwardRef } from "react";
import styles from "./StyleSuperAdminCompanyButton.module.css";

export type SuperAdminCompanyButtonProps = {
  companyName: string | null;
  onClick: () => void;
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
  { companyName, onClick, disabled = false },
  ref,
) {
  const trimmed = companyName?.trim() ?? "";
  const label = trimmed ? truncate(trimmed, MAX_LABEL_CHARS) : "Trocar empresa";

  return (
    <button
      ref={ref}
      type="button"
      className={styles.button}
      onClick={onClick}
      disabled={disabled}
      title="Trocar empresa"
      aria-label="Trocar empresa"
    >
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
        <path d="M2 22h20" />
        <path d="M10 6h.01M14 6h.01M10 10h.01M14 10h.01M10 14h.01M14 14h.01M10 18h.01M14 18h.01" />
      </svg>
      <span className={styles.label}>{label}</span>
    </button>
  );
});

export default SuperAdminCompanyButton;
