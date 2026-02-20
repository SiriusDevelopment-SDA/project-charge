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
                
                  const clientesValidos = novosClientes.filter(cliente =>
                    validarSelecaoCliente(cliente, selectedTemplate!)
                  );
                
                  setSelectedClientes(clientesValidos);
                }}
                
                open={openDropdown === "clientes"}
                onOpen={() => setOpenDropdown("clientes")}
                onClose={() => setOpenDropdown(null)}
              /> : (
                <InputFields
                  label="Número de Whatsapp"
                  onlyNumbers={true}
                  value={whatsappValue}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWhatsappValue(e.target.value)}
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
