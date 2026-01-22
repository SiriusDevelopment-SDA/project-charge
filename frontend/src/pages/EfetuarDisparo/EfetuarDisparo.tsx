import { useState } from "react";
import Style from "../EfetuarDisparo/Styles/EfetuarDisparo.module.css"
import { useDispatchTemplate } from "../../hooks/useDispatchTemplate";
import { extrairDocumentosClientes, extrairLeads, getTipoPlanilha, processarDocumentos, validarArquivo, validarSelecaoCliente } from "../../utils/validation";
import type { Cliente, Template } from "../../types";
import { useClient, useTemplate } from "../../hooks";
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
  MyButton} from "../../componente/Index";
import { toast } from "react-toastify";

export default function EfetuarDisparo() {
  const [openDropdown, setOpenDropdown] = useState<"template" | "clientes" | null>(null);
  const [modoPage, setModoPage] = useState<"clientes" | "leads">("clientes");
  const { templates } = useTemplate()
  const { clients, setQuery } = useClient()
  const { selectedClientes,setSelectedClientes, setSelectedTemplate, selectedTemplate, templateMapVars, sendTemplate } = useDispatchTemplate()
  
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
                options={templates}
                value={selectedTemplate}
                onChange={(v) => setSelectedTemplate(v as Template)}
                open={openDropdown === "template"}
                onOpen={() => setOpenDropdown("template")}
                onClose={() => setOpenDropdown(null)}
              />

              {modoPage === "clientes" ? <Dropdown<Cliente>
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
              /> :
                <InputFields label="Whatsapp Number" />}
            </div>
            <BaseCard classname={Style.cardMetricas}>
              <Metricas
                chave={modoPage === "clientes" ?
                  "Clientes selecionados" :
                  "Leads selecionados"}
                valor={selectedClientes ? String(selectedClientes?.length) : '0'}
                classname={Style.contentMetricas}
              />
            </BaseCard>
          </div>
          <div className={Style.containerButtonsPlanilha}>
          <UploadButton
            onUpload={(file, data) => {
              try {
                validarArquivo(file)

                const tipo = getTipoPlanilha(file.name)

                if (tipo === "cliente") {
                  const documents = extrairDocumentosClientes(data)
                  processarDocumentos(documents)
                  documents.forEach((cnpjCpf, index) => {
                    setTimeout(() => {
                      setQuery(cnpjCpf)
                    }, index * 1000)
                  })
                  setSelectedClientes(prev => {
                    const clientesFromPlanilha = clients.filter(cliente =>
                      documents.includes(cliente.cnpj_cpf.replace(/\D/g, ""))
                    )
                
                    const novosClientes = clientesFromPlanilha.filter(cliente =>
                      !prev.some(c => c.cnpj_cpf === cliente.cnpj_cpf)
                    )
                
                    return [...prev, ...novosClientes]
                  })
                  return
                }

                if (tipo === "lead") {
                  const leads = extrairLeads(data)
                  toast.success(`${leads.length} leads importados`)
                  return
                }

                toast.error("Tipo de planilha não reconhecido nunca troque o nome do arquivo!!")
              } catch (err: any) {
                toast.error(err.message)
              }
            }}
          />


            <DownloadModeloButton templateSelecionado={selectedTemplate} modo={modoPage} />
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
