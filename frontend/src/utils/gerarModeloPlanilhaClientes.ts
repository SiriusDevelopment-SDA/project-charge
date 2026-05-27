import * as XLSX from "xlsx";

export function gerarModeloClientes() {
    const TOTAL_LINHAS = 500;

    // Criar linhas vazias com headers
    const rows = Array.from({ length: TOTAL_LINHAS }, () => ({
        "cnpj_cpf": "",
        "nome_cliente": "",
        "whatsapp": "",
        "Status": "",
    }));

    // Criar sheet com header fixo
    const ws = XLSX.utils.json_to_sheet(rows, {
        header: ["cnpj_cpf", "nome_cliente", "whatsapp", "Status"],
    });

    // Definir largura das colunas
    ws["!cols"] = [
        { wch: 26 }, // CPF/CNPJ
        { wch: 28 }, // Nome do cliente
        { wch: 18 }, // WhatsApp
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
        const c = `C${i}`; // WhatsApp
        const d = `D${i}`; // Status

        // Garante que Excel entenda a célula
        if (!ws[a]) ws[a] = { t: "n" };

        // Aplicar máscara no CPF/CNPJ
        ws[a].z = docFormat;

        // Status automático:
        // - vazio se CPF e WhatsApp vazios
        // - OK se CPF válido OU WhatsApp com 13 dígitos
        // - INVÁLIDO caso contrário
        ws[d] = {
            t: "s",
            f: `IF(AND(${a}="",${c}=""),"",IF(OR(OR(LEN(${clean(a)})=11,LEN(${clean(a)})=14),LEN(${clean(c)})=13),"OK","INVÁLIDO"))`,
        };
    }

    // Criar workbook e salvar
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    XLSX.writeFile(wb, `modelo_clientes.xlsx`);
}
