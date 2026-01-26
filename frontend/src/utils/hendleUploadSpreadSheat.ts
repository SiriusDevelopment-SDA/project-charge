import * as XLSX from "xlsx"
import { toast } from "react-toastify"
import type { Cliente, Lead } from "../types"
import { extrairDocumentosClientes, extrairLeads, getTipoPlanilha, todasColunasPreenchidas, validarArquivo } from "./validation"

type HandleUploadParams = {
  file: File
  clients: Cliente[]
  setQuery: (q: string) => void
  setSelectedClientes: React.Dispatch<React.SetStateAction<Cliente[]>>
  setSelectedLeads: React.Dispatch<React.SetStateAction<Lead[]>>
  processarDocumentos: (docs: string[]) => void
}

export async function handleUploadPlanilha({
  file,
  clients,
  setQuery,
  setSelectedClientes,
  setSelectedLeads,
  processarDocumentos
}: HandleUploadParams) {
  try {
    const res = await file.arrayBuffer()
    const workbook = XLSX.read(res)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]

    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet)

    const data = rows.filter(row =>
      Object.values(row).some(
        value => value !== undefined && value !== null && String(value).trim() !== ""
      )
    )

    validarArquivo(file)
    const tipo = getTipoPlanilha(file.name)

    /* ===========================
       CLIENTES
    =========================== */
    if (tipo === "cliente") {
      const documents = extrairDocumentosClientes(data)

      if (documents.length === 0) {
        toast.warning("Nenhum cliente válido encontrado")
        return
      }

      processarDocumentos(documents)

      documents.forEach((cnpjCpf, index) => {
        setTimeout(() => setQuery(cnpjCpf), index * 1000)
      })

      setSelectedClientes(prev => {
        const clientesFromPlanilha = clients.filter(cliente =>
          documents.includes(cliente.cnpj_cpf.replace(/\D/g, ""))
        )

        const novosClientes = clientesFromPlanilha.filter(
          cliente => !prev.some(c => c.cnpj_cpf === cliente.cnpj_cpf)
        )

        return [...prev, ...novosClientes]
      })

      toast.success(`${documents.length} clientes importados`)
      return
    }

    /* ===========================
       LEADS
    =========================== */
    if (tipo === "lead") {
      const leads = extrairLeads(data)

      if (leads.length === 0) {
        toast.warning("Nenhum lead encontrado na planilha")
        return
      }

      const leadsValidos = leads.filter(lead => {
        todasColunasPreenchidas(lead)

        if (lead.status === "inválido") {
          toast.error(
            `Lead inválido: ${lead.whatsapp}. Use o padrão 5511999999999`,
            { autoClose: 6000 }
          )
          return false
        }

        return true
      })

      if (leadsValidos.length === 0) {
        toast.warning("Nenhum lead válido para importar")
        return
      }

      setSelectedLeads(prev => {
        const novosLeads = leadsValidos.filter(
          lead => !prev.some(p => p.whatsapp === lead.whatsapp)
        )
        return [...prev, ...novosLeads]
      })

      toast.success(`${leadsValidos.length} leads importados`)
      return
    }

    toast.error("Tipo de planilha não reconhecido. Nunca altere o nome do arquivo!")

  } catch (err: any) {
    toast.error(err?.message || "Erro ao processar planilha")
  }
}
