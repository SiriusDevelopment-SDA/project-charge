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
  summaryOnMultiple?: boolean;
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
  ,summaryOnMultiple = false
}: DropdownProps<T>) {

  const [focused, setFocused] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showChips, setShowChips] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const hasValue = multiple
    ? selected && selected.length > 0
    : Boolean(value);


  // Remove opções já selecionadas em modo múltiplo
  let filteredOptions = options;
  if (multiple && selected && selected.length > 0) {
    filteredOptions = options.filter(opt => !selected.some(sel => sel.id === opt.id));
  }
  if (searchable) {
    filteredOptions = filteredOptions.filter(opt =>
      opt.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

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
            summaryOnMultiple && selected && selected.length > 1 ? (
              <div className={S.summaryContainer}>
                <span className={S.summary}>
                  {(() => {
                    const first = selected[0];
                    const rest = selected.length - 1;
                    if (rest > 0) {
                      return `${first.name} + ${rest} ${rest === 1 ? "cliente" : "clientes"}`;
                    }
                    return first.name;
                  })()}
                </span>
                <span
                  className={S.remove}
                  tabIndex={0}
                  role="button"
                  aria-label="Limpar seleção"
                  style={{marginLeft: 8, fontSize: 18, color: '#f1c40f', cursor: 'pointer'}} 
                  onClick={e => {
                    e.stopPropagation();
                    onChange([]);
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onChange([]);
                    }
                  }}
                >
                  ×
                </span>
              </div>
            ) : (
              <div className={S.chipsContainer}>
                {selected?.map(item => (
                  <div
                    key={item.id}
                    className={S.chip}
                    onClick={e => e.stopPropagation()}
                  >
                    {item.name}
                    <span
                      className={S.remove}
                      tabIndex={0}
                      role="button"
                      aria-label={`Remover ${item.name}`}
                      onClick={e => {
                        e.stopPropagation();
                        const newList = selected.filter(s => s.id !== item.id);
                        onChange([...newList]);
                        // Se só restar 3 ou menos, volta para chips
                        if (summaryOnMultiple && newList.length <= 3) setShowChips(false);
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          const newList = selected.filter(s => s.id !== item.id);
                          onChange([...newList]);
                          if (summaryOnMultiple && newList.length <= 3) setShowChips(false);
                        }
                      }}
                    >
                      ×
                    </span>
                  </div>
                ))}
                {!selected?.length && <span className={S.placeholder}></span>}
                {summaryOnMultiple && selected && selected.length > 3 && (
                  <span
                    className={S.summary}
                    style={{ cursor: 'pointer', marginLeft: 8, color: '#f1c40f' }}
                    title="Voltar para resumo"
                    onClick={e => { e.stopPropagation(); setShowChips(false); }}
                  >
                    (resumir)
                  </span>
                )}
              </div>
            )
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
            filteredOptions.map(opt => {
              const isChecked = multiple && selected?.some(s => s.id === opt.id);
              return (
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
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  {multiple && (
                    <input
                      type="checkbox"
                      checked={isChecked}
                      readOnly
                      style={{ pointerEvents: 'none' }}
                    />
                  )}
                  {typeCategory ? (
                    <span>{opt.category}</span>
                  ) : (
                    <span>{opt.name}</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
