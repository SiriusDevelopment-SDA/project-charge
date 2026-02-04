import type { PaginationProps } from "../../../types";
import Style from "./Pagination.module.css";

export function Pagination({
  className,
  page,
  onPrev,
  onNext,
  disablePrev,
  disableNext,
}: PaginationProps) {
  return (
    <div className={`${className ? className : Style.pagination} `}>
      <button
        className={Style.button}
        onClick={onPrev}
        disabled={disablePrev}
      >
        ◀ Anterior
      </button>

      <span className={Style.page}>Página {page}</span>

      <button
        className={Style.button}
        onClick={onNext}
        disabled={disableNext}
      >
        Próxima ▶
      </button>
    </div>
  );
}