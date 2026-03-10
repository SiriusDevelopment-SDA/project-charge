import { useEffect, useMemo, useRef, useState, type UIEvent } from "react";

type DropdownOption = {
  id: string;
  name: string;
};

type Params<T extends DropdownOption> = {
  options: T[];
  searchable?: boolean;
  externalSearch?: boolean;
  multiple?: boolean;
  value?: T | null;
  selected?: T[];
  open: boolean;
};

const ITEM_HEIGHT = 36;
const MAX_HEIGHT = 150;

export function useDropdownController<T extends DropdownOption>({
  options,
  searchable,
  externalSearch,
  multiple,
  value,
  selected,
  open,
}: Params<T>) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const hasValue = multiple ? Boolean(selected?.length) : Boolean(value);

  const [searchTerm, setSearchTerm] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [openUpwards, setOpenUpwards] = useState(false);

  const filteredOptions = useMemo(() => {
    if (!searchable) return options;
    if (externalSearch) return options;

    const normalizedTerm = searchTerm.toLowerCase();

    return options.filter((option) =>
      option.name.toLowerCase().includes(normalizedTerm)
    );
  }, [options, searchable, searchTerm, externalSearch]);

  useEffect(() => {
    if (!open) return;

    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;

    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceBelow < MAX_HEIGHT + 20) {
      setOpenUpwards(true);
    } else {
      setOpenUpwards(false);
    }
  }, [open]);

  const startIndex = Math.floor(scrollTop / ITEM_HEIGHT);
  const visibleCount = Math.ceil(MAX_HEIGHT / ITEM_HEIGHT) + 2;

  const visibleOptions = filteredOptions.slice(
    startIndex,
    startIndex + visibleCount
  );

  const totalHeight = filteredOptions.length * ITEM_HEIGHT;
  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  };

  return {
    wrapperRef,
    hasValue,
    searchTerm,
    setSearchTerm,
    filteredOptions,
    visibleOptions,
    totalHeight,
    handleScroll,
    openUpwards,
    ITEM_HEIGHT,
    MAX_HEIGHT,
    startIndex,
  };
}
