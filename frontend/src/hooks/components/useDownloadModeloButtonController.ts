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
  const disabled = !templateSelecionado;

  const handleClick = async () => {
    if (disabled) return;

    try {
      setLoading(true);
      gerarModeloPlanilha(templateSelecionado, modo ?? "clientes");
    } finally {
      setLoading(false);
    }
  };

  return {
    disabled,
    loading,
    handleClick,
  };
}
