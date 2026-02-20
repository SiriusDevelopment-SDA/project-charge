"use client";

import { useRef, useState } from "react";
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
  selectedCategory?: string | null;
  setSelectedCategory?: (cat: string | null) => void;
  isOptionDisabled?: (option: T) => boolean;
  children?: React.ReactNode;
  searchable?: boolean;
};

export function Dropdown<T extends { id: string; name: string; category?: string }>({
  label,
  options,
  value,
  selected,
  multiple,
  open,
  onOpen,
  onClose,
  onChange,
  className,
  children,
  typeCategory,
  searchable
}: DropdownProps<T>) {

  const [focused, setFocused] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const hasValue = multiple
    ? selected && selected.length > 0
    : Boolean(value);

  const filteredOptions = searchable 
    ? options.filter(opt => 
        opt.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : options;  

  const selectedLabel = value?.name ?? "";

  if (!open && !hasValue && focused)setTimeout(() => setFocused(false), 0);
  return (
    <div className={`${S.wrapper} ${className ?? ""}`} ref={wrapperRef}>
      <div
        className={`${S.control} ${open ? S.activeBorder : ""}`}
        onClick={() => {
          if (open) {
            onClose();
            if (!hasValue) setFocused(false);
          } else {
            onOpen();
            setFocused(true);
          }
        }}
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

        {!typeCategory && <span className={`${S.arrow} ${open ? S.rotate : ""}`}>▼</span>}
      </div>

      {children}
      {open && (
        <div
          className={S.menu}
          onClick={(e) => e.stopPropagation()}
        >
          {searchable && (
            <div className={S.searchContainer}>
              <input
                type="text"
                className={S.searchInput}
                placeholder="Pesquisar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            </div>
          )}
          {filteredOptions.length === 0 ? (
            <div className={S.noResults}>Nenhum resultado encontrado</div>
          ) : (
            filteredOptions.map(opt => (
              <div
                key={opt.id}
            className={S.option}
            onClick={(e) => {
              e.stopPropagation();

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
                setSearchTerm("");
              }
            }}
            title={"Cliente sem faturas em aberto"}
              >
                {typeCategory ? (
                  <span>{opt.category}</span>
                ) : (
                  <span>{opt.name}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
