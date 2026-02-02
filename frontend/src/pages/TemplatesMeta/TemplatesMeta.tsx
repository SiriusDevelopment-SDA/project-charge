// React
import { useEffect, useRef, useState } from "react";
import { Pagination } from "../../componente/global/Pagination/Pagination";
import {
  PageContainer,
  TitlePage,
  MyButton,
  BaseCard,
  InputFields,
} from "../../componente/Index";
import { useTemplate } from "../../hooks";

// Styles
import Style from "./Styles/TemplatesMeta.module.css";
import { Play, Trash2 } from "lucide-react";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import { TemplatesUsageCard } from "../../componente/global/Graficos/GraficoTemplates";
import DynamicModal from "../../componente/modal/modalAlertTemplate";
import { toast } from "react-toastify";

/* =========================
   COMPONENTE
========================= */
export default function Templates() {
  const { templates, setPage, setLimit, page } = useTemplate();

  /* =========================
     STATES
  ========================= */
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  const [searchTemplateName, setSearchTemplateName] = useState("");
  const [categoryTemplateFilter, setCategoryTemplateFilter] = useState<string | null>(null);
  const [openCategoryDropdown, setOpenCategoryDropdown] = useState(false);

  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const filterIconRef = useRef<HTMLDivElement | null>(null);

  /* =========================
     LIMIT POR PÁGINA
  ========================= */
  useEffect(() => {
    setLimit(8);
  }, [setLimit]);

  /* =========================
     RESET PAGINA AO FILTRAR
  ========================= */
  useEffect(() => {
    setPage(1);
  }, [searchTemplateName, categoryTemplateFilter, setPage]);

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
     HANDLERS
  ========================= */
  function handleToggle(templateId: string) {
    setOpenTemplateId((prev) => (prev === templateId ? null : templateId));
  }

  /* =========================
     CATEGORIAS ÚNICAS
  ========================= */
  const categories = Array.from(
    new Set(templates.map((template) => template.category))
  );

  /* =========================
     FILTROS (NOME + CATEGORIA)
  ========================= */
  const filteredTemplates = templates.filter((template) => {
    const matchName = template.name
      .toLowerCase()
      .includes(searchTemplateName.toLowerCase());

    const matchCategory =
      !categoryTemplateFilter ||
      template.category === categoryTemplateFilter;

    return matchName && matchCategory;
  });

  /* =========================
     DADOS DO GRÁFICO
  ========================= */
  const data = [
    { id: 1, nome: "Aviso de cobrança", quantidade: 120 },
    { id: 2, nome: "Cobrança", quantidade: 95 },
    { id: 3, nome: "Comercial", quantidade: 80 },
    { id: 4, nome: "Outros", quantidade: 60 },
  ];
  /* =========================
     MODAL
  ========================= */
  const [templateToDelete, setTemplateToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  return (
    <PageContainer className={Style.TemplatesContainer}>
      {/* =========================
         TOPO / GRÁFICO
      ========================= */}
      <div className={Style.Grafico}>
        <TitlePage title="Templates META" className={Style.TitlePage} />
        <TemplatesUsageCard data={data} />
      </div>

      {/* =========================
         SUBMENU / FILTROS
      ========================= */}
      <div className={Style.ContainerSubMenu}>
        <div className={Style.ContainerFiltro}>
          <MyButton
            text="Criar Template"
            variant="secondary"
            className={Style.BtnCriarTemplate}
          />

          <div className={Style.ContainerFiltros}>
            {/* BUSCA POR NOME */}
            <InputFields
              className={Style.InputFiltro}
              placeholder="Buscar template pelo nome"
              value={searchTemplateName}
              onChange={(e) => setSearchTemplateName(e.target.value)}
            />

            {/* FILTRO POR CATEGORIA */}
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
                    className={`${Style.CategoryOption} ${categoryTemplateFilter === null
                      ? Style.activeOption
                      : ""
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

      {/* =========================
         CARDS
      ========================= */}
      <div className={Style.Cards}>
        {filteredTemplates.map((template) => {
          const isOpen = openTemplateId === template.id;

          return (
            <div key={template.id} className={Style.CardWrap}>
              <BaseCard classname={Style.TemplateCard}>
                {isOpen && (
                  <div className={Style.Balloon}>
                    <span className={Style.BalloonTitle}>
                      {template.name}
                    </span>
                    <p className={Style.BalloonMessage}>
                      {template.message}
                    </p>
                  </div>
                )}

                <div className={Style.CardInner}>
                  <div className={Style.CardHeader}>
                    <span className={Style.CardTitle}>
                      {template.name}
                    </span>

                    <div className={Style.ContainerCatogoria}>
                      <span className={Style.CardBadge}>
                        {template.category}
                      </span>

                      <div className={Style.CardIcons}>
                        <button className={Style.BtnUse}>
                          <Play size={16} />
                        </button>
                        <button
                          className={Style.BtnDelete}
                          onClick={() =>
                            setTemplateToDelete({
                              id: template.id,
                              name: template.name,
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>

                      </div>
                    </div>
                  </div>

                  <p className={Style.CardMessage}>
                    {template.message}
                  </p>

                  <span
                    className={Style.VerMais}
                    onClick={() => handleToggle(template.id)}
                  >
                    {isOpen ? "Fechar" : "Ver mais"}
                  </span>
                </div>
              </BaseCard>
            </div>
          );
        })}
      </div>

      {/* MODAL*/}
      {templateToDelete && (
        <DynamicModal
          open={true}
          type="warning"
          title="Excluir template"
          description={
            <>
              Tem certeza que deseja excluir o template{" "}
              <b>{templateToDelete.name}</b>? <br />
              Essa ação não poderá ser desfeita.
            </>
          }
          onClose={() => setTemplateToDelete(null)}
          buttons={[
            {
              label: "Cancelar",
              variant: "success",
              onClick: () => setTemplateToDelete(null),
            },
            {
              label: "Excluir",
              variant: "danger",
              onClick: async () => {
                try {
                  // await deleteTemplate(templateToDelete.id);

                  toast.success("Template excluído com sucesso!");

                  setTemplateToDelete(null);
                } catch {
                  toast.error("Não foi possível excluir o template.");
                }
              },
            },
          ]}
        />
      )}



      {/* =========================
         PAGINAÇÃO
      ========================= */}
      <Pagination
        className={Style.Pagination}
        page={page}
        onPrev={() => setPage((p) => Math.max(p - 1, 1))}
        onNext={() => setPage((p) => p + 1)}
        disablePrev={page === 1}
        disableNext={filteredTemplates.length < 4}
      />
    </PageContainer>
  );
}
