import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import * as XLSX from "xlsx";
import { toast } from "react-toastify";
import "../styles/importar-contatos.css";

type ClienteERP = { nome: string; cpf: string };

type Props = {
  clientesERP: ClienteERP[];
  onClientesImportados: (docsLimpos: string[]) => void; // CPF(11) ou CNPJ(14) só dígitos
};

function digits(raw: any) {
  return String(raw ?? "").replace(/\D/g, "");
}

function normHeader(h: any) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9/]/g, ""); // mantém letras, números e "/"
}

export default function InputFileUpload({ clientesERP, onClientesImportados }: Props) {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
      const data = e.target?.result;
      if (!data) return;

      const workbook = XLSX.read(data, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Lê como matriz (mais robusto para detectar colunas, mesmo com "Status")
      const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      if (!aoa.length || !aoa[0] || aoa[0].length === 0) {
        toast.error("Planilha incompatível com o padrão", { position: "top-right", theme: "dark" });
        return;
      }

      const headerRaw = aoa[0];
      const headerNorm = headerRaw.map(normHeader);

      // detecta coluna de Documento (CPF/CNPJ) por “contém”
      const docIdx = headerNorm.findIndex((h) =>
        h.includes("cpf") || h.includes("cnpj") || h.includes("documento") || h === "doc"
      );

      // detecta coluna de Telefone por “contém”
      const telIdx = headerNorm.findIndex((h) =>
        h.includes("telefone") || h.includes("celular") || h.includes("whatsapp") || h.includes("fone") || h.includes("tel")
      );

      // Status é opcional, não precisa achar
      // const statusIdx = headerNorm.findIndex((h) => h === "status");

      // precisa ter pelo menos Documento + Telefone para ser compatível
      if (docIdx === -1 || telIdx === -1) {
        // ajuda a debugar rápido sem você adivinhar
        console.log("Cabeçalhos detectados:", headerRaw);
        toast.error("Planilha incompatível com o padrão", { position: "top-right", theme: "dark" });
        return;
      }

      let total = 0;
      let invalidos = 0;
      let naoEncontrados = 0;

      const docsValidos: string[] = [];

      // Linhas de dados começam na linha 1 (0 é header)
      for (let r = 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const docRaw = row[docIdx];
        const telRaw = row[telIdx];

        // ignora linha vazia
        if (!docRaw && !telRaw) continue;

        const doc = digits(docRaw);
        const tel = digits(telRaw);
        total++;

        // valida doc: CPF 11 ou CNPJ 14
        const docOk = doc.length === 11 || doc.length === 14;
        if (!docOk) {
          invalidos++;
          continue;
        }

        // telefone: se estiver vazio, não invalida; se preenchido, valida tamanho
        if (tel.length > 0 && (tel.length < 10 || tel.length > 13)) {
          invalidos++;
          continue;
        }

        // se seu ERP só tem CPF, CNPJ vai cair em "não encontrado"
        const cliente = clientesERP.find((c) => digits(c.cpf) === doc);
        if (!cliente) {
          naoEncontrados++;
          continue;
        }

        docsValidos.push(doc);
      }

     (() =>
  total === 0
    ? toast.warn("Nenhum cliente encontrado.", { position: "top-right", theme: "dark" })
    : docsValidos.length === 0
      ? toast.error("Nenhum cliente válido ou encontrado no ERP.", { position: "top-right", theme: "dark" })
      : (invalidos > 0 || naoEncontrados > 0)
        ? toast.warn(
            `${total} ${total === 1 ? "linha lida" : "linhas lidas"} • ` +
            `${invalidos} ${invalidos === 1 ? "inválida" : "inválidas"} • ` +
            `${naoEncontrados} ${naoEncontrados === 1 ? "não encontrada" : "não encontradas"} no ERP.`,
            { position: "top-right", theme: "dark" }
          )
        : toast.success(
            docsValidos.length === 0
              ? "Nenhum cliente encontrado."
              : `${docsValidos.length} ${docsValidos.length === 1 ? "cliente encontrado" : "clientes encontrados"}.`,
            { position: "top-right", theme: "dark" }
          )
)();

      

      onClientesImportados(Array.from(new Set(docsValidos)));
    };

    reader.readAsBinaryString(file);
    event.target.value = "";
  };

  return (
    <label className="mini-upload-label">
      <CloudUploadIcon style={{ fontSize: 16, marginRight: 6 }} />
      <span>Upload planilha</span>
      <input
        type="file"
        accept=".xlsx"
        className="hidden-file-input"
        onChange={handleFileChange}
      />
    </label>
  );
}
