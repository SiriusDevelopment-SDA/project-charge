import { useState } from "react";
import { Button, CircularProgress } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import type { Template } from "../../types";
import { gerarModeloPlanilha } from "../../utils/validation";

type DownloadModeloButtonProps = {
    templateSelecionado?: Template | null;
    modo: "clientes" | "leads";
};

export function DownloadModeloButton({
    templateSelecionado,
    modo,
}: DownloadModeloButtonProps) {
    const [loading, setLoading] = useState(false);

    const handleClick = async () => {
        try {
            setLoading(true);

            if (modo === "clientes") {
                gerarModeloPlanilha(null, "clientes");
            } else {
                if (!templateSelecionado) return;
                gerarModeloPlanilha(templateSelecionado, "leads");
            }

        } finally {
            setLoading(false);
        }
    };



    return (
        <Button
            variant="outlined"
            startIcon={
                loading ? <CircularProgress size={18} /> : <DownloadIcon />
            }
            sx={{
                background: "linear-gradient(90deg, #001 0%, #b89300 100%)",
                color: "#fff",
                borderRadius: "6px",
                textTransform: "none",
                fontWeight: 500,
                padding: "8px 16px",
                border: "1px solid rgba(255, 204, 0, 0.4)",
                boxShadow: "0 0 12px rgba(255, 204, 0, 0.3)",
                "&:hover": {
                    background: "linear-gradient(90deg, #000 0%, #d4a500 100%)",
                    borderColor: "rgba(255, 204, 0, 0.7)",
                    boxShadow: "0 0 16px rgba(255, 204, 0, 0.4)",
                },
            }}
            disabled={(modo === "leads" && !templateSelecionado) || loading}
            onClick={handleClick}
        >
            {loading ? "Gerando modelo..." : modo === "clientes" ? "Baixar modelo clientes" : "Baixar modelo leads"}
        </Button>
    );
}
