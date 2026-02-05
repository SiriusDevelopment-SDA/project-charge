import { useContext } from "react"
import { HistoricoContext } from "../context/contextHistorico"

export function useHistorico() {
return useContext(HistoricoContext)
}
