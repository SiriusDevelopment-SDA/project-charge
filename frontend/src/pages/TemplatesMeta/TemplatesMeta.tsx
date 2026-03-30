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
import { useDispatchTemplate, useTemplate } from "../../hooks";
import { useTemplateUsageQuery } from "../../hooks/queries/useTemplatesQuery";
import { useTemplatesPageController } from "../../hooks/controller/templates/useTemplatesPageController";
import Style from "./Styles/TemplatesMeta.module.css";

export default function TemplatesMeta() {
  const navigate = useNavigate();
  const location = useLocation();
  const { templates, deleteTemplate } = useTemplate();
  const dispatch = useDispatchTemplate();
  const {
    data: templateUsage = [],
    isLoading: isTemplateUsageLoading,
    isError: isTemplateUsageError,
  } = useTemplateUsageQuery();

  const renderTemplateMessage = (message: string) => {
    const parts = message.split(/(\{\{\d+\}\})/g);
    return parts.map((part, index) => {
      if (/^\{\{\d+\}\}$/.test(part)) {
        return (
          <span key={`${part}-${index}`} className={Style.templateVar}>
            {part}
          </span>
        );
      }

      return <span key={`text-${index}`}>{part}</span>;
    });
  };

  const {
    page,
    totalPages,
    previewTemplate,
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
    handleSearchChange,
    handleCategoryChange,
    openPreview,
    closePreview,
    openDeleteConfirmation,
    closeDeleteConfirmation,
    confirmDelete,
  } = useTemplatesPageController({ templates, deleteTemplate });

  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const filterIconRef = useRef<HTMLDivElement | null>(null);

  const graphData = templateUsage.slice(0, 3).map((item) => ({
    id: item.templateId,
    nome: item.templateName,
    quantidade: item.totalUsage,
    percentual: item.usagePercentage,
  }));

  return (
    <PageContainer className={Style.TemplatesContainer}>
      <div className={Style.Grafico}>
        <TitlePage title="Templates META" subtitle="Gerencie modelos oficiais para disparos e campanhas" className={Style.TitlePage} />
        <TemplatesUsageCard
          data={graphData}
          loading={isTemplateUsageLoading}
          error={isTemplateUsageError}
        />
      </div>

      <div className={Style.ContainerSubMenu}>
          <div className={Style.ContainerFiltros}>
            <MyButton
              text="Criar Template"
              variant="secondary"
              className={Style.BtnCriarTemplate}
              onClick={() => navigate(`/CreateTemplate${location.search}`)}
             />
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

      <div className={Style.Cards}>
        {paginatedTemplates.map((template) => (
          <CardTemplates
            key={template.id}
            template={template}
            onPreview={openPreview}
            onDelete={openDeleteConfirmation}
            onUse={(selectedTemplate) => {
              dispatch.setSelectedTemplate(selectedTemplate);
              toast.success(`Template ${selectedTemplate.name} selecionado para disparo.`);
              navigate(location.search ? `/${location.search}` : "/");
            }}
          />
        ))}
      </div>

      {previewTemplate && (
        <DynamicModal
          open
          type="custom"
          title={previewTemplate.name}
          onClose={closePreview}
          customContent={
            <div className={Style.templateModalContent}>
              <h4>TEMPLATE COMPLETO</h4>
              <p>{renderTemplateMessage(previewTemplate.message)}</p>
              <button
                type="button"
                className={Style.templateModalClose}
                onClick={closePreview}
              >
                Fechar
              </button>
            </div>
          }
        />
      )}

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




