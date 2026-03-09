import { useMemo, useState } from "react";
import { useTemplate } from "../useTemplates";

export function useFilterTemplates() {
  const ITEMS_PER_PAGE = 8;
  const { templates } = useTemplate();
  const [modalPage, setModalPage] = useState(1);

  const totalModalPages = Math.max(
    1,
    Math.ceil(templates.length / ITEMS_PER_PAGE)
  );

  const paginatedTemplates = useMemo(() => {
    return templates.slice(
      (modalPage - 1) * ITEMS_PER_PAGE,
      modalPage * ITEMS_PER_PAGE
    );
  }, [templates, modalPage]);

  return {
    totalModalPages,
    paginatedTemplates,
    modalPage,
    setModalPage,
    itemsPerPage: ITEMS_PER_PAGE,
  };
}
