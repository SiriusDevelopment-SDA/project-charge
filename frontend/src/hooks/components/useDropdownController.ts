import { useEffect, useMemo, useRef, useState, type UIEvent } from "react";

type DropdownOption = {
  id: string;
  name: string;
  category?: string;
};

type Params<T extends DropdownOption> = {
  options: T[];
  searchable: boolean;
  externalSearch: boolean;
  searchTerm: string;
  filterValue?: string | null;
  getFilterValue?: (option: T) => string | null | undefined;
  multiple?: boolean;
  value?: T | null;
  selected?: T[];
  open: boolean;
  hasMenuHeader: boolean;
};

const ITEM_HEIGHT = 46;
const MAX_LIST_HEIGHT = 248;
const MENU_PADDING = 18;
const MENU_HEADER_HEIGHT = 78;

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function useDropdownController<T extends DropdownOption>({
  options,
  searchable,
  externalSearch,
  searchTerm,
  filterValue,
  getFilterValue,
  multiple,
  value,
  selected,
  open,
  hasMenuHeader,
}: Params<T>) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const hasValue = multiple ? Boolean(selected?.length) : Boolean(value);

  const [scrollTop, setScrollTop] = useState(0);
  const [openUpwards, setOpenUpwards] = useState(false);

  const filteredOptions = useMemo(() => {
    const normalizedTerm = normalizeText(searchTerm.trim());

    return options.filter((option) => {
      const optionFilterValue =
        getFilterValue?.(option) ?? option.category ?? null;
      const matchesFilter = !filterValue || optionFilterValue === filterValue;

      if (!matchesFilter) {
        return false;
      }

      if (!searchable || externalSearch || !normalizedTerm) {
        return true;
      }

      return normalizeText(option.name).includes(normalizedTerm);
    });
  }, [
    externalSearch,
    filterValue,
    getFilterValue,
    options,
    searchable,
    searchTerm,
  ]);

  useEffect(() => {
    if (!open) return;

    const updateMenuDirection = () => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;

      const optionsHeight = Math.min(
        filteredOptions.length * ITEM_HEIGHT,
        MAX_LIST_HEIGHT,
      );
      const estimatedMenuHeight =
        optionsHeight +
        (hasMenuHeader ? MENU_HEADER_HEIGHT : 0) +
        MENU_PADDING;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      setOpenUpwards(
        spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow,
      );
    };

    updateMenuDirection();

    window.addEventListener("resize", updateMenuDirection);
    window.addEventListener("scroll", updateMenuDirection, true);

    return () => {
      window.removeEventListener("resize", updateMenuDirection);
      window.removeEventListener("scroll", updateMenuDirection, true);
    };
  }, [filteredOptions.length, hasMenuHeader, open]);

  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT));
  const visibleCount = Math.ceil(MAX_LIST_HEIGHT / ITEM_HEIGHT) + 2;
  const visibleOptions = filteredOptions.slice(
    startIndex,
    startIndex + visibleCount,
  );

  const totalHeight = filteredOptions.length * ITEM_HEIGHT;

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  };

  const resetScrollPosition = () => {
    setScrollTop(0);
  };

  return {
    wrapperRef,
    hasValue,
    filteredOptions,
    visibleOptions,
    totalHeight,
    handleScroll,
    resetScrollPosition,
    openUpwards,
    ITEM_HEIGHT,
    MAX_LIST_HEIGHT,
    startIndex,
  };
}
