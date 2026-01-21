import { createContext, useEffect, useState } from 'react'
import type { Cliente, IDispatchTemplateContext, mappedVars, Template } from '../types'
import { compilarTemplate } from '../utils/validation'

// eslint-disable-next-line react-refresh/only-export-components
export const DispatchTemplateContext = createContext<IDispatchTemplateContext>(
  {} as IDispatchTemplateContext,
)

export const DispatchTemplateProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [selectedClientes, setSelectedClientes] = useState<Cliente[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  
  
const [templateMapVars, setTemplateMapsVars] = useState<mappedVars[]>([])

useEffect(() => {
  try {
    // 1️⃣ Nenhum template → limpa tudo
    if (!selectedTemplate) {
      setTemplateMapsVars([]);
      return;
    }

    const hasVars =
      selectedTemplate.variables &&
      Object.entries(selectedTemplate.variables).length > 0;

    // 2️⃣ Template SEM variáveis
    if (!hasVars) {
      setTemplateMapsVars([]);
      return;
    }

    // 3️⃣ Template COM variáveis mas sem clientes
    if (selectedClientes.length === 0) {
      setTemplateMapsVars([]);
      return;
    }

    // 4️⃣ Template COM variáveis + clientes
    const mapped = selectedClientes.map(c => {
      const vars: Record<string, string> = {
        nome_cliente: c.name ?? "",
        data_vencimento_fatura: c.invoices?.[0]?.data_vencimento_fatura ?? "",
        nome_empresa: c.company?.name ?? "",
        numero_contrato: c.invoices?.[0]?.contratoId ?? "",
        valor_fatura: c.invoices?.[0]?.valor_fatura ?? "",
        linha_digitavel_boleto: c.invoices?.[0]?.linha_digitavel_boleto ?? "",
        link_boleto_pdf: c.invoices?.[0]?.link_boleto_pdf ?? "",
      };

      return {
        ...vars,
        mensagem: compilarTemplate(
          selectedTemplate.message,
          selectedTemplate.variables,
          vars
        )
      };
    });

    setTemplateMapsVars(mapped);

  } catch (error) {
    console.error("Erro ao mapear:", error);
    setTemplateMapsVars([]);
  }
}, [selectedTemplate, selectedClientes]);


  return (
    <DispatchTemplateContext.Provider
      value={{
        selectedClientes,
        setSelectedClientes,
        selectedTemplate,
        setSelectedTemplate,
        templateMapVars
       }}
    >
      {children}
    </DispatchTemplateContext.Provider>
  )
}