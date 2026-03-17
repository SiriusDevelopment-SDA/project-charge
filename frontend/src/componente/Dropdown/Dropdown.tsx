"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import S from "./StyleDropdown.module.css";
import { useDropdownController } from "../../hooks/components/useDropdownController";

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
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchTermChange?: (term: string) => void;
  placeholder?: string;
  summaryOnMultiple?: boolean;
  filterOptions?: string[];
  filterValue?: string | null;
  onFilterChange?: (value: string | null) => void;
  filterAllLabel?: string;
  filterButtonLabel?: string;
  getFilterValue?: (option: T) => string | null | undefined;
};

export function Dropdown<
  T extends { id: string; name: string; category?: string },
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
  typeCategory,
  searchable = true,
  searchValue,
  searchPlaceholder = "Pesquisar...",
  onSearchTermChange,
  isOptionDisabled,
  summaryOnMultiple = false,
  filterOptions,
  filterValue = null,
  onFilterChange,
  filterAllLabel = "Todas",
  filterButtonLabel = "Filtrar opcoes",
  getFilterValue,
}: DropdownProps<T>) {
  const controlRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionsScrollerRef = useRef<HTMLDivElement>(null);

  const [internalSearchTerm, setInternalSearchTerm] = useState(searchValue ?? "");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const listboxId = useId();
  const filterMenuId = useId();
  const hasFilters = Boolean(filterOptions?.length && onFilterChange);
  const effectiveSearchTerm = searchValue ?? internalSearchTerm;
  const isFilterMenuVisible = open && filterMenuOpen;

  const {
    wrapperRef,
    hasValue,
    filteredOptions,
    visibleOptions,
    totalHeight,
    openUpwards,
    handleScroll,
    resetScrollPosition,
    ITEM_HEIGHT,
    MAX_LIST_HEIGHT,
    startIndex,
  } = useDropdownController({
    options,
    searchable,
    multiple,
    value,
    selected,
    externalSearch: Boolean(onSearchTermChange),
    searchTerm: effectiveSearchTerm,
    filterValue,
    getFilterValue,
    open,
    hasMenuHeader: searchable || hasFilters,
  });

  const selectedLabel = value?.name ?? "";
  const shouldShowSummary = Boolean(
    multiple && summaryOnMultiple && selected && selected.length > 1,
  );
  const summaryText = shouldShowSummary
    ? `${selected![0].name} + ${selected!.length - 1} ${
        selected!.length - 1 === 1 ? "cliente" : "clientes"
      }`
    : "";

  const selectedOptionIds = useMemo(() => {
    const ids = new Set<string>();

    if (value?.id) {
      ids.add(value.id);
    }

    selected?.forEach((item) => ids.add(item.id));

    return ids;
  }, [selected, value]);

  const getInitialHighlightedIndex = () => {
    const currentSelectedIndex = filteredOptions.findIndex((option) =>
      selectedOptionIds.has(option.id),
    );

    return currentSelectedIndex >= 0
      ? currentSelectedIndex
      : filteredOptions.length > 0
        ? 0
        : -1;
  };

  const resolvedHighlightedIndex =
    !open
      ? -1
      : highlightedIndex >= 0 && highlightedIndex < filteredOptions.length
        ? highlightedIndex
        : getInitialHighlightedIndex();

  useEffect(() => {
    if (!open || !searchable) return;

    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDownOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || wrapperRef.current?.contains(target)) return;
      setFilterMenuOpen(false);
      onClose();
    };

    const handleFocusOutside = (event: FocusEvent) => {
      const target = event.target as Node | null;
      if (!target || wrapperRef.current?.contains(target)) return;
      setFilterMenuOpen(false);
      onClose();
    };

    document.addEventListener("mousedown", handlePointerDownOutside);
    document.addEventListener("focusin", handleFocusOutside);

    return () => {
      document.removeEventListener("mousedown", handlePointerDownOutside);
      document.removeEventListener("focusin", handleFocusOutside);
    };
  }, [onClose, open, wrapperRef]);

  useEffect(() => {
    if (
      !open ||
      resolvedHighlightedIndex < 0 ||
      !optionsScrollerRef.current
    ) {
      return;
    }

    const container = optionsScrollerRef.current;
    const itemTop = resolvedHighlightedIndex * ITEM_HEIGHT;
    const itemBottom = itemTop + ITEM_HEIGHT;
    const viewportTop = container.scrollTop;
    const viewportBottom = viewportTop + container.clientHeight;

    if (itemTop < viewportTop) {
      container.scrollTop = itemTop;
    } else if (itemBottom > viewportBottom) {
      container.scrollTop = itemBottom - container.clientHeight;
    }
  }, [ITEM_HEIGHT, open, resolvedHighlightedIndex]);

  useEffect(() => {
    if (!open || !optionsScrollerRef.current) return;
    optionsScrollerRef.current.scrollTop = 0;
  }, [effectiveSearchTerm, filterValue, open]);

  const updateSearchTerm = (term: string) => {
    resetScrollPosition();
    if (searchValue === undefined) {
      setInternalSearchTerm(term);
    }
    setHighlightedIndex(0);
    onSearchTermChange?.(term);
  };

  const clearSearchTerm = () => {
    updateSearchTerm("");
  };

  const closeMenu = () => {
    setFilterMenuOpen(false);
    setHighlightedIndex(-1);
    onClose();
  };

  const openMenu = () => {
    resetScrollPosition();
    setFilterMenuOpen(false);
    setHighlightedIndex(getInitialHighlightedIndex());
    onOpen();
  };

  const handleSelectOption = (option: T) => {
    const disabled = isOptionDisabled?.(option) ?? false;
    if (disabled) return;
    setFilterMenuOpen(false);

    if (multiple) {
      const exists = selected?.some((current) => current.id === option.id);
      const nextSelected = exists
        ? (selected ?? []).filter((current) => current.id !== option.id)
        : [...(selected ?? []), option];

      onChange(nextSelected);
      return;
    }

    onChange(option);
    clearSearchTerm();
    closeMenu();
    controlRef.current?.focus();
  };

  const moveHighlight = (direction: 1 | -1) => {
    if (!filteredOptions.length) return;

    setFilterMenuOpen(false);
    setHighlightedIndex((previous) => {
      if (previous < 0) {
        return direction === 1 ? 0 : filteredOptions.length - 1;
      }

      return Math.min(
        filteredOptions.length - 1,
        Math.max(0, previous + direction),
      );
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const isTypingField =
      target.tagName === "INPUT" || target.tagName === "TEXTAREA";
    const isActionButton = target.tagName === "BUTTON";

    if (
      isActionButton &&
      (event.key === "Enter" || event.key === " " || event.key === "Spacebar")
    ) {
      return;
    }

    if (!open) {
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Enter" ||
        (!isTypingField && event.key === " ")
      ) {
        event.preventDefault();
        openMenu();
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveHighlight(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        moveHighlight(-1);
        return;
      case "Home":
        if (!filteredOptions.length) return;
        event.preventDefault();
        setHighlightedIndex(0);
        return;
      case "End":
        if (!filteredOptions.length) return;
        event.preventDefault();
        setHighlightedIndex(filteredOptions.length - 1);
        return;
      case "Escape":
        event.preventDefault();
        if (filterMenuOpen) {
          setFilterMenuOpen(false);
          return;
        }
        closeMenu();
        controlRef.current?.focus();
        return;
      case "Enter":
        if (
          resolvedHighlightedIndex < 0 ||
          !filteredOptions[resolvedHighlightedIndex]
        ) {
          return;
        }
        event.preventDefault();
        handleSelectOption(filteredOptions[resolvedHighlightedIndex]);
        return;
      case " ":
        if (isTypingField) return;
        if (
          resolvedHighlightedIndex < 0 ||
          !filteredOptions[resolvedHighlightedIndex]
        ) {
          return;
        }
        event.preventDefault();
        handleSelectOption(filteredOptions[resolvedHighlightedIndex]);
        return;
      default:
        if (
          open &&
          searchable &&
          !isTypingField &&
          event.key.length === 1 &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey
        ) {
          searchInputRef.current?.focus();
        }
    }
  };

  const getOptionLabel = (option: T) =>
    typeCategory ? option.category ?? option.name : option.name;

  return (
    <div
      className={`${S.wrapper} ${className ?? ""}`}
      ref={wrapperRef}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={controlRef}
        className={`${S.control} ${open ? S.activeBorder : ""}`}
        role="combobox"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-label={label}
        aria-autocomplete={searchable ? "list" : undefined}
        aria-activedescendant={
          open &&
          resolvedHighlightedIndex >= 0 &&
          filteredOptions[resolvedHighlightedIndex]
            ? `${listboxId}-${filteredOptions[resolvedHighlightedIndex].id}`
            : undefined
        }
        onClick={() => {
          if (open) {
            closeMenu();
            return;
          }

          openMenu();
        }}
      >
        <span className={`${S.label} ${open || hasValue ? S.active : ""}`}>
          {label}
        </span>

        <div className={S.valueContainer}>
          {multiple ? (
            shouldShowSummary ? (
              <div className={S.summaryContainer}>
                <span className={S.summary}>{summaryText}</span>
                <button
                  type="button"
                  className={S.removeButton}
                  aria-label={`Limpar selecao de ${label.toLowerCase()}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange([] as T[]);
                  }}
                >
                  x
                </button>
              </div>
            ) : (
              <div className={S.chipsContainer}>
                {selected?.map((item) => (
                  <div
                    key={item.id}
                    className={S.chip}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span className={S.chipLabel}>{item.name}</span>
                    <button
                      type="button"
                      className={S.removeButton}
                      aria-label={`Remover ${item.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        const nextSelected = (selected ?? []).filter(
                          (current) => current.id !== item.id,
                        );
                        onChange(nextSelected);
                      }}
                    >
                      x
                    </button>
                  </div>
                ))}
                {!selected?.length && (
                  <span className={S.value}>{placeholder ?? ""}</span>
                )}
              </div>
            )
          ) : (
            <span className={S.value}>{value ? selectedLabel : placeholder ?? ""}</span>
          )}
        </div>

        {!typeCategory && (
          <span className={`${S.arrow} ${open ? S.rotate : ""}`} aria-hidden="true">
            <ExpandMoreIcon />
          </span>
        )}
      </div>

      {open && (
        <div className={`${S.menu} ${openUpwards ? S.menuUp : ""}`}>
          {(searchable || hasFilters) && (
            <div className={S.menuHeader}>
              {searchable && (
                <input
                  ref={searchInputRef}
                  type="text"
                  className={S.searchInput}
                  placeholder={searchPlaceholder}
                  aria-label={`Pesquisar em ${label.toLowerCase()}`}
                  value={effectiveSearchTerm}
                  onChange={(event) => updateSearchTerm(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                />
              )}

              {hasFilters && (
                <div className={S.filterWrapper}>
                  <button
                    type="button"
                    className={`${S.filterButton} ${
                      filterValue ? S.filterButtonActive : ""
                    }`}
                    aria-label={filterButtonLabel}
                    aria-haspopup="menu"
                    aria-expanded={isFilterMenuVisible}
                    aria-controls={filterMenuId}
                    onClick={(event) => {
                      event.stopPropagation();
                      setFilterMenuOpen((previous) => !previous);
                    }}
                  >
                    <FilterAltOutlinedIcon fontSize="small" />
                  </button>

                  {isFilterMenuVisible && (
                    <div
                      id={filterMenuId}
                      className={S.filterMenu}
                      role="menu"
                      aria-label={filterButtonLabel}
                    >
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={filterValue === null}
                        className={`${S.filterMenuItem} ${
                          filterValue === null ? S.filterMenuItemActive : ""
                        }`}
                        onClick={() => {
                          resetScrollPosition();
                          setHighlightedIndex(0);
                          onFilterChange?.(null);
                          setFilterMenuOpen(false);
                        }}
                      >
                        {filterAllLabel}
                      </button>

                      {filterOptions?.map((filterOption) => (
                        <button
                          key={filterOption}
                          type="button"
                          role="menuitemradio"
                          aria-checked={filterValue === filterOption}
                          className={`${S.filterMenuItem} ${
                            filterValue === filterOption
                              ? S.filterMenuItemActive
                              : ""
                          }`}
                          onClick={() => {
                            resetScrollPosition();
                            setHighlightedIndex(0);
                            onFilterChange?.(filterOption);
                            setFilterMenuOpen(false);
                          }}
                        >
                          {filterOption}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div
            ref={optionsScrollerRef}
            className={S.optionsScroller}
            style={{ maxHeight: MAX_LIST_HEIGHT }}
            onScroll={handleScroll}
            id={listboxId}
            role="listbox"
            aria-label={label}
            aria-multiselectable={multiple || undefined}
          >
            {filteredOptions.length === 0 ? (
              <div className={S.noResults}>Nenhum resultado encontrado</div>
            ) : (
              <div className={S.virtualContainer} style={{ height: totalHeight }}>
                <div
                  className={S.virtualInner}
                  style={{ transform: `translateY(${startIndex * ITEM_HEIGHT}px)` }}
                >
                  {visibleOptions.map((option, index) => {
                    const absoluteIndex = startIndex + index;
                    const disabled = isOptionDisabled?.(option) ?? false;
                    const isSelected = selectedOptionIds.has(option.id);
                    const isHighlighted =
                      absoluteIndex === resolvedHighlightedIndex;

                    return (
                      <div
                        key={option.id}
                        id={`${listboxId}-${option.id}`}
                        role="option"
                        aria-disabled={disabled || undefined}
                        aria-selected={isSelected}
                        className={`${S.option} ${
                          disabled ? S.disabled : ""
                        } ${isSelected ? S.optionSelected : ""} ${
                          isHighlighted ? S.optionHighlighted : ""
                        }`}
                        onMouseEnter={() => setHighlightedIndex(absoluteIndex)}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSelectOption(option);
                        }}
                        title={disabled ? "Opcao indisponivel" : undefined}
                      >
                        <span className={S.optionLabel}>{getOptionLabel(option)}</span>
                        {isSelected && (
                          <CheckRoundedIcon
                            className={S.optionCheck}
                            fontSize="small"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
