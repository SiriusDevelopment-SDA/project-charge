import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import * as XLSX from "xlsx";
import { toast } from "react-toastify";
import { validarTelefone } from "../utils/ValidarTelefone";
import "../styles/importar-contatos.css";

type Props = {
  onClientesImportados: (nomes: string[]) => void;
};

export default function InputFileUpload({ onClientesImportados }: Props) {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
      const data = e.target?.result;
      if (!data) return;

      // Lê a planilha
      const workbook = XLSX.read(data, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Converte para JSON
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      let total = 0;
      let invalidos = 0;
      const validos: string[] = [];

      rows.forEach((row) => {
        const nome = row.nome;
        const telefone = row.telefone;

        if (!nome || !telefone) return;

        total++;

        const { ok } = validarTelefone(telefone);

        if (!ok) {
          invalidos++;
        } else {
          validos.push(nome);
        }
      });

      // Nenhuma linha encontrada
      if (total === 0) {
        toast.warn("Nenhum contato encontrado na planilha.", {
          position: "top-right",
          theme: "dark",
        });
        return;
      }

      // Nenhum válido
      if (validos.length === 0) {
        toast.error("Nenhum telefone válido encontrado na planilha.", {
          position: "top-right",
          theme: "dark",
        });
        return;
      }

      // Resultado válido porém com inválidos
      if (invalidos > 0) {
        toast.error(
          `${total} contatos encontrados e ${invalidos} telefones incorretos.`,
          {
            position: "top-right",
            theme: "dark",
          }
        );
      } else {
        toast.success(
          `${total} contatos encontrados e todos os telefones estão corretos!`,
          {
            position: "top-right",
            theme: "dark",
          }
        );
      }

      // callback para o componente pai
      onClientesImportados(validos);
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
        multiple
        className="hidden-file-input"
        onChange={handleFileChange}
      />
    </label>
  );
}
