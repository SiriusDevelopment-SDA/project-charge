import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RefObject } from "react";
import type { CompanyListItem } from "../../../types/companyApiTypes";
import styles from "./StyleDropdownSwitchCompany.module.css";

export type DropdownSwitchCompanyProps = {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  companies: CompanyListItem[];
  activeCompanyId: string | null;
  onSelect: (id: string) => void;
  isLoading?: boolean;
  isSwitching?: boolean;
  switchingCompanyId?: string | null;
};

type Position = {
  top: number;
  right: number;
};

const VIEWPORT_OFFSET = 8;
const ANCHOR_GAP = 4;

function CheckIcon() {
  return (
    <svg
      className={styles.checkIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function Spinner({ label }: { label?: string }) {
  return (
    <span
      className={styles.spinner}
      role={label ? "status" : undefined}
      aria-label={label}
    />
  );
}

export default function DropdownSwitchCompany({
  isOpen,
  onClose,
  anchorRef,
  companies,
  activeCompanyId,
  onSelect,
  isLoading = false,
  isSwitching = false,
  switchingCompanyId = null,
}: DropdownSwitchCompanyProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);

  // Calcula posicao em relacao ao anchor.
  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    const computePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const right = Math.max(VIEWPORT_OFFSET, viewportWidth - rect.right);
      const top = rect.bottom + ANCHOR_GAP;
      setPosition({ top, right });
    };

    computePosition();
    window.addEventListener("resize", computePosition);
    window.addEventListener("scroll", computePosition, true);
    return () => {
      window.removeEventListener("resize", computePosition);
      window.removeEventListener("scroll", computePosition, true);
    };
  }, [isOpen, anchorRef]);

  // Outside click + Esc.
  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      const dropdownEl = dropdownRef.current;
      const anchorEl = anchorRef.current;
      if (!target) return;
      if (dropdownEl && dropdownEl.contains(target)) return;
      if (anchorEl && anchorEl.contains(target)) return;
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  const style = position
    ? { top: `${position.top}px`, right: `${position.right}px` }
    : { top: "-9999px", right: "-9999px" };

  return createPortal(
    <div
      ref={dropdownRef}
      role="menu"
      aria-label="Trocar empresa"
      className={styles.dropdown}
      style={style}
    >
      <p className={styles.header}>Alterar conta</p>

      {isLoading && (
        <div className={styles.state} role="status" aria-live="polite">
          <Spinner />
          <span>Carregando empresas...</span>
        </div>
      )}

      {!isLoading && companies.length === 0 && (
        <div className={styles.state}>Nenhuma empresa disponivel.</div>
      )}

      {!isLoading && companies.length > 0 && (
        <ul className={styles.list}>
          {companies.map((company) => {
            const isActive = company.id === activeCompanyId;
            const isItemSwitching =
              isSwitching && switchingCompanyId === company.id;
            return (
              <li key={company.id} className={styles.item} role="none">
                <button
                  type="button"
                  role="menuitem"
                  aria-checked={isActive}
                  className={styles.itemButton}
                  onClick={() => onSelect(company.id)}
                  disabled={isSwitching}
                >
                  <span className={styles.itemInfo}>
                    <b className={styles.itemName}>{company.name}</b>
                  </span>
                  <span className={styles.itemStatus}>
                    {isItemSwitching && <Spinner label="Trocando empresa" />}
                    {!isItemSwitching && isActive && <CheckIcon />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>,
    document.body
  );
}
