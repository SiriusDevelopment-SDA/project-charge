import { Button, CircularProgress } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import type { Template } from "../../types";
import { useDownloadModeloButtonController } from "../../hooks/components/useDownloadModeloButtonController";

type DownloadModeloButtonProps = {
  templateSelecionado?: Template | null;
  modo?: "clientes" | "leads";
  className?: string;
};

export function DownloadModeloButton({
  templateSelecionado,
  modo,
  className,
}: DownloadModeloButtonProps) {
  const { disabled, loading, handleClick } = useDownloadModeloButtonController({
    templateSelecionado,
    modo,
  });

  return (
    <Button
      variant="outlined"
      startIcon={loading ? <CircularProgress size={18} /> : <DownloadIcon />}
      sx={{
        background: "linear-gradient(90deg, #7a6200 0%, #b89300 100%)",
        border: "1px solid rgba(255, 204, 0, 0.45)",
        borderRadius: "6px",
        color: "#fff",
        fontWeight: 500,
        textTransform: "none",
        padding: "8px 16px",
        boxShadow: "0 0 12px rgba(255, 204, 0, 0.25)",
        "&:hover": {
          background: "linear-gradient(90deg, #8f7200 0%, #d4a500 100%)",
          borderColor: "rgba(255, 204, 0, 0.7)",
          boxShadow: "0 0 16px rgba(255, 204, 0, 0.4)",
        },
        "&.Mui-disabled": {
          background: "rgba(80, 65, 10, 0.35)",
          border: "1px solid rgba(255, 204, 0, 0.15)",
          color: "rgba(255, 255, 255, 0.28)",
          boxShadow: "none",
        },
      }}
      className={className}
      disabled={disabled || loading}
      onClick={handleClick}
    >
      {loading
        ? "Gerando modelo..."
        : modo === "clientes"
        ? "Baixar modelo clientes"
        : modo === "leads"
        ? "Baixar modelo leads"
        : ""}
    </Button>
  );
}
