"use client";

import { useEffect, useState } from "react";
import S from "./StyleDropdown.module.css";

export type DropdownProps<T> = {
  label: string;
  typeCategory?: boolean;
  options: T[];
  value?: T | null;
  selected?: T[];
  multiple?: boolean;
  onChange: (value: T | T[]) => void;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  className?: string;
  enableCategoryFilter?: boolean;
  selectedCategory?: string | null;
  setSelectedCategory?: (cat: string | null) => void;
  isOptionDisabled?: (option: T) => boolean;
};

export function Dropdown<
  T extends { id: string; name: string; category: string }
>({
  label,
  options,
  value,
  selected,
  multiple = false,
  open,
  typeCategory,
  onOpen,
  onClose,
  onChange,
  className,
  enableCategoryFilter = false,
  selectedCategory,
  setSelectedCategory,
  isOptionDisabled
}: DropdownProps<T>) {

  const [focused, setFocused] = useState(false);

  const hasValue = multiple ? selected && selected.length > 0 : Boolean(value);
  const selectedLabel = value?.name ?? "";

  const categories = Array.from(new Set(options.map(o => o.category)));

  const displayOptions = enableCategoryFilter && selectedCategory
    ? options.filter(o => o.category === selectedCategory)
    : options;

  // === CLOSE GLOBAL AJUSTADO ===
  useEffect(() => {
    function closeAll() {
      onClose();
      if (!hasValue) {
        setFocused(false);
      }
    }
    window.addEventListener("closeAllDropdowns", closeAll);
    return () => window.removeEventListener("closeAllDropdowns", closeAll);
  }, [onClose, hasValue]);

  // === FIX DO LABEL (ACTIVE RESET) ===
  useEffect(() => {
    if (!open && !hasValue) {
      setFocused(false);
    }
  }, [open, hasValue]);

  const handleToggle = () => {
    if (open) {
      onClose();
      if (!hasValue) {
        setFocused(false);
      }
    } else {
      window.dispatchEvent(new Event("closeAllDropdowns"));
      onOpen();
      setFocused(true);
    }
  };

  return (
    <div className={`${S.wrapper} ${className ?? ""}`}>
      <div
        className={`${S.control} ${open ? S.activeBorder : ""}`}
        onClick={handleToggle}
      >
        <span className={`${S.label} ${focused || hasValue ? S.active : ""}`}>
          {label}
        </span>

        <div className={S.valueContainer}>
          {multiple ? (
            <div className={S.chipsContainer}>
              {selected?.map(item => (
                <div
                  key={item.id}
                  className={S.chip}
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.name}
                  <span
                    className={S.remove}
                    onClick={(e) => {
                      e.stopPropagation();
                      const newList = selected.filter(s => s.id !== item.id);
                      onChange(newList);
                    }}
                  >
                    ×
                  </span>
                </div>
              ))}
              {!selected?.length && <span className={S.placeholder}></span>}
            </div>
          ) : (
            <span className={S.value}>{selectedLabel}</span>
          )}
        </div>
        {/* FILTRO DE CATEGORIA INTERNO */}
        {open && enableCategoryFilter && selectedCategory !== undefined && setSelectedCategory && (
          <div className={S.categoryFilter} onClick={(e) => e.stopPropagation()}>
            <select
              className={S.categorySelect}
              value={selectedCategory ?? ""}
              onChange={(e) => setSelectedCategory(e.target.value || null)}
              onClick={(e) => e.stopPropagation()} // <-- evita fechar ao clicar no SELECT
            >
              <option value="">Todas as categorias</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        )}


        <span className={`${S.arrow} ${open ? S.rotate : ""}`}>▼</span>
      </div>

      {open && (
        <div
          className={S.menu}
          onClick={(e) => e.stopPropagation()}
        >



          {/* OPÇÕES */}
          {displayOptions.map(opt => (
            <div
              key={opt.id}
          className={`${S.option} ${disabled ? S.disabled : ""}`}
          onClick={(e) => {
            e.stopPropagation();

            if (disabled) return;

            if (multiple) {
              const exists = selected?.some(s => s.id === opt.id);
              const newList = exists
                ? (selected ?? []).filter(s => s.id !== opt.id)
                : [...(selected ?? []), opt];

              onChange(newList);
            } else {
              onChange(opt);
              onClose();
              setFocused(false);
            }
          }}
          title={disabled ? "Cliente sem faturas em aberto" : undefined}
            >
              {typeCategory ? opt.category : opt.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
