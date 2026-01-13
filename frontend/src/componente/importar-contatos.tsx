import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import * as XLSX from "xlsx";
import { toast } from "react-toastify";
import "../styles/importar-contatos.css";

function formatarCPF(cpf: string) {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
}

type Props = {
  onClientesImportados: (cpfs: string[]) => void;
};

export default function InputFileUpload({ onClientesImportados }: Props) {
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
      const validos: string[] = [];

      rows.forEach((row) => {
        const cpfRaw = row.CPF || row.cpf;
        if (!cpfRaw) return;

        const cpfLimpo = String(cpfRaw).replace(/\D/g, "");
        total++;

        if (cpfLimpo.length !== 11) {
          invalidos++;
        } else {
          validos.push(formatarCPF(cpfLimpo)); // já retorna formatado
        }
      });

      if (total === 0) {
        toast.warn("Nenhum CPF encontrado na planilha.", {
          position: "top-right",
          theme: "dark",
        });
        return;
      }

      if (validos.length === 0) {
        toast.error("Nenhum CPF válido encontrado na planilha.", {
          position: "top-right",
          theme: "dark",
        });
        return;
      }

      if (invalidos > 0) {
        toast.warn(
          `${total} CPFs encontrados e ${invalidos} inválidos.`,
          {
            position: "top-right",
            theme: "dark",
          }
        );
      } else {
        toast.success(
          `${total} CPFs encontrados e todos válidos!`,
          {
            position: "top-right",
            theme: "dark",
          }
        );
      }

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
        className="hidden-file-input"
        onChange={handleFileChange}
      />
    </label>
  );
}
