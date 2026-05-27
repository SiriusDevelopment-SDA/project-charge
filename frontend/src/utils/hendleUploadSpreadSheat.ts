import * as XLSX from "xlsx";
import { toast } from "react-toastify";
import type { Cliente, Lead } from "../types";
import {
  extrairDocumentosClientes,
  extrairLeads,
  getTipoPlanilha,
  todasColunasPreenchidas,
  validarArquivo,
} from "./validation";
import { ClientService } from "../services/client/client.service";
import { normalizeDoc } from "./document";

type HandleUploadParams = {
  file: File;
  clients: Cliente[];
  setQuery?: (q: string) => void;
  setSelectedClientes: (clientes: Cliente[]) => void;
  setSelectedLeads?: (updater: (prev: Lead[]) => Lead[]) => void;
  processarDocumentos: (docs: string[]) => void;
  account?: string | null;
};

export async function handleUploadPlanilha({
  file,
  clients,
  setSelectedClientes,
  setSelectedLeads,
  processarDocumentos,
  account,
}: HandleUploadParams) {
  try {
    const res = await file.arrayBuffer();
    const workbook = XLSX.read(res);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

    const data = rows.filter((row) =>
      Object.values(row).some(
        (value) => value !== undefined && value !== null && String(value).trim() !== ""
      )
    );

    validarArquivo(file);
    const tipo = getTipoPlanilha(file.name);

    if (tipo === "cliente") {
      const documents = extrairDocumentosClientes(data);
      if (!documents.length) {
        toast.warning("Nenhum cliente valido encontrado");
        return;
      }

      processarDocumentos(documents);

      // Mapa doc → linha original, usado como fonte de verdade quando o cliente
      // não é encontrado no banco (empresas sem integração ERP).
      const rowByDoc = new Map<string, Record<string, string>>();
      for (const row of data) {
        const doc = normalizeDoc(String(row.cnpj_cpf ?? ""));
        if (doc.length === 11 || doc.length === 14) {
          rowByDoc.set(doc, row);
        }
      }

      const normalizedDocs = documents.map(normalizeDoc).filter(Boolean);
      const fromLoadedClients = clients.filter((client) =>
        normalizedDocs.includes(normalizeDoc(client.cnpj_cpf))
      );

      const foundByDoc = new Map(
        fromLoadedClients.map((client) => [normalizeDoc(client.cnpj_cpf), client])
      );
      const missingDocs = normalizedDocs.filter((doc) => !foundByDoc.has(doc));

      if (missingDocs.length && account) {
        const lookups = await Promise.all(
          missingDocs.map(async (doc) => {
            try {
              const response = await ClientService.searchClients({
                account,
                query: doc,
                page: 1,
                limit: 10,
                sortorder: "DESC",
                relationService: false,
              });

              return (response.data.data ?? []).find(
                (client) => normalizeDoc(client.cnpj_cpf) === doc
              );
            } catch {
              return undefined;
            }
          })
        );

        lookups.forEach((client) => {
          if (client) {
            foundByDoc.set(normalizeDoc(client.cnpj_cpf), client);
          }
        });
      }

      // Fallback: para CPFs não encontrados no banco, monta cliente "stateless"
      // a partir da própria linha da planilha (precisa de whatsapp; nome é opcional).
      const stillMissing = normalizedDocs.filter((doc) => !foundByDoc.has(doc));
      const fallbackBuilt: string[] = [];
      const noFallbackAvailable: string[] = [];

      for (const doc of stillMissing) {
        const row = rowByDoc.get(doc);
        const whatsapp = String(row?.whatsapp ?? "").replace(/\D/g, "");
        if (whatsapp.length >= 10) {
          const nome = String(row?.nome_cliente ?? "").trim() || `Cliente ${doc}`;
          foundByDoc.set(doc, {
            id: `stateless:${doc}`,
            cnpj_cpf: doc,
            name: nome,
            whatsapp,
            company: account
              ? { id: "", name: "", account }
              : undefined,
          });
          fallbackBuilt.push(doc);
        } else {
          noFallbackAvailable.push(doc);
        }
      }

      if (fallbackBuilt.length) {
        toast.info(
          `${fallbackBuilt.length} cliente(s) montado(s) a partir da planilha (sem consulta ao ERP).`,
        );
      }

      noFallbackAvailable.forEach((doc) =>
        toast.warning(
          `Cliente ${doc} nao foi encontrado e nao possui whatsapp na planilha. Preencha a coluna whatsapp ou revise o cpf_cnpj.`,
        ),
      );

      const finalClients = normalizedDocs
        .map((doc) => foundByDoc.get(doc))
        .filter((client): client is Cliente => Boolean(client));

      if (!finalClients.length) {
        toast.error("Nenhum cliente foi encontrado, revise os documentos enviados!");
        return;
      }

      setSelectedClientes(finalClients);
      toast.success(`${finalClients.length} clientes importados da planilha`);
      return;
    }

    if (tipo === "lead") {
      const leads = extrairLeads(data);
      if (!leads.length) {
        toast.warning("Nenhum lead encontrado na planilha");
        return;
      }

      const leadsValidos = leads.filter((lead) => {
        if (!todasColunasPreenchidas(lead)) {
          toast.warning("Lead ignorado por colunas obrigatorias vazias.");
          return false;
        }

        if (lead.status === "invalido") {
          toast.error(`Lead invalido: ${lead.whatsapp}. Use o padrao 5511999999999`, {
            autoClose: 6000,
          });
          return false;
        }

        return true;
      });

      if (!leadsValidos.length) {
        toast.warning("Nenhum lead valido para importar");
        return;
      }

      const importedLeads = Array.from(
        new Map(
          leadsValidos.map((lead) => [
            String(lead.whatsapp ?? "").trim(),
            { ...lead, inputSource: "spreadsheet" as const },
          ])
        ).values()
      );

      setSelectedLeads?.(() => importedLeads);
      toast.success(`${importedLeads.length} leads importados`);
      return;
    }

    toast.error("Tipo de planilha nao reconhecido. Nunca altere o nome do arquivo!");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao processar planilha";
    toast.error(message);
  }
}
