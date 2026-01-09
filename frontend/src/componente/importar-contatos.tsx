import Button from "@mui/material/Button";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import * as XLSX from "xlsx";
import { toast } from "react-toastify";
import { validarTelefone } from "../utils/ValidarTelefone";
import "../styles/importar-contatos.css";

export default function InputFileUpload() {
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
      const data = e.target?.result;
      if (!data) return;

      // Lê o XLSX
      const workbook = XLSX.read(data, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Converte para JSON
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      let total = 0;
      let invalidos = 0;

      rows.forEach((row) => {
        const telefone = row.telefone; // <-- a coluna deve se chamar 'telefone'

        if (!telefone) return; // ignora vazios

        total++;

        const { ok } = validarTelefone(telefone);

        if (!ok) invalidos++;
      });

      if (total === 0) {
        toast.warn("Nenhum telefone encontrado na coluna 'telefone'.", {
          position: "top-right",
          theme: "dark",
        });
        return;
      }

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
    };

    reader.readAsBinaryString(file);
  };

  return (
    <>
      <Button
        className="importarContatosButton"
        component="label"
        startIcon={<CloudUploadIcon />}
      >
        <input
          type="file"
          accept=".xlsx"
          multiple
          className="importarContatosInput"
          onChange={handleFileChange}
        />
      </Button>
    </>
  );
}
