import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useMemo, useContext } from "react";
import { toast } from "react-toastify";

/* =========================
   COMPONENTES
========================= */

import { Pagination } from "../../../componente/global/Pagination/Pagination";
import {
  PageContainer,
  TitlePage,
  MyButton,
  InputFields,
  CardCampanhas,
} from "../../../componente/Index.ts";

import DynamicModal from "../../../componente/modal/modalAlertTemplate.tsx";

/* =========================
   HOOKS / CONTEXT
========================= */
import { useTemplate } from "../../../hooks";
import { TemplateContext } from "../../../context/contextTemplates";

/* =========================
   TYPES / STYLES
========================= */
import type { Template } from "../../../types";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import Style from "./../Styles/Campanhas.module.css";

/* =========================
   COMPONENTE
========================= */
export default function TemplatesMeta() {
  const navigate = useNavigate();
  const { templates } = useTemplate();
  const { deleteTemplate } = useContext(TemplateContext);

  /* =========================
     STATES
  ========================= */
  const [page, setPage] = useState(1);

  const [searchTemplateName, setSearchTemplateName] = useState("");
  const [categoryTemplateFilter, setCategoryTemplateFilter] = useState<
    string | null
  >(null);
  const [openDeleteModal, setOpenDeleteModal] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [openCategoryDropdown, setOpenCategoryDropdown] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(
    null,
  );

  const LIMIT = 8;

  /* =========================
     REFS
  ========================= */
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const filterIconRef = useRef<HTMLDivElement | null>(null);

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
    [templates],
  );

  /* =========================
     FILTRO DE TEMPLATES
  ========================= */
  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      const matchName = template.name
        .toLowerCase()
        .includes(searchTemplateName.toLowerCase());

      const matchCategory =
        !categoryTemplateFilter || template.category === categoryTemplateFilter;

      return matchName && matchCategory;
    });
  }, [templates, searchTemplateName, categoryTemplateFilter]);

  /* =========================
     PAGINAÇÃO
  ========================= */
  const totalPages = Math.max(1, Math.ceil(filteredTemplates.length / LIMIT));
  const startIndex = (page - 1) * LIMIT;
  const paginatedTemplates = filteredTemplates.slice(
    startIndex,
    startIndex + LIMIT,
  );

  /* =========================
     HANDLERS
  ========================= */
  
  async function handleDelete(templateId: string) {
    try {
      setLoadingDelete(true);
      const result = await deleteTemplate(templateId);

      if (result.success) {
        toast.success("Template deletado com sucesso!");
        setOpenDeleteModal(false);
        setTemplateToDelete(null);
      } else {
        toast.error("Erro ao deletar template");
      }
    } catch {
      toast.error("Erro inesperado ao deletar template");
    } finally {
      setLoadingDelete(false);
    }
  }

  /* =========================
     RENDER
  ========================= */
  return (
    <PageContainer className={Style.TemplatesContainer}>
      {/* TOPO */}
      <div className={Style.Grafico}>
        <TitlePage title="Campanhas" className={Style.TitlePage} />
        
      

      {/* FILTROS */}
      <div className={Style.ContainerSubMenu}>
        <div className={Style.ContainerFiltro}>
          
          <MyButton
            text="Criar campanha"
            variant="secondary"
            className={Style.BtnCriarTemplate}
            onClick={() => navigate("/CreateCampanha")}
          />
          
          <MyButton
            text="Histórico"
            variant="secondary"
            className={Style.BtnCriarTemplate}
            onClick={() => navigate("/Historico")}
          />

          <div className={Style.ContainerFiltros}>
            <InputFields
              className={Style.InputFiltro}
              placeholder="Buscar template pelo nome"
              value={searchTemplateName}
              onChange={(e) => setSearchTemplateName(e.target.value)}
            />

            {/* FILTRO DE CATEGORIA */}
            <div ref={filterIconRef} className={Style.FilterWrapper}>
              <FilterAltOutlinedIcon
                className={`${Style.iconFilterDropdownTemplate} ${
                  categoryTemplateFilter ? Style.activeFilter : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenCategoryDropdown((prev) => !prev);
                }}
              />

              {openCategoryDropdown && (
                <div ref={dropdownRef} className={Style.CategoryDropdown}>
                  <button
                    className={`${Style.CategoryOption} ${
                      categoryTemplateFilter === null ? Style.activeOption : ""
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
                      className={`${Style.CategoryOption} ${
                        categoryTemplateFilter === category
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
</div>



      {/* CARDS */}
      <div className={Style.Cards}>
  {paginatedTemplates.map((template) => (
    <CardCampanhas
      key={template.id}
      campanha={template}
      onDelete={(tpl) => {
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
                handleDelete(templateToDelete.id);
              },
            },
          ]}
        />
      )}
    </PageContainer>
  );
}
