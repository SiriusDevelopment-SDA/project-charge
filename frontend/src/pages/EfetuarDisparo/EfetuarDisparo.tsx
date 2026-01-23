import { useState } from "react";
import Style from "../EfetuarDisparo/Styles/EfetuarDisparo.module.css"
import { useDispatchTemplate } from "../../hooks/useDispatchTemplate";
import { extrairDocumentosClientes, extrairLeads, getTipoPlanilha, processarDocumentos, todasColunasPreenchidas, validarArquivo, validarSelecaoCliente } from "../../utils/validation";
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
  MyButton
} from "../../componente/Index";
import { toast } from "react-toastify";
import {toaster} from "../../lib/chakra"

export default function EfetuarDisparo() {
  const [openDropdown, setOpenDropdown] = useState<"template" | "clientes" | null>(null);
  
  const { templates } = useTemplate()
  const { clients, setQuery } = useClient()
  const { selectedClientes, 
    setSelectedClientes, 
    setSelectedTemplate, 
    selectedTemplate, 
    templateMapVars, 
    sendTemplate, 
    modoPage, 
    setModoPage,
    setSelectedLeads,
    selectedLeads
  } = useDispatchTemplate()
  
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
              const promise = new Promise<number>((resolve, reject) => {
                try {
                  validarArquivo(file)

                  const tipo = getTipoPlanilha(file.name)

                  /* ===========================
                    CLIENTES
                  =========================== */
                  if (tipo === "cliente") {
                    const documents = extrairDocumentosClientes(data)

                    if (documents.length === 0) {
                      reject("Nenhum cliente válido encontrado")
                      return
                    }

                    processarDocumentos(documents)

                    documents.forEach((cnpjCpf, index) => {
                      setTimeout(() => setQuery(cnpjCpf), index * 1000)
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

                    resolve(documents.length)
                    return
                  }

                  /* ===========================
                    LEADS
                  =========================== */
                  if (tipo === "lead") {
                    const leads = extrairLeads(data)
                    console.log("leads", leads)
                    if (leads.length === 0) {
                      reject("Nenhum lead encontrado na planilha")
                      return
                    }

                    const leadsValidos = leads.filter(lead => {
                      todasColunasPreenchidas(lead)
                      return lead.status !== "inválido"
                    })

                    if (leadsValidos.length === 0) {
                      reject("Nenhum lead válido para importar")
                      return
                    }

                    setSelectedLeads(prev => {
                      const novosLeads = leadsValidos.filter(
                        lead => !prev.some(p => p.whatsapp === lead.whatsapp)
                      )
                      return [...prev, ...novosLeads]
                    })

                    resolve(leadsValidos.length)
                    return
                  }

                  reject("Tipo de planilha não reconhecido")
                } catch (err) {
                  reject("Erro ao processar planilha")
                }
              })

              toaster.promise(promise, {
                loading: {
                  title: "Importando dados...",
                  description: "Validando planilha",
                },
                success: {
                  title: "Importação concluída",
                  description: (count: number) =>
                    `${count} registros importados com sucesso`,
                },
                error: {
                  title: "Erro na importação",
                  description: (err: string) => String(err),
                },
              })
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
