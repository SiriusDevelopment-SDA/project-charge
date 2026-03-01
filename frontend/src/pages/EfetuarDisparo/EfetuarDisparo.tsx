// Função para formatar número de WhatsApp
function formatarWhatsapp(valor: string) {
  valor = valor.replace(/\D/g, "");
  if (valor.length === 0) return "";
  if (valor.length < 3) return `(${valor}`;
  if (valor.length < 8) return `(${valor.slice(0, 2)}) ${valor.slice(2)}`;
  if (valor.length <= 11) return `(${valor.slice(0, 2)}) ${valor.slice(2, 7)}${valor.length > 7 ? '-' : ''}${valor.slice(7)}`;
  return `(${valor.slice(0, 2)}) ${valor.slice(2, 7)}-${valor.slice(7, 11)}`;
}
import { useEffect, useState } from "react";
import Style from "../EfetuarDisparo/Styles/EfetuarDisparo.module.css"
import { useDispatchTemplate } from "../../hooks/useDispatchTemplate";
import type { Cliente, Template } from "../../types";
import { useClient, useTemplate } from "../../hooks";
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import { processarDocumentos,
   validarSelecaoCliente 
  } from "../../utils/validation";
import { 
  PageContainer,
  BaseCard,
  Metricas, 
  TitlePage, 
  Dropdown, 
  PreviewBox, 
  UploadButton, 
  DownloadModeloButton, 
  InputFields, 
  MyButton
} from "../../componente/Index";
import { handleUploadPlanilha } from "../../utils/hendleUploadSpreadSheat";

export default function EfetuarDisparo() {
  // State para o campo de WhatsApp
  const [whatsappValue, setWhatsappValue] = useState("");
  const [openDropdown, setOpenDropdown] = useState<"template" | "clientes" | null>(null);
  const [openCategoryDropdown, setOpenCategoryDropdown] = useState<boolean>(false);
  const { clients, setQuery, setGroupInvoices } = useClient()
  const { templates, 
    setSearchTemplateName, 
    searchTemplateName, 
    categoryTemplateFilter, 
    setCategoryTemplateFilter 
  } = useTemplate()
  const { selectedClientes, 
    setSelectedClientes, 
    setSelectedTemplate, 
    selectedTemplate, 
    templateMapVars, 
    sendTemplate, 
    modoPage, 
    setModoPage,
    setSelectedLeads,
  } = useDispatchTemplate()

  useEffect(() => {
    setGroupInvoices(selectedTemplate?.category === "Cobrança");
  }, [selectedTemplate, setGroupInvoices]);

    const filteredTemplates = templates.filter(template => {
    const matchName =
      template.name
        .toLowerCase()
        .includes(searchTemplateName.toLowerCase())
    const matchCategory = categoryTemplateFilter
      ? template.category === categoryTemplateFilter
      : true;
    return matchName && matchCategory;
  })
  const categories = [...new Set(templates.map(t => t.category))];

  console.log("teste1", templateMapVars?.map(i => i))
  console.log("teste2", templateMapVars?.map(i => i))
  return (
    <>
      <PageContainer 
      className={Style.EfeturarDisparoContainer}>
        <TitlePage 
        title={modoPage === "clientes" ? 
        "Disparo clientes ativos" : 
        "Disparo para leads"
        } className={Style.navTitlePage} 
        setModoPage={setModoPage} 
        text={modoPage === "clientes" ? 
        "Disparo para leads" : 
        "Disparo clientes ativos"} 
        />
        <div 
        className={Style.containerCenter}
          onClick={() => {
            setOpenDropdown(null);
          }}>
          <div className={Style.containerCenterTop}>
            <div className={Style.containerInput} onClick={(e) => e.stopPropagation()}>
              <Dropdown<Template>
                label="Buscar template"
                options={filteredTemplates}
                value={selectedTemplate}
                onChange={(v) => setSelectedTemplate(v as Template)}
                open={openDropdown === "template"}
                onOpen={() => setOpenDropdown("template")}
                onClose={() => setOpenDropdown(null)}
                className={Style.dropdownTemplate}
              >{openDropdown === "template" &&
                <span className={Style.FilterDropdownTemplate}>
                  <InputFields
                    placeholder="Buscar template pelo nome"
                    value={searchTemplateName}
                    onChange={(e) => setSearchTemplateName(e.target.value)}                    
                  />

                  <div className={Style.filterWrapper}>
                    <FilterAltOutlinedIcon
                      className={`${Style.iconFilterDropdownTemplate} ${
                        categoryTemplateFilter ? Style.activeFilter : ""
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenCategoryDropdown(prev => !prev)
                      }}
                    />

                    {openCategoryDropdown && (
                      <div className={Style.categoryMenu}>
                        <div
                          className={Style.categoryItem}
                          onClick={() => {
                            setCategoryTemplateFilter(null)
                            setOpenCategoryDropdown(false)
                          }}
                        >
                          Todas
                        </div>

                        {categories.map(category => (
                          <div
                            key={category}
                             className={`${Style.categoryItem} ${
                              categoryTemplateFilter === category ? Style.categoryItemActive : ""
                            }`}
                            onClick={() => {
                              setCategoryTemplateFilter(category)
                              setOpenCategoryDropdown(false)
                            }}
                          >
                            {category}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </span>

                }
              </Dropdown>
            {modoPage === "clientes" ?
              <Dropdown<Cliente>
                label="Buscar clientes no ERP"
                options={clients}
                multiple
                selected={selectedClientes}
                onChange={(v) => {
                  const novosClientes = v as Cliente[];
                  
                  const clientesValidos = novosClientes.filter(cliente => {

                    if (!selectedTemplate) return false;

                    return validarSelecaoCliente(cliente, selectedTemplate);
                  });
                  setSelectedClientes(clientesValidos);
                }}

                open={openDropdown === "clientes"}
                onOpen={() => setOpenDropdown("clientes")}
                onClose={() => setOpenDropdown(null)}
                summaryOnMultiple
                searchable
              /> : (
                <InputFields
                  label="Número de Whatsapp"
                  onlyNumbers={true}
                  value={whatsappValue}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWhatsappValue(formatarWhatsapp(e.target.value))}
                />
              )
            }
            </div>
            <BaseCard classname={Style.cardMetricas}>
              <Metricas
                chave={modoPage === "clientes" ?
                  "Clientes selecionados" :
                  "Leads selecionados"
                }
                valor={selectedClientes ? String(selectedClientes?.length) : '0'}
                classname={Style.contentMetricas}
              />
            </BaseCard>
          </div>
          <div className={Style.containerButtonsPlanilha}>
          <UploadButton
            onUpload={(file) =>
              handleUploadPlanilha({
                file,
                clients,
                setQuery,
                setSelectedClientes,
                setSelectedLeads,
                processarDocumentos
              })
            }
            disabled={modoPage === "leads" && !selectedTemplate ? true : false}
          />
          <DownloadModeloButton templateSelecionado={selectedTemplate} modo={modoPage}/>
          </div>
          <PreviewBox classname={Style.containerPreview}>
          {!selectedTemplate
          ? "Selecione um template"
          : templateMapVars?.[0]?.mensagem ?? selectedTemplate.message}
          </PreviewBox>
          
        </div>
        <section className={Style.containerButtonSend}>
            <MyButton text="teste"/>
            <MyButton text="teste2" onClick={() => sendTemplate()}/>
        </section>
      </PageContainer>
   
    </>
  );
}
