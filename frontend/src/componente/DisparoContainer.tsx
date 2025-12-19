"use client";

import { useMemo, useState } from "react";
import ClienteSelect from "../componente/filtrocliente";
import MessagePreview from "./MessagePreview";

/* 🔥 FUNÇÃO GENÉRICA */
function renderTemplate(
  template: string,
  variaveis: Record<string, string | number | undefined>
) {
  let resultado = template;

  Object.entries(variaveis).forEach(([chave, valor]) => {
    const regex = new RegExp(`{{\\s*${chave}\\s*}}`, "g");
    resultado = resultado.replace(regex, String(valor ?? ""));
  });

  return resultado;
}

/* 🔥 DEDUPLICAÇÃO */
function uniqueByNome(clientes: any[]) {
  const map = new Map<string, any>();

  clientes.forEach((cliente) => {
    if (cliente?.nome) map.set(cliente.nome, cliente);
  });

  return Array.from(map.values());
}

/* ✅ TIPOS */
type Cliente = {
  nome: string;
  valor?: number;
  fatura?: string;
  data?: string;
};

type Template = {
  id: number;
  nome: string;
  conteudo: string;
};

/* MOCK */
const clientesMock: Record<string, Cliente> = {
  "João Vitor": {
    nome: "João Vitor",
    valor: 129.9,
    fatura: "FT-1029",
    data: "20/12/2025",
  },
  "Maria Silva": {
    nome: "Maria Silva",
    valor: 89.9,
    fatura: "FT-8877",
    data: "18/12/2025",
  },
  "Lucas Santos": {
    nome: "Lucas Santos",
    valor: 89.9,
    fatura: "FT-8877",
    data: "18/12/2025",
  },
};

const templatesMock: Template[] = [
  {
    id: 1,
    nome: "Cobrança",
    conteudo:
      "Olá {{nome}}, sua fatura {{fatura}} vence em {{data}} no valor de R$ {{valor}}.",
  },
  {
    id: 2,
    nome: "Aviso",
    conteudo: "Olá {{nome}}, identificamos pendências em seu cadastro.",
  },
];

export default function DisparoContainer() {
  const [clientesSelecionados, setClientesSelecionados] = useState<Cliente[]>(
    []
  );
  const [template, setTemplate] = useState<Template | null>(null);

  // ✅ select controlado (evita bug do option)
  const templateId = template?.id ?? "";

  // 🔥 PREVIEW (1 CLIENTE EXEMPLO)
  const preview = useMemo(() => {
    if (!template) return "Selecione um template para visualizar a mensagem";
    if (clientesSelecionados.length === 0)
      return "Selecione ao menos 1 cliente para visualizar a mensagem";

    const clienteExemplo = clientesSelecionados[0];

    return renderTemplate(template.conteudo, {
      nome: clienteExemplo.nome,
      valor:
        typeof clienteExemplo.valor === "number"
          ? clienteExemplo.valor.toFixed(2)
          : "",
      fatura: clienteExemplo.fatura ?? "",
      data: clienteExemplo.data ?? "",
    });
  }, [clientesSelecionados, template]);

  return (
    <>
      <ClienteSelect
        onChangeClientes={(nomes: string[]) => {
          const clientes = nomes
            .map((nome) => clientesMock[nome])
            .filter(Boolean);

          setClientesSelecionados(uniqueByNome(clientes));
        }}
      >
        Selecione os clientes
      </ClienteSelect>

      <select
        value={templateId}
        onChange={(e) => {
          const id = Number(e.target.value);
          const tpl = templatesMock.find((t) => t.id === id);
          setTemplate(tpl ?? null);
        }}
      >
        <option value="">Selecionar template</option>
        {templatesMock.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nome}
          </option>
        ))}
      </select>

      <MessagePreview message={preview} />
    </>
  );
}
