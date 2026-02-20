import { Button, CircularProgress } from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import type { UploadButtonProps } from "../../types";
import { useState } from "react";


export function UploadButton({ onUpload, disabled, className }: UploadButtonProps) {
    const [loading, setLoading] = useState(false);
    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        try {
            setLoading(true)
            const file = e.target.files?.[0];
            if (!file) return;
            onUpload(file);
        } finally {
            setLoading(false)
        }
      }

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
                    borderColor: "1px solid #967d0fdd"
                },
            }}
            disabled={disabled || loading}
        >
            {loading ? "Enviando arquivo...": "Upload planilha"}
            <input
                type="file"
                hidden
                accept=".xlsx,.csv"
                onChange={handleFile}
            />
        </Button>
    );
}
