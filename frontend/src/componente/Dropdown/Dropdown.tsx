"use client";

import S from "./StyleDropdown.module.css";
import { useDropdownController } from "../../hooks/components/useDropdownController";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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
  onSearchTermChange?: (term: string) => void;
  placeholder?: string;
};

export function Dropdown<
  T extends { id: string; name: string; category?: string }
>({
  label,
  placeholder,
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
  searchable,
  onSearchTermChange,
}: DropdownProps<T>) {
  const {
    wrapperRef,
    searchTerm,
    hasValue,
    setSearchTerm,
    visibleOptions,
    totalHeight,
    openUpwards,
    handleScroll,
    ITEM_HEIGHT,
    startIndex,
    MAX_HEIGHT,
  } = useDropdownController({
    options,
    searchable,
    multiple,
    value,
    selected,
    externalSearch: Boolean(onSearchTermChange),
    open,
  });

  const selectedLabel = value?.name ?? "";

  return (
    <div
      className={`${S.wrapper} ${className ?? ""}`}
      ref={wrapperRef}
      tabIndex={-1}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (!nextTarget || !wrapperRef.current?.contains(nextTarget)) {
          onClose();
        }
      }}
    >
      <div
        className={`${S.control} ${open ? S.activeBorder : ""}`}
        onClick={() => {
          if (open) {
            onClose();
            return;
          }
          onOpen();
          wrapperRef.current?.focus();
        }}
      >
        <span className={`${S.label} ${open || hasValue ? S.active : ""}`}>
          {label}
        </span>

        <div className={S.valueContainer}>
          {multiple ? (
            <div className={S.chipsContainer}>
              {selected?.map((item) => (
                <div
                  key={item.id}
                  className={S.chip}
                  onClick={(event) => event.stopPropagation()}
                >
                  {item.name}
                  <span
                    className={S.remove}
                    onClick={(event) => {
                      event.stopPropagation();
                      const nextSelected = selected.filter((current) => current.id !== item.id);
                      onChange(nextSelected);
                    }}
                  >
                    x
                  </span>
                </div>
              ))}
              {!selected?.length && <span className={S.placeholderText}>{placeholder}</span>}
              
            </div>
          ) : (
            <span className={`${S.value} ${!value ? S.placeholderText : ""}`}>
              {value ? selectedLabel : placeholder}
            </span>
          )}
        </div>

        {!typeCategory && <span className={`${S.arrow} ${open ? S.rotate : ""}`}><ExpandMoreIcon /></span>}
      </div>

      {children}
      {open && (
        <div
          className={`${S.menu} ${openUpwards ? S.menuUp : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => event.stopPropagation()}
          style={{ maxHeight: MAX_HEIGHT }}
          onScroll={handleScroll}
        >
          {searchable && (
            <div className={S.searchContainer}>
              <input
                type="text"
                className={S.searchInput}
                placeholder="Pesquisar..."
                value={searchTerm}
                onChange={(event) => {
                  const term = event.target.value;
                  setSearchTerm(term);
                  onSearchTermChange?.(term);
                }}
                onClick={(event) => event.stopPropagation()}
                autoFocus
              />
            </div>
          )}
          {visibleOptions.length === 0 ? (
            <div className={S.noResults}>Nenhum resultado encontrado</div>
          ) : (
            <div className={S.virtualContainer} style={{ height: totalHeight }}>
              <div
                className={S.virtualInner}
                style={{ transform: `translateY(${startIndex * ITEM_HEIGHT}px)` }}
              >
                {visibleOptions.map((option) => (
                  <div
                    key={option.id}
                    className={S.option}
                    onClick={(event) => {
                      event.stopPropagation();

                      if (multiple) {
                        const exists = selected?.some((current) => current.id === option.id);
                        const nextSelected = exists
                          ? (selected ?? []).filter((current) => current.id !== option.id)
                          : [...(selected ?? []), option];

                        onChange(nextSelected);
                        return;
                      }

                      onChange(option);
                      onClose();
                      setSearchTerm("");
                    }}
                    title={"Cliente sem faturas em aberto"}
                  >
                    {typeCategory ? <span>{option.category}</span> : <span>{option.name}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
