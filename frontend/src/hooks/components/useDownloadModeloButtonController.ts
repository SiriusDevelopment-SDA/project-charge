import { useState } from "react";
import type { Template } from "../../types";
import { gerarModeloPlanilha } from "../../utils/validation";

type Params = {
  templateSelecionado?: Template | null;
  modo?: "clientes" | "leads";
};

export function useDownloadModeloButtonController({
  templateSelecionado,
  modo,
}: Params) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    try {
      setLoading(true);

      if (modo === "clientes") {
        gerarModeloPlanilha(null, "clientes");
        return;
      }

      if (modo === "leads" && templateSelecionado) {
        gerarModeloPlanilha(templateSelecionado, "leads");
      }
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    handleClick,
  };
}
