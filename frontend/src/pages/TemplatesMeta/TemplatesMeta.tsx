// React
import { useEffect, useRef, useState, useMemo } from "react";

// Components
import { Pagination } from "../../componente/global/Pagination/Pagination";
import {
  PageContainer,
  TitlePage,
  MyButton,
  InputFields,
} from "../../componente/Index";
import { TemplatesUsageCard } from "../../componente/global/Graficos/GraficoTemplates";
import { CardTemplates } from "../../componente/Card/CardTemplates";

// Hooks
import { useTemplate } from "../../hooks";
import { toast } from "react-toastify";

// Styles
import Style from "./Styles/TemplatesMeta.module.css";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import DynamicModal from "../../componente/modal/modalAlertTemplate";
import type { Template } from "../../types";

// Context
import { useContext } from "react";
import { TemplateContext } from "../../context/contextTemplates";

/* =========================
   COMPONENTE
========================= */
export default function Templates() {
  const { templates } = useTemplate();
  const { deleteTemplate } = useContext(TemplateContext);

  /* =========================
     STATES
  ========================= */
  const [page, setPage] = useState(1);
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  const [searchTemplateName, setSearchTemplateName] = useState("");
  const [categoryTemplateFilter, setCategoryTemplateFilter] =
    useState<string | null>(null);
  const [openDeleteModal, setOpenDeleteModal] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [openCategoryDropdown, setOpenCategoryDropdown] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(
    null
  );
  const [deletedTemplates, setDeletedTemplates] = useState<string[]>([]);

  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const filterIconRef = useRef<HTMLDivElement | null>(null);

  /* =========================
     CONFIG
  ========================= */
  const LIMIT = 8;

  /* =========================
     FECHAR DROPDOWN AO CLICAR FORA
  ========================= */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (
        openCategoryDropdown &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        filterIconRef.current &&
        !filterIconRef.current.contains(target)
      ) {
        setOpenCategoryDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openCategoryDropdown]);

  /* =========================
     RESET PAGE AO FILTRAR
  ========================= */
  useEffect(() => {
    setPage(1);
  }, [searchTemplateName, categoryTemplateFilter]);

  /* =========================
     CATEGORIAS
  ========================= */
  const categories = useMemo(
    () => Array.from(new Set(templates.map((t) => t.category))),
    [templates]
  );

  /* =========================
     FILTROS
  ========================= */
  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      const matchName = template.name
        .toLowerCase()
        .includes(searchTemplateName.toLowerCase());

      const matchCategory =
        !categoryTemplateFilter || template.category === categoryTemplateFilter;

      const notDeleted = !deletedTemplates.includes(template.id);

      return matchName && matchCategory && notDeleted;
    });
  }, [templates, searchTemplateName, categoryTemplateFilter, deletedTemplates]);

  /* =========================
     GARANTIR PAGE VÁLIDA
  ========================= */
  const totalPages = Math.max(1, Math.ceil(filteredTemplates.length / LIMIT));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
  }, [page, totalPages]);

  /* =========================
     PAGINAÇÃO REAL
  ========================= */
  const startIndex = (page - 1) * LIMIT;
  const paginatedTemplates = filteredTemplates.slice(
    startIndex,
    startIndex + LIMIT
  );

  /* =========================
     HANDLERS
  ========================= */
  function handleToggle(templateId: string) {
    setOpenTemplateId((prev) => (prev === templateId ? null : templateId));
  }

  /* =========================
     DADOS DO GRÁFICO
  ========================= */
  const graphData = Object.values(
    templates.reduce<Record<string, { id: number; nome: string; quantidade: number }>>(
      (acc, template, index) => {
        const category = template.category || "Outros";
        if (!acc[category]) {
          acc[category] = { id: index + 1, nome: category, quantidade: 0 };
        }
        acc[category].quantidade += 1;
        return acc;
      },
      {}
    )
  );

  const handleDelete = async (templateId: string) => {
    setLoadingDelete(true)
    const result = await deleteTemplate(templateId)

    if (result.success) {
      toast.success('Template deletado com sucesso!')
      setOpenDeleteModal(false)
      setTemplateToDelete(null)
    } else {
      toast.error('Erro ao Deletar template')
    }

    setLoadingDelete(false);
  }

  return (
    <PageContainer className={Style.TemplatesContainer}>
      {/* TOPO */}
      <div className={Style.Grafico}>
        <TitlePage title="Templates META" className={Style.TitlePage} />
        <TemplatesUsageCard data={graphData} />
      </div>

      {/* FILTROS */}
      <div className={Style.ContainerSubMenu}>
        <div className={Style.ContainerFiltro}>
          <MyButton
            text="Criar Template"
            variant="secondary"
            className={Style.BtnCriarTemplate}
          />

          <div className={Style.ContainerFiltros}>
            <InputFields
              className={Style.InputFiltro}
              placeholder="Buscar template pelo nome"
              value={searchTemplateName}
              onChange={(e) => setSearchTemplateName(e.target.value)}
            />

            <div ref={filterIconRef} className={Style.FilterWrapper}>
              <FilterAltOutlinedIcon
                className={`${Style.iconFilterDropdownTemplate} ${categoryTemplateFilter ? Style.activeFilter : ""
                  }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenCategoryDropdown((prev) => !prev);
                }}
              />

              {openCategoryDropdown && (
                <div ref={dropdownRef} className={Style.CategoryDropdown}>
                  <button
                    className={`${Style.CategoryOption} ${categoryTemplateFilter === null ? Style.activeOption : ""
                      }`}
                    onClick={() => {
                      setCategoryTemplateFilter(null);
                      setOpenCategoryDropdown(false);
                    }}
                  >
                    Todas
                  </button>

                  {categories.map((category) => (
                    <button
                      key={category}
                      className={`${Style.CategoryOption} ${categoryTemplateFilter === category
                          ? Style.activeOption
                          : ""
                        }`}
                      onClick={() => {
                        setCategoryTemplateFilter(category);
                        setOpenCategoryDropdown(false);
                      }}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CARDS */}
      <div className={Style.Cards}>
        {paginatedTemplates.map((template) => (
          <CardTemplates
            key={template.id}
            template={template}
            isOpen={openTemplateId === template.id}
            onToggle={handleToggle}
            setOpenModal={setOpenDeleteModal}
            onDelete={(tpl: Template) => {
              setTemplateToDelete(tpl);
              setOpenDeleteModal(true);
            }}
          />
        ))}
      </div>

      {/* PAGINAÇÃO */}
      <Pagination
        className={Style.Pagination}
        page={page}
        onPrev={() => setPage((p) => Math.max(p - 1, 1))}
        onNext={() => setPage((p) => Math.min(p + 1, totalPages))}
        disablePrev={page === 1}
        disableNext={page === totalPages}
      />

      {/* MODAL EXCLUSÃO */}
      {openDeleteModal && templateToDelete && (
        <DynamicModal
          open
          type="warning"
          title="Excluir template"
          description={
            <>
              Tem certeza que deseja excluir o template{" "}
              <b>{templateToDelete.name}</b>? <br />
              Essa ação não poderá ser desfeita.
            </>
          }
          onClose={() => {
            setOpenDeleteModal(false);
            setTemplateToDelete(null);
          }}
          buttons={[
            {
              label: "Cancelar",
              variant: "success",
              onClick: () => {
                setOpenDeleteModal(false);
                setTemplateToDelete(null);
              },
            },
            {
              label: loadingDelete ? "Excluindo..." : "Excluir",
              variant: "danger",
              onClick: () => {
                if (!templateToDelete) return;
                handleDelete(templateToDelete.id),

                setLoadingDelete(true);

                setTimeout(() => {
                  setDeletedTemplates((prev) =>
                    prev.includes(templateToDelete.id)
                      ? prev
                      : [...prev, templateToDelete.id]
                  );

                  toast.success("Template excluído com sucesso!");
                  setOpenDeleteModal(false);
                  setTemplateToDelete(null);
                  setLoadingDelete(false);
                }, 200);
              },
            },
          ]}
        />
      )}
    </PageContainer>
  );
}
