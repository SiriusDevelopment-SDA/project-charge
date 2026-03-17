import { useMemo, useState } from "react";
import { useTemplatesQuery } from "./queries/useTemplatesQuery";
import { useDeleteTemplateMutation } from "./mutations/useTemplateMutations";
import type { ITemplatesContext } from "../types";

export function useTemplate(): ITemplatesContext {
  const [searchTemplateName, setSearchTemplateName] = useState("");
  const [categoryTemplateFilter, setCategoryTemplateFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [order, setOrder] = useState<"DESC" | "ASC">("DESC");
  const [query, setQuery] = useState("");

  const { data: templates = [] } = useTemplatesQuery({ query, page, limit, order });
  const deleteMutation = useDeleteTemplateMutation();

  const filteredTemplates = useMemo(
    () =>
      templates.filter((template) => {
        const matchName = template.name
          .toLowerCase()
          .includes(searchTemplateName.toLowerCase());
        const matchCategory =
          !categoryTemplateFilter || template.category === categoryTemplateFilter;
        return matchName && matchCategory;
      }),
    [templates, searchTemplateName, categoryTemplateFilter],
  );

  const categories = useMemo(
    () => [...new Set(templates.map((t) => t.category))],
    [templates],
  );

  const deleteTemplate = async (id: string): Promise<{ success: boolean; error?: unknown }> => {
    try {
      await deleteMutation.mutateAsync(id);
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  };

  return {
    templates,
    categories,
    filteredTemplates,
    categoryTemplateFilter,
    setCategoryTemplateFilter,
    searchTemplateName,
    setSearchTemplateName,
    setQuery,
    setPage,
    setLimit,
    setOrder,
    page,
    deleteTemplate,
  };
}
