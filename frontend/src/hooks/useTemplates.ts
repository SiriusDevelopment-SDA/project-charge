import { useMemo, useState } from "react";
import { useTemplatesQuery } from "./queries/useTemplatesQuery";
import { useDeleteTemplateMutation } from "./mutations/useTemplateMutations";
import type { ITemplatesContext } from "../types";
import type { TemplateTypeFilter } from "../types/templateApiTypes";
import { templateRequiresInvoiceData } from "../utils/templateRequirements";

export function useTemplate(): ITemplatesContext {
  const [searchTemplateName, setSearchTemplateName] = useState("");
  const [categoryTemplateFilter, setCategoryTemplateFilter] = useState<string | null>(null);
  const [templateTypeFilter, setTemplateTypeFilter] = useState<TemplateTypeFilter>(null);
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
        const requiresInvoice = templateRequiresInvoiceData(template);
        const matchType =
          !templateTypeFilter ||
          (templateTypeFilter === 'cobranca' ? requiresInvoice : !requiresInvoice);
        return matchName && matchCategory && matchType;
      }),
    [templates, searchTemplateName, categoryTemplateFilter, templateTypeFilter],
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
    templateTypeFilter,
    setTemplateTypeFilter,
    searchTemplateName,
    setSearchTemplateName,
    setQuery,
    setPage,
    setLimit,
    setOrder,
    page,
    limit,
    deleteTemplate,
  };
}
