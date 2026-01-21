import { useState } from "react";
import Style from "../EfetuarDisparo/Styles/EfetuarDisparo.module.css";
import { PageContainer, BaseCard, Metricas, TitlePage, Dropdown, PreviewBox, UploadButton, DownloadModeloButton, InputFields } from "../../componente/Index";
import type { Cliente, Template } from "../../types";
import { useClient, useTemplate } from "../../hooks";
import { compilarTemplate } from "../../utils/validation";

export default function EfetuarDisparo() {
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<"template" | "clientes" | null>(null);
  const [modoPage, setModoPage] = useState<"clientes" | "leads">("clientes");

  const { templates } = useTemplate();
  const { clients, selectedClientes, setSelectedClientes, fetchInvoices } = useClient();

  let mensagens;
  if (selectedTemplate) {
    const preencher = compilarTemplate(selectedTemplate.message, selectedTemplate.variables);
    mensagens = selectedClientes.map(c => preencher(c));
  }

  if (selectedTemplate?.category === "Cobrança") {
    async function teste() {
      for (const cliente of clients) {
        await fetchInvoices(cliente);
      }
    }
    teste();
  }

  const filteredTemplates = selectedCategory
    ? templates.filter(t => t.category === selectedCategory)
    : templates;

  return (
    <PageContainer className={Style.EfeturarDisparoContainer}>
      <TitlePage
        title={modoPage === "clientes" ? "Disparo clientes ativos" : "Disparo para leads"}
        className={Style.navTitlePage}
        setModoPage={setModoPage}
        text={modoPage === "clientes" ? "Disparo para leads" : "Disparo clientes ativos"}
      />

      <div
        className={Style.containerCenter}
        onClick={() => setOpenDropdown(null)}
      >
        <div className={Style.containerCenterTop}>
          <div className={Style.containerInput} onClick={(e) => e.stopPropagation()}>

            {/* === DROPDOWN TEMPLATE COM CATEGORIA INTERNA === */}
            <Dropdown<Template>
              label="Buscar template"
              options={filteredTemplates}
              value={selectedTemplate}
              onChange={(v) => setSelectedTemplate(v as Template)}
              open={openDropdown === "template"}
              onOpen={() => setOpenDropdown("template")}
              onClose={() => setOpenDropdown(null)}
              enableCategoryFilter
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
            />

            {modoPage === "clientes" ? (
              <Dropdown<Cliente>
                label="Buscar clientes no ERP"
                options={clients}
                multiple
                selected={selectedClientes}
                onChange={(v) => setSelectedClientes(v as Cliente[])}
                open={openDropdown === "clientes"}
                onOpen={() => setOpenDropdown("clientes")}
                onClose={() => setOpenDropdown(null)}
              />
            ) : (
              <InputFields label="Whatsapp Number" />
            )}
          </div>

          <BaseCard classname={Style.cardMetricas}>
            <Metricas
              chave={modoPage === "clientes" ? "Clientes selecionados" : "Leads selecionados"}
              valor={String(selectedClientes.length)}
              classname={Style.contentMetricas}
            />
          </BaseCard>
        </div>

        <div className={Style.containerButtonsPlanilha}>
          <UploadButton onUpload={(file) => console.log(file)} />
          <DownloadModeloButton templateSelecionado={selectedTemplate} modo={modoPage} />
        </div>

        <PreviewBox classname={Style.containerPreview}>
          {selectedClientes.length > 0 ? mensagens![0] : selectedTemplate ? selectedTemplate?.message : "Selecione um template"}
        </PreviewBox>
      </div>
    </PageContainer>
  );
}
