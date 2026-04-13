import type { PaginationProps } from "../../../types";
import Style from "./Pagination.module.css";

export function Pagination({
  className,
  page,
  totalPages,
  onPrev,
  onNext,
  disablePrev,
  disableNext,
}: PaginationProps) {
  const validTotal = totalPages && totalPages > 0 ? totalPages : null;
  const progress = validTotal ? Math.round((page / validTotal) * 100) : null;

  return (
    <div className={`${className ? className : Style.pagination}`}>
      <button
        className={Style.arrow}
        onClick={onPrev}
        disabled={disablePrev}
        aria-label="Página anterior"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div className={Style.center}>
        {validTotal ? (
          <>
            <span className={Style.pageLabel}>
              <strong>{page}</strong>
              <span className={Style.separator}>/</span>
              <span className={Style.pageTotal}>{validTotal}</span>
            </span>
            <div className={Style.track}>
              <div className={Style.fill} style={{ width: `${progress}%` }} />
            </div>
          </>
        ) : (
          <span className={Style.pageLabel}>
            <strong>{page}</strong>
          </span>
        )}
      </div>

      <button
        className={Style.arrow}
        onClick={onNext}
        disabled={disableNext}
        aria-label="Próxima página"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}
