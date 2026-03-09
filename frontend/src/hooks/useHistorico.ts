import { useContext } from "react"
import { HistoricoContext } from "../context/contextHistorico"

export function useHistorico() {
  const context = useContext(HistoricoContext);
  if (context === null) {
    throw new Error("useHistorico must be used within a HistoricoProvider");
  }
  return context;
}
