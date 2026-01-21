import * as XLSX from "xlsx";

export function gerarModeloClientes() {
    const TOTAL_LINHAS = 500;

    // Criar linhas vazias com headers
    const rows = Array.from({ length: TOTAL_LINHAS }, () => ({
        "CPF/CNPJ": "",
        "Status": "",
    }));

    // Criar sheet com header fixo
    const ws = XLSX.utils.json_to_sheet(rows, { header: ["CPF/CNPJ", "Status"] });

    // Definir largura das colunas
    ws["!cols"] = [
        { wch: 26 }, // CPF/CNPJ
        { wch: 12 }, // Status
    ];

    // Máscara CPF/CNPJ
    const docFormat =
        '[>=10000000000000]00"."000"."000"/"0000"-"00;000"."000"."000"-"00';

    // Função para limpar string para validação
    const clean = (cell: string) =>
        `SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(${cell},".",""),"-",""),"/","")," ","")`;

    // Aplicar formatação e cálculo de STATUS
    for (let i = 2; i <= TOTAL_LINHAS + 1; i++) {
        const a = `A${i}`; // CPF/CNPJ
        const b = `B${i}`; // Status

        // Garante que Excel entenda a célula
        if (!ws[a]) ws[a] = { t: "n" };

        // Aplicar máscara no CPF/CNPJ
        ws[a].z = docFormat;

        // Status automático: OK se 11 ou 14 dígitos, senão INVÁLIDO
        ws[b] = {
            t: "s",
            f: `IF(${a}="","",IF(OR(LEN(${clean(a)})=11,LEN(${clean(a)})=14),"OK","INVÁLIDO"))`,
        };
    }

    // Criar workbook e salvar
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    XLSX.writeFile(wb, `modelo_clientes.xlsx`);
}