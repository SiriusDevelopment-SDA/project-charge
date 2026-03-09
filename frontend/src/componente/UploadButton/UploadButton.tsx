import { Button, CircularProgress } from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import type { UploadButtonProps } from "../../types";
import { useUploadButtonController } from "../../hooks/components/useUploadButtonController";

export function UploadButton({ onUpload, disabled, className }: UploadButtonProps) {
  const { loading, handleFile } = useUploadButtonController({ onUpload });

  return (
    <Button
      variant="outlined"
      component="label"
      startIcon={loading ? <CircularProgress size={18} /> : <CloudUploadIcon />}
      className={className}
      sx={{
        backgroundColor: "#967d0fdd",
        border: "1px solid rgba(255, 204, 0, 0.4)",
        color: "#fff",
        "&:hover": {
          backgroundColor: "#f2c010",
          color: "#fff",
          borderColor: "1px solid #967d0fdd",
        },
      }}
      disabled={disabled || loading}
    >
      {loading ? "Enviando arquivo..." : "Upload planilha"}
      <input type="file" hidden accept=".xlsx,.csv" onChange={handleFile} />
    </Button>
  );
}
