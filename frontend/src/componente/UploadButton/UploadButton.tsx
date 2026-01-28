import { Button } from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
// import * as XLSX from "xlsx";
// import { validar } from "../../utils/validation";
type UploadButtonProps = {
    onUpload: (file: File) => void;
    className?: string;
};

export function UploadButton({ onUpload, className }: UploadButtonProps) {
    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files![0];
        if (file) onUpload(file);
        // const data = await file.arrayBuffer();
        // const workbook = XLSX.read(data);
        // const sheet = workbook.Sheets[workbook.SheetNames[0]];
        // const rows = XLSX.utils.sheet_to_json(sheet);
        // validar(rows);
    }

    return (
        <Button
        className={className}
            variant="contained"
            component="label"
            startIcon={<CloudUploadIcon />}
            sx={{
                backgroundColor: "#967d0fdd",
                color: "#fff",
                "&:hover": {
                    backgroundColor: "#f2c010",
                    color: "#fff",
                    borderColor: "1px solid #967d0fdd"
                },
            }}
        >
            Upload planilha
            <input
                type="file"
                hidden
                accept=".xlsx,.csv"
                onChange={handleFile}
            />
        </Button>
    );
}
