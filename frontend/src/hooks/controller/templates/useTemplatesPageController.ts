import { useMemo, useState } from "react";
import type { Template } from "../../../types";

const PAGE_SIZE = 8;

type Params = {
  templates: Template[];
  deleteTemplate: (id: string) => Promise<{ success: boolean; error?: unknown }>;
};

export function useTemplatesPageController({ templates, deleteTemplate }: Params) {
  const [page, setPage] = useState(1);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [searchTemplateName, setSearchTemplateName] = useState("");
  const [categoryTemplateFilter, setCategoryTemplateFilter] = useState<string | null>(null);
  const [openDeleteModal, setOpenDeleteModal] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [openCategoryDropdown, setOpenCategoryDropdown] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(templates.map((template) => template.category))),
    [templates]
  );

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

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredTemplates.length / PAGE_SIZE)),
    [filteredTemplates.length]
  );

  const safePage = Math.min(page, totalPages);

  const paginatedTemplates = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredTemplates.slice(start, start + PAGE_SIZE);
  }, [filteredTemplates, safePage]);

  const handleSearchChange = (value: string) => {
    setSearchTemplateName(value);
    setPage(1);
  };

  const handleCategoryChange = (category: string | null) => {
    setCategoryTemplateFilter(category);
    setOpenCategoryDropdown(false);
    setPage(1);
  };

  const openDeleteConfirmation = (template: Template) => {
    setTemplateToDelete(template);
    setOpenDeleteModal(true);
  };

  const openPreview = (template: Template) => {
    setPreviewTemplate(template);
  };

  const closePreview = () => {
    setPreviewTemplate(null);
  };

  const closeDeleteConfirmation = () => {
    setOpenDeleteModal(false);
    setTemplateToDelete(null);
  };

  const confirmDelete = async () => {
    if (!templateToDelete) return;

    try {
      setLoadingDelete(true);
      const result = await deleteTemplate(templateToDelete.id);

      if (result.success) {
        closeDeleteConfirmation();
      }
    } finally {
      setLoadingDelete(false);
    }
  };

  return {
    page: safePage,
    totalPages,
    previewTemplate,
    searchTemplateName,
    categoryTemplateFilter,
    openDeleteModal,
    loadingDelete,
    openCategoryDropdown,
    templateToDelete,
    categories,
    filteredTemplates,
    paginatedTemplates,
    setPage,
    setOpenCategoryDropdown,
    handleSearchChange,
    handleCategoryChange,
    openPreview,
    closePreview,
    openDeleteConfirmation,
    closeDeleteConfirmation,
    confirmDelete,
  };
}

