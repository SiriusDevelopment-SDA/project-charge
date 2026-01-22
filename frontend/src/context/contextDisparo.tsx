import { createContext, useEffect, useState } from 'react'
import type { Cliente, IDispatchTemplateContext, mappedVars, SendTemplate, Template, TemplateRecipient } from '../types'
import { compilarTemplate } from '../utils/validation'
import { Api } from '../services/api'
import { toast } from 'react-toastify'

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

    const ATENDENTE_PADRAO = "Atendimento Sirius";
    // 4️⃣ Template COM variáveis + clientes
    const mapped = selectedClientes.map(c => {
      const vars: Record<string, string> = {
        nome_cliente: c.name ?? "",
        cnpj_cpf: c.cnpj_cpf ?? "",
        nome_atendente: ATENDENTE_PADRAO,
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

const handleSubmit = async (
  templateId: string,
  to: TemplateRecipient[]
) => {
  try {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    const account = urlParams.get("account");

    const response = await Api.post(
      "/send/template",
      { templateId, account, to }
    );

    const res = response.data;

    // ✅ CONFIRMAÇÃO DE DISPARO
    if (res?.success) {
      toast.success(
        `Disparo enviado com sucesso! (${res.total} mensagens)`
      );
    } else {
      toast.warn("Disparo enviado, mas sem confirmação completa.");
    }

  } catch (error: any) {
    console.error(error);

    toast.error(
      error?.response?.data?.message ||
      "Erro ao enviar mensagens"
    );
  }
};

  const sendTemplate = () => {
    if (!selectedTemplate) return;
  
    const send = selectedClientes
      .map(c => {
        // Variáveis mapeadas apenas desse cliente
        const mapVarsClient = templateMapVars?.find(
          m => m.cnpj_cpf === c.cnpj_cpf
        );
  
        // Monta parâmetros do BODY respeitando a ordem {{1}}, {{2}}, {{3}}
        const bodyParameters =
          selectedTemplate.variables &&
          Object.entries(
            selectedTemplate.variables as Record<number, keyof mappedVars>
          )
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([_, variableKey]) => {
              
              const value = mapVarsClient?.[variableKey];
  
              return {
                type: "text" as const,
                text: String(value ?? "")
              };
            });
  
        // 🔒 Validação: variável obrigatória vazia
        if (bodyParameters?.some(p => !p.text || p.text.trim() === "")) {
          toast.warning(`Variável obrigatória vazia para o cliente: ${c.name}, ${bodyParameters}`);
          return null;
        }
  
        return {
          name: c.name,
          number: c.whatsapp,
          components: [
            {
              type: "BODY",
              parameters: bodyParameters && bodyParameters.length > 0
                ? bodyParameters
                : []
            }
          ]
        };
      })
      // remove clientes inválidos (que retornaram null)
      .filter(
        (item): item is {
          name: string;
          number: string;
          components: {
            type: "BODY";
            parameters: { type: "text"; text: string }[];
          }[];
        } => Boolean(item)
      );
  
    if (send.length === 0) {
      toast.warning("Nenhum cliente válido para envio");
      return;
    }
  
    handleSubmit(selectedTemplate.id, send);
  };
  
  return (
    <DispatchTemplateContext.Provider
      value={{
        selectedClientes,
        setSelectedClientes,
        selectedTemplate,
        setSelectedTemplate,
        templateMapVars,
        sendTemplate
       }}
    >
      {children}
    </DispatchTemplateContext.Provider>
  )
}