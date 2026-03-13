import * as XLSX from "xlsx";
import type { Template } from "../types";

function getTemplateVariableHeaders(template?: Template | null) {
  if (!template?.variables) return [];

  try {
    const rawVariables =
      typeof template.variables === "string"
        ? JSON.parse(template.variables)
        : template.variables;

    return Array.from(
      new Set(
        Object.values(rawVariables ?? {})
          .map((value) => String(value ?? "").trim())
          .filter(
            (value) =>
              value.length > 0 &&
              value.toLowerCase() !== "whatsapp" &&
              value.toLowerCase() !== "nome_atendente" &&
              value.toLowerCase() !== "nome_empresa"
          )
      )
    );
  } catch {
    return [];
  }
}

export function gerarModeloLeads(template?: Template | null) {
  const totalRows = 500;
  const headers = ["whatsapp", ...getTemplateVariableHeaders(template)];

  const rows = Array.from({ length: totalRows }, () =>
    Object.fromEntries(headers.map((header) => [header, ""]))
  );

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });

  worksheet["!cols"] = headers.map((_, index) =>
    index === 0 ? { wch: 26 } : { wch: 24 }
  );

  worksheet["!dataValidation"] = [
    {
      sqref: `A2:A${totalRows + 1}`,
      type: "custom",
      formula1: "AND(ISNUMBER(A2),LEN(A2)=13,LEFT(A2,2)=\"55\")",
      allowBlank: false,
      showInputMessage: true,
      promptTitle: "Formato obrigatorio",
      prompt: "Use 55 + DDD + numero (13 digitos). Ex: 5511999999999",
      showErrorMessage: true,
      errorTitle: "Contato invalido",
      error: "O numero deve ter exatamente 13 digitos e comecar com 55",
    },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
  XLSX.writeFile(workbook, "modelo_leads.xlsx");
}
