import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import { toast } from "react-toastify";
import type { Template } from "../../types";
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
import { buildNormalizedSearch } from "../../utils/locationSearch";
import { getTemplateStatusLabel, isTemplateApproved } from "../../utils/templateStatus";
import Style from "./Styles/TemplatesMeta.module.css";

function normalizeTemplateComponents(components: Template["components"]) {
  if (Array.isArray(components)) {
    return components as Array<Record<string, unknown>>;
  }

  if (typeof components === "string") {
    try {
      return normalizeTemplateComponents(JSON.parse(components) as Template["components"]);
    } catch {
      return [];
    }
  }

  if (
    components &&
    typeof components === "object" &&
    Array.isArray((components as { components?: unknown }).components)
  ) {
    return (components as { components: Array<Record<string, unknown>> }).components;
  }

  return [];
}

function extractTemplatePreviewSections(template: Template) {
  const components = normalizeTemplateComponents(template.components);

  const header = components.find(
    (component) => String(component?.type ?? "").toUpperCase() === "HEADER",
  );
  const body = components.find(
    (component) => String(component?.type ?? "").toUpperCase() === "BODY",
  );
  const footer = components.find(
    (component) => String(component?.type ?? "").toUpperCase() === "FOOTER",
  );

  return {
    header: String(header?.text ?? "").trim(),
    body: String(body?.text ?? template.message ?? "").trim(),
    footer: String(footer?.text ?? "").trim(),
  };
}

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

  const previewSections = previewTemplate
    ? extractTemplatePreviewSections(previewTemplate)
    : null;
  const normalizedSearch = buildNormalizedSearch(location.search);

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
              onClick={() => navigate(`/CreateTemplate${normalizedSearch}`)}
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
              if (!isTemplateApproved(selectedTemplate.meta_status)) {
                toast.warning(
                  `O template ${selectedTemplate.name} ainda nao pode ser usado. Status atual: ${getTemplateStatusLabel(selectedTemplate.meta_status)}.`,
                );
                return;
              }

              dispatch.setSelectedTemplate(selectedTemplate);
              toast.success(`Template ${selectedTemplate.name} selecionado para disparo.`);
              navigate(normalizedSearch ? `/${normalizedSearch}` : "/");
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
          containerClassName={Style.previewModalContainer}
          customContent={
            <div className={Style.templateModalContent}>
              <h4>TEMPLATE COMPLETO</h4>
              <div className={Style.templateModalBody}>
                <div className={Style.templatePreviewFrame}>
                  {previewSections?.header && (
                    <div className={Style.templatePreviewHeader}>
                      {renderTemplateMessage(previewSections.header)}
                    </div>
                  )}

                  <div className={Style.templatePreviewMain}>
                    {renderTemplateMessage(previewSections?.body ?? previewTemplate.message)}
                  </div>

                  {previewSections?.footer && (
                    <div className={Style.templatePreviewFooter}>
                      {renderTemplateMessage(previewSections.footer)}
                    </div>
                  )}
                </div>
              </div>
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
        totalPages={totalPages}
        onPrev={() => setPage((prev) => Math.max(prev - 1, 1))}
        onNext={() => setPage((prev) => Math.min(prev + 1, totalPages))}
        disablePrev={page === 1}
        disableNext={page === totalPages}
      />
    </PageContainer>
  );
}



