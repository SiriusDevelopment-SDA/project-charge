import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Api } from "../../../services/api";
import type {
  ITemplatesContext,
  Template,
  TemplateSearchResponse,
} from "../../../types";
import { getErrorMessage } from "../../../utils/error";

export function useTemplatesController(): ITemplatesContext {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [searchTemplateName, setSearchTemplateName] = useState("");
  const [categoryTemplateFilter, setCategoryTemplateFilter] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(50);
  const [order, setOrder] = useState<"DESC" | "ASC">("DESC");
  const [query, setQuery] = useState<string>("");

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const account = new URLSearchParams(window.location.search).get("account");

        const response = await Api.post<TemplateSearchResponse>("/templates/search", {
          account,
          query,
          page,
          limit,
          sortorder: order,
        });

        const activeTemplates = response.data.data.filter((item) => item.isEnabled);
        setTemplates((prev) => {
          const map = new Map<string, Template>();
          [...prev, ...activeTemplates].forEach((item) => {
            map.set(item.id, item);
          });
          return Array.from(map.values());
        });
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Erro ao buscar templates."));
      }
    };

    void fetchTemplates();
  }, [query, page, limit, order]);

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
    [templates, searchTemplateName, categoryTemplateFilter]
  );

  const categories = useMemo(
    () => [...new Set(templates.map((template) => template.category))],
    [templates]
  );

  const deleteTemplate = async (id: string) => {
    try {
      await Api.post("/templates/delete", { templateId: id });
      setTemplates((prev) => prev.filter((template) => template.id !== id));
      return { success: true };
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao deletar template."));
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
