import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import { toast } from "react-toastify";
import { Pagination } from "../../componente/global/Pagination/Pagination";
import {
  PageContainer,
  TitlePage,
  MyButton,
  InputFields,
} from "../../componente/Index";
import { TemplatesUsageCard } from "../../componente/global/Graficos/GraficoTemplates";
import { CardTemplates } from "../../componente/Card/CardTemplates";
import DynamicModal from "../../componente/modal/modalAlertTemplate";
import { useTemplate } from "../../hooks";
import { useTemplatesPageController } from "../../hooks/controller/templates/useTemplatesPageController";
import Style from "./Styles/TemplatesMeta.module.css";

export default function TemplatesMeta() {
  const navigate = useNavigate();
  const location = useLocation();
  const { templates, deleteTemplate } = useTemplate();

  const {
    page,
    totalPages,
    openTemplateId,
    searchTemplateName,
    categoryTemplateFilter,
    openDeleteModal,
    loadingDelete,
    openCategoryDropdown,
    templateToDelete,
    categories,
    paginatedTemplates,
    setPage,
    setOpenCategoryDropdown,
    handleToggle,
    handleSearchChange,
    handleCategoryChange,
    openDeleteConfirmation,
    closeDeleteConfirmation,
    confirmDelete,
  } = useTemplatesPageController({ templates, deleteTemplate });

  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const filterIconRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <PageContainer className={Style.TemplatesContainer}>
      <div className={Style.Grafico}>
        <TitlePage title="Templates META" subtitle="Gerencie modelos oficiais para disparos e campanhas" className={Style.TitlePage} />
        <TemplatesUsageCard data={graphData} />
      </div>

      <div className={Style.ContainerSubMenu}>
        <div className={Style.ContainerFiltro}>
          <MyButton
            text="Criar Template"
            variant="secondary"
            className={Style.BtnCriarTemplate}
            onClick={() => navigate(`/CreateTemplate${location.search}`)}
          />

          <div className={Style.ContainerFiltros}>
            <InputFields
              className={Style.InputFiltro}
              placeholder="Buscar template pelo nome"
              value={searchTemplateName}
              onChange={(e) => handleSearchChange(e.target.value)}
            />

            <div
              ref={filterIconRef}
              className={Style.FilterWrapper}
              tabIndex={0}
              onBlur={(event) => {
                const next = event.relatedTarget as Node | null;
                if (!next || !filterIconRef.current?.contains(next)) {
                  setOpenCategoryDropdown(false);
                }
              }}
            >
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
                    onClick={() => handleCategoryChange(null)}
                  >
                    Todas
                  </button>

                  {categories.map((category) => (
                    <button
                      key={category}
                      className={`${Style.CategoryOption} ${
                        categoryTemplateFilter === category ? Style.activeOption : ""
                      }`}
                      onClick={() => handleCategoryChange(category)}
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

      <div className={Style.Cards}>
        {paginatedTemplates.map((template) => (
          <CardTemplates
            key={template.id}
            template={template}
            isOpen={openTemplateId === template.id}
            onToggle={handleToggle}
            onDelete={openDeleteConfirmation}
            onUse={() => toast.info("Ação de usar template (implementar)")}
          />
        ))}
      </div>

      {openDeleteModal && templateToDelete && (
        <DynamicModal
          open
          type="warning"
          title="Excluir template"
          description={
            <>
              Tem certeza que deseja excluir o template <b>{templateToDelete.name}</b>?
              <br />
              Essa ação não poderá ser desfeita.
            </>
          }
          onClose={closeDeleteConfirmation}
          buttons={[
            {
              label: "Cancelar",
              variant: "success",
              onClick: closeDeleteConfirmation,
            },
            {
              label: loadingDelete ? "Excluindo..." : "Excluir",
              variant: "danger",
              onClick: confirmDelete,
            },
          ]}
        />
      )}

      <Pagination
        className={Style.Pagination}
        page={page}
        onPrev={() => setPage((prev) => Math.max(prev - 1, 1))}
        onNext={() => setPage((prev) => Math.min(prev + 1, totalPages))}
        disablePrev={page === 1}
        disableNext={page === totalPages}
      />
    </PageContainer>
  );
}




