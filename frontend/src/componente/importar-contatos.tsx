import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import * as XLSX from "xlsx";
import { toast } from "react-toastify";
import "../styles/importar-contatos.css";

type ClienteERP = { nome: string; cpf: string };

type Props = {
  clientesERP: ClienteERP[];                 // ✅ lista do ERP (por enquanto mock)
  onClientesImportados: (nomes: string[]) => void; // ✅ retorna NOMES
};

function cpfDigits(raw: any) {
  return String(raw ?? "").replace(/\D/g, "");
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

      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      let total = 0;
      let invalidos = 0;
      let naoEncontrados = 0;

      const nomesValidos: string[] = [];

      rows.forEach((row) => {
        const cpfRaw = row.CPF || row.cpf;
        if (!cpfRaw) return;

        const cpf = cpfDigits(cpfRaw);
        total++;

        if (cpf.length !== 11) {
          invalidos++;
          return;
        }

        const cliente = clientesERP.find(
          (c) => cpfDigits(c.cpf) === cpf
        );

        if (!cliente) {
          naoEncontrados++;
          return;
        }

        nomesValidos.push(cliente.nome);
      });

      if (total === 0) {
        toast.warn("Nenhum CPF encontrado na planilha.", { position: "top-right", theme: "dark" });
        return;
      }

      if (nomesValidos.length === 0) {
        toast.error("Nenhum CPF válido/encontrado no ERP.", { position: "top-right", theme: "dark" });
        return;
      }

      if (invalidos > 0 || naoEncontrados > 0) {
        toast.warn(
          `${total} CPFs lidos • ${invalidos} inválidos • ${naoEncontrados} não encontrados no ERP.`,
          { position: "top-right", theme: "dark" }
        );
      } else {
        toast.success(`${total} clientes encontrados e todos válidos!`, {
          position: "top-right",
          theme: "dark",
        });
      }

      onClientesImportados(nomesValidos);
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
