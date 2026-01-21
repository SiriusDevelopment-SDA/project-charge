import * as XLSX from "xlsx";
import type { Template } from "../types";

export function gerarModeloLeads(template?: Template | null) {
    const TOTAL_LINHAS = 500;

    const variaveis = template ? Object.keys(template.variables ?? {}) : [];
    const headers = ["contato", ...variaveis, "status"];

    const rows = Array.from({ length: TOTAL_LINHAS }, () =>
        Object.fromEntries(headers.map((h) => [h, ""]))
    );

    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });

    ws["!cols"] = headers.map((_, idx) =>
        idx === 0 ? { wch: 26 } : { wch: 18 }
    );

    // === DATA VALIDATION EM UMA FAIXA ÚNICA (com prompt) ===
    const dvRange = `A2:A${TOTAL_LINHAS + 1}`;

    ws["!dataValidation"] = [
        {
            sqref: dvRange,
            type: "custom",
            formula1: "AND(ISNUMBER(A2),LEN(A2)=13,LEFT(A2,2)=\"55\")",
            allowBlank: false,
            showInputMessage: true,
            promptTitle: "Formato obrigatório",
            prompt: "Use 55 + DDD + número (13 dígitos). Ex: 5511999999999",
            showErrorMessage: true,
            errorTitle: "Contato inválido",
            error: "O número deve ter exatamente 13 dígitos e começar com 55",
        },
    ];

    // === STATUS AUTOMÁTICO ===
    const statusColIdx = headers.length - 1;
    const statusColLetter = XLSX.utils.encode_col(statusColIdx);

    const clean = (cell: string) =>
        `SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(${cell}," ",""),"-",""),"(",""),")","")`;

    for (let i = 2; i <= TOTAL_LINHAS + 1; i++) {
        const contatoCell = `A${i}`;
        const statusCell = `${statusColLetter}${i}`;
        const cleaned = clean(contatoCell);

        ws[statusCell] = {
            t: "s",
            f: `IF(${contatoCell}="","",
                IF(AND(LEN(${cleaned})=13,LEFT(${cleaned},2)="55"),
                    "válido",
                    "inválido"
                )
            )`,
        };
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    XLSX.writeFile(wb, "modelo_leads.xlsx");
}
