import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Client } from "../clients/entities.ts/clients";
import { Templates } from "./entities/templatesMeta";
import { RelatoryDispatchTemplate } from "./entities/relatory.entity";
import type { MessageQueuePayload } from "../message-queue/entities/message-queue.entity";
import { IXCInvoicesService } from "../invoices/services/ixcInvoicesService";
import { HubsoftInvoicesService } from "../invoices/services/hubsoftInvoicesService";
import { SGPInvoicesService } from "../invoices/services/sgpInvoicesService";
import { MkInvoicesService } from "../invoices/services/mkInvoicesService";
import { GamaIspInvoicesService } from "../invoices/services/gamaIspInvoicesService";
import { InvoiceMapResultDto } from "../invoices/dto/search.request.dto.invoices";
import {
  ehTipoChavePix,
  resolverChavePix,
} from "../companies/config.contract";
import {
  classifyErpFailure,
  describeErpFailure,
  type ErpFailure,
} from "../integrations/erp/erp-failure";

export type DispatchSkipReason =
  | "missing_contact"
  | "missing_client_or_invoice"
  | "invoice_not_open_in_erp"
  /**
   * O ERP nao respondeu (rede, timeout, 5xx, corpo quebrado). NAO se sabe se o
   * cliente tem fatura em aberto — e o unico motivo que autoriza o agendador a
   * manter a campanha pendente e tentar de novo.
   */
  | "erp_unavailable"
  /**
   * O ERP respondeu recusando a credencial, ou a integracao esta mal
   * configurada. Repetir nao muda a resposta: fica registrado para alguem ver.
   */
  | "erp_integration_error"
  | "template_variables_incomplete"
  | "duplicate_dispatch_today";

export type DispatchSkipRecord = {
  reason: DispatchSkipReason;
  number?: string;
  name?: string;
  clientId?: string;
  invoiceId?: string;
  detail?: string;
};

export type BuildQueueRecipientsResult = {
  recipients: MessageQueuePayload[];
  skips: DispatchSkipRecord[];
};

/**
 * Telefone do destinatario a partir da linha do disparo, em digitos.
 *
 * Exportado porque o agendador precisa comparar a linha da campanha com o que
 * ja foi enfileirado hoje ANTES de montar o payload (para o retry nao reprocessar
 * quem ja recebeu). Se cada lado normalizasse do seu jeito, a comparacao falharia
 * em silencio e o cliente receberia duas vezes.
 */
export function normalizeDispatchNumber(row: Record<string, unknown>): string {
  return String(row.whatsapp ?? row.number ?? "").replace(/\D/g, "");
}

const INVOICE_VARIABLE_KEYS = new Set([
  "data_vencimento_fatura",
  "numero_contrato",
  "valor_fatura",
  "linha_digitavel_boleto",
  "link_boleto_pdf",
  "code_pix",
  "codigo_qr",
  "codigo_qr_code",
  "codigo_pix",
]);

/** Formato de `Client.id` (uuid). Ver o uso em `buildQueueRecipients`. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PIX_VARIABLE_KEYS = new Set([
  "code_pix",
  "codigo_qr",
  "codigo_qr_code",
  "codigo_pix",
]);

type TemplateVars = Record<string, string>;
type BlueprintComponent = Record<string, unknown>;
type BlueprintButton = Record<string, unknown>;
type MappedScalar = Record<string, string | undefined>;

/**
 * Quem e o destinatario em construcao, para o log dizer QUAL empresa e QUAL
 * cliente ficaram de fora quando um botao nao pode ser montado. Sem isso o
 * aviso e inacionavel numa campanha de milhares de linhas.
 */
type DispatchContext = { companyId: string; clientId: string };

@Injectable()
export class TemplateDispatchPayloadService {
  private readonly logger = new Logger(TemplateDispatchPayloadService.name);

  constructor(
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(RelatoryDispatchTemplate)
    private readonly relatoryRepo: Repository<RelatoryDispatchTemplate>,
    private readonly ixcService: IXCInvoicesService,
    private readonly hubsoftService: HubsoftInvoicesService,
    private readonly sgpService: SGPInvoicesService,
    private readonly mkService: MkInvoicesService,
    private readonly gamaIspService: GamaIspInvoicesService,
  ) {}

  templateRequiresInvoiceData(template: Templates): boolean {
    const vars = this.parseTemplateVars(template.variables);
    const usesInvoiceVar = Object.values(vars).some((v) =>
      INVOICE_VARIABLE_KEYS.has(String(v).trim()),
    );
    if (usesInvoiceVar) return true;

    const comps = this.normalizeComponents(template.components);
    for (const c of comps) {
      const t = String(c?.type ?? "").toUpperCase();
      if (
        t === "HEADER" &&
        String(c?.format ?? "").toUpperCase() === "DOCUMENT"
      ) {
        return true;
      }
      if (t === "BUTTON" || t === "BUTTONS") {
        const buttons: BlueprintButton[] = Array.isArray(c?.buttons)
          ? (c.buttons as BlueprintButton[])
          : c?.sub_type
            ? [{ type: c.sub_type as string, text: c.text as string }]
            : [];
        for (const b of buttons) {
          const bt = String(b?.type ?? b?.sub_type ?? "").toUpperCase();
          if (bt === "ORDER_DETAILS" || bt === "URL" || bt === "COPY_CODE") {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Detecta se o template realmente usa PIX dinâmico — seja por variável de
   * corpo (code_pix/codigo_qr/codigo_qr_code/codigo_pix) ou por botão
   * ORDER_DETAILS/COPY_CODE. Usado para só buscar o PIX no ERP quando faz
   * diferença, evitando N chamadas em templates que só usam texto/boleto.
   */
  templateRequiresPix(template: Templates): boolean {
    const vars = this.parseTemplateVars(template.variables);
    const usesPixVar = Object.values(vars).some((v) =>
      PIX_VARIABLE_KEYS.has(String(v).trim()),
    );
    if (usesPixVar) return true;

    const comps = this.normalizeComponents(template.components);
    return this.extractButtons(comps).some((b) => {
      const bt = String(b?.type ?? b?.sub_type ?? "").toUpperCase();
      return bt === "ORDER_DETAILS" || bt === "COPY_CODE";
    });
  }

  async buildQueueRecipients(
    template: Templates,
    _companyId: string,
    rows: Record<string, unknown>[],
  ): Promise<BuildQueueRecipientsResult> {
    if (!rows.length) return { recipients: [], skips: [] };

    const requiresInvoice = this.templateRequiresInvoiceData(template);
    const requiresPix = requiresInvoice && this.templateRequiresPix(template);
    // `Client.id` e coluna uuid: um id fora do formato faz o Postgres recusar o
    // `IN` INTEIRO ("invalid input syntax for type uuid") e a excecao sobe antes
    // de qualquer `persistDispatchSkips` — o lote morre com 500 e nem no
    // relatorio fica. E entra id assim por caminho legitimo: o upload de
    // planilha monta cliente "stateless" (`stateless:<doc>`) para CPF sem
    // cadastro. Filtrar aqui degrada isso para o que ja existe logo abaixo:
    // cliente nao encontrado vira skip individual, com motivo, e o resto do
    // lote segue.
    const clientIds = [
      ...new Set(
        rows
          .map((r) => String(r.clientId ?? "").trim())
          .filter((id) => UUID_PATTERN.test(id)),
      ),
    ];

    const clients =
      clientIds.length > 0
        ? await this.clientRepo.find({
            where: { id: In(clientIds) },
            relations: { company: true },
          })
        : [];

    const clientById = new Map(clients.map((c) => [c.id, c]));

    const ixcByClient = new Map<string, Map<string, InvoiceMapResultDto>>();
    const hubsoftByClient = new Map<string, InvoiceMapResultDto[]>();
    const sgpByClient = new Map<string, InvoiceMapResultDto[]>();
    const mkByClient = new Map<string, InvoiceMapResultDto[]>();
    const gamaIspByClient = new Map<string, InvoiceMapResultDto[]>();
    /**
     * Clientes cujo preload FALHOU, com a natureza da falha. E o que separa
     * "o ERP disse que nao ha fatura" de "o ERP nao respondeu": sem este mapa
     * os dois chegam ao loop abaixo como lista vazia.
     */
    const erpFailureByClient = new Map<string, ErpFailure>();

    if (requiresInvoice) {
      const uniqueClients = [...new Set(clients.map((c) => c.id))];
      await Promise.allSettled(
        uniqueClients.map(async (cid) => {
          const client = clientById.get(cid);
          if (!client?.company) return;
          const erp = String(client.company.erp ?? "").toUpperCase();
          try {
            if (erp === "IXC") {
              const response = await this.ixcService.getInvoices(client);
              const m = new Map<string, InvoiceMapResultDto>();
              for (const t of response.list ?? []) {
                m.set(String(t.invoice_id), t);
              }
              ixcByClient.set(cid, m);
            } else if (erp === "HUBSOFT") {
              const res = await this.hubsoftService.getInvoices(client);
              hubsoftByClient.set(cid, res.list ?? []);
            } else if (erp === "SGP") {
              const res = await this.sgpService.getInvoices(client);
              sgpByClient.set(cid, res.list ?? []);
            } else if (erp === "MK") {
              const res = await this.mkService.getInvoices(client);
              mkByClient.set(cid, res.list ?? []);
            } else if (erp === "GAMAISP") {
              const res = await this.gamaIspService.getInvoices(client);
              gamaIspByClient.set(cid, res.list ?? []);
            }
          } catch (e) {
            const failure = classifyErpFailure(e);
            erpFailureByClient.set(cid, failure);
            this.logger.warn(
              `ERP preload falhou client=${cid} erp=${erp} causa=${failure.cause} ` +
                `transitorio=${failure.transient} http=${failure.httpStatus ?? "-"}: ${failure.message}`,
            );
          }
        }),
      );

      // IXC não traz PIX no snapshot do getInvoices (removido em a06ef94 por
      // performance). Quando o template usa PIX, buscamos o code_pix on-demand
      // apenas das faturas que serão realmente disparadas, de forma concorrente.
      if (requiresPix) {
        await this.preloadIxcPix(rows, clientById, ixcByClient);
      }
    }

    const templateVars = this.parseTemplateVars(template.variables);
    const templateComponents = this.normalizeComponents(template.components);

    const out: MessageQueuePayload[] = [];
    const skips: DispatchSkipRecord[] = [];

    for (const row of rows) {
      const number = normalizeDispatchNumber(row);
      const name = String(row.nome_cliente ?? row.name ?? "").trim();
      if (!number || !name) {
        skips.push({
          reason: "missing_contact",
          detail: "Telefone ou nome ausente na linha do disparo.",
        });
        continue;
      }

      const clientId = String(row.clientId ?? "").trim();
      const client = clientId ? clientById.get(clientId) : undefined;

      let merged = this.rowToScalars(row);

      if (requiresInvoice) {
        if (!client?.company) {
          skips.push({
            reason: "missing_client_or_invoice",
            number,
            name,
            clientId: clientId || undefined,
            detail: "clientId ausente ou cliente nao encontrado.",
          });
          continue;
        }

        const erp = String(client.company.erp ?? "").toUpperCase();
        const ixcMap = ixcByClient.get(client.id);
        const hubList = hubsoftByClient.get(client.id);
        const sgpList = sgpByClient.get(client.id);
        const mkList = mkByClient.get(client.id);
        const gamaIspList = gamaIspByClient.get(client.id);

        const invoiceId = String(row.invoice_id ?? "").trim();

        if (!invoiceId) {
          skips.push({
            reason: "missing_client_or_invoice",
            number,
            name,
            clientId,
            detail: "Fatura de referência ausente no snapshot da campanha.",
          });
          continue;
        }

        this.logger.log(
          `[Dispatch] erp=${erp} clientId=${client.id} invoiceId=${invoiceId} ` +
            `ixcMapSize=${ixcMap?.size ?? "no-entry"} hubListLen=${hubList?.length ?? "no-entry"} sgpListLen=${sgpList?.length ?? "no-entry"} mkListLen=${mkList?.length ?? "no-entry"} gamaIspListLen=${gamaIspList?.length ?? "no-entry"}`,
        );

        const fresh = await this.buildDispatchScalars(
          client,
          erp,
          invoiceId,
          ixcMap,
          hubList,
          sgpList,
          mkList,
          gamaIspList,
        );
        if (!fresh) {
          // A fatura nao foi encontrada. Duas causas MUITO diferentes chegam
          // aqui do mesmo jeito (lista vazia), e o relatorio precisa dizer qual
          // foi: o cliente quitou, ou o ERP nao respondeu por este cliente.
          const failure = erpFailureByClient.get(client.id);
          skips.push({
            reason: failure
              ? failure.transient
                ? "erp_unavailable"
                : "erp_integration_error"
              : "invoice_not_open_in_erp",
            number,
            name,
            clientId,
            invoiceId,
            detail: failure
              ? describeErpFailure(failure)
              : "Nenhuma fatura em aberto encontrada no ERP para este cliente no momento do disparo.",
          });
          continue;
        }
        merged = { ...merged, ...fresh };

        // Garante campos da empresa para montagem do botão ORDER_DETAILS.
        // Usa como fallback — não sobrescreve valor já presente no snapshot.
        const companyName = String(client.company?.name ?? "")
          .trim()
          .toLowerCase();
        if (!merged.nome_empresa && companyName)
          merged.nome_empresa = companyName;
        if (!merged.order_pix_merchant_name && companyName)
          merged.order_pix_merchant_name = companyName;
        // A chave PIX sai da MESMA funcao que o cron de promessa usa
        // (`resolverChavePix`): sobreposicao configurada quando existe, CNPJ da
        // empresa com tipo `CNPJ` no caso normal. Antes daqui saia o CNPJ
        // direto, com o tipo fixo no codigo — o que estava certo para o
        // negocio, mas deixava chave de e-mail, telefone ou aleatoria
        // inalcancavel para a empresa que registrou uma dessas no PSP.
        //
        // O que NAO existe, aqui nem la, e chave de reserva: empresa sem chave
        // e sem CNPJ nao monta botao e o destinatario e pulado com log. Ver o
        // docblock de `resolverChavePix`.
        //
        // Continua sendo fallback quanto ao SNAPSHOT: nao sobrescreve o que a
        // campanha ja trouxe.
        if (!merged.order_pix_key) {
          const chavePix = resolverChavePix(client.company);
          if (chavePix) {
            merged.order_pix_key = chavePix.key;
            merged.order_pix_key_type = chavePix.keyType;
          }
        }
      }

      const built = this.buildRecipientFromBlueprint(
        templateVars,
        templateComponents,
        merged,
        {
          companyId: String(client?.company?.id ?? ""),
          clientId,
        },
      );
      if (!built) {
        skips.push({
          reason: "template_variables_incomplete",
          number,
          name,
          clientId: clientId || undefined,
          invoiceId: String(row.invoice_id ?? "").trim() || undefined,
          detail:
            "Variáveis obrigatórias do template não puderam ser preenchidas.",
        });
        continue;
      }

      const components = this.applyOrderDetailsReferenceId(
        built.components,
        template.variables,
        merged.numero_contrato,
      );

      out.push({
        number,
        name,
        components,
      });
    }

    return { recipients: out, skips };
  }

  async persistDispatchSkips(
    template: Templates,
    companyId: string,
    campaignId: string | null,
    batchId: string | null,
    skips: DispatchSkipRecord[],
  ): Promise<void> {
    if (!skips.length) return;

    const rows = skips.map((s) =>
      this.relatoryRepo.create({
        name: s.name?.trim() || s.number || "—",
        number: s.number ?? "",
        date_dispatch: new Date(),
        status_sent: "skipped",
        message: s.detail ?? this.formatSkipSummary(s),
        template: { id: template.id },
        company: { id: companyId },
        campaign: campaignId ? { id: campaignId } : null,
        batchId,
        components_maped: {
          reason: s.reason,
          invoice_id: s.invoiceId ?? null,
          clientId: s.clientId ?? null,
        },
        response: false,
      }),
    );

    await this.relatoryRepo.save(rows);
  }

  private formatSkipSummary(s: DispatchSkipRecord): string {
    switch (s.reason) {
      case "missing_contact":
        return "Destinatário ignorado: telefone ou nome ausente.";
      case "missing_client_or_invoice":
        return "Destinatário ignorado: vínculo cliente/fatura incompleto.";
      case "invoice_not_open_in_erp":
        return `Fatura ${s.invoiceId ?? ""} indisponível ou quitada no ERP.`;
      case "erp_unavailable":
        return "Mensagem não enviada: o ERP não respondeu no momento do disparo.";
      case "erp_integration_error":
        return "Mensagem não enviada: o ERP recusou a consulta (credencial ou configuração da integração).";
      case "template_variables_incomplete":
        return "Destinatário ignorado: dados insuficientes para o template.";
      case "duplicate_dispatch_today":
        return "Mensagem não enviada: Este destinatário já recebeu disparo hoje.";
      default:
        return "Destinatário ignorado.";
    }
  }

  private rowToScalars(row: Record<string, unknown>): MappedScalar {
    const out: MappedScalar = {};
    for (const [k, v] of Object.entries(row)) {
      if (v === undefined || v === null) continue;
      if (k === "components") continue;
      out[k] = typeof v === "string" ? v : String(v);
    }
    return out;
  }

  private async buildDispatchScalars(
    client: Client,
    erp: string,
    invoiceId: string,
    ixcMap: Map<string, InvoiceMapResultDto> | undefined,
    hubList: InvoiceMapResultDto[] | undefined,
    sgpList: InvoiceMapResultDto[] | undefined,
    mkList: InvoiceMapResultDto[] | undefined,
    gamaIspList: InvoiceMapResultDto[] | undefined,
  ): Promise<MappedScalar | null> {
    if (erp === "IXC") {
      const inv = ixcMap?.get(invoiceId);
      if (!inv) return null;

      this.logger.log(
        `[Dispatch] IXC invoice resolved: requested=${invoiceId} resolved=${inv.invoice_id} ` +
          `code_pix="${inv.code_pix ?? "NULL"}" contract_id="${inv.contract_id}" amount="${inv.invoice_amount}"`,
      );

      const pixCode = String(inv.code_pix ?? "");
      return {
        invoice_id: String(inv.invoice_id ?? invoiceId),
        numero_contrato: String(inv.contract_id ?? ""),
        data_vencimento_fatura: String(inv.invoice_due_date ?? ""),
        valor_fatura: String(inv.invoice_amount ?? ""),
        linha_digitavel_boleto: String(inv.ticket_digitable_line ?? ""),
        link_boleto_pdf: String(inv.ticket_pdf_link ?? ""),
        code_pix: pixCode,
        codigo_qr: pixCode,
        codigo_qr_code: pixCode,
        codigo_pix: pixCode,
        order_reference_id: String(inv.contract_id ?? ""),
      };
    }

    if (erp === "HUBSOFT") {
      const inv = hubList?.find((x) => String(x.invoice_id) === invoiceId);
      if (!inv) return null;

      return {
        invoice_id: invoiceId,
        numero_contrato: String(inv.contract_id ?? ""),
        data_vencimento_fatura: String(inv.invoice_due_date ?? ""),
        valor_fatura: String(inv.invoice_amount ?? ""),
        linha_digitavel_boleto: String(inv.ticket_digitable_line ?? ""),
        link_boleto_pdf: String(inv.ticket_pdf_link ?? ""),
        code_pix: undefined,
        codigo_qr: undefined,
        codigo_qr_code: undefined,
        codigo_pix: undefined,
        order_reference_id: String(inv.contract_id ?? ""),
      };
    }

    if (erp === "SGP") {
      const inv = sgpList?.find((x) => String(x.invoice_id) === invoiceId);
      if (!inv) return null;

      return {
        invoice_id: invoiceId,
        numero_contrato: String(inv.contract_id ?? ""),
        data_vencimento_fatura: String(inv.invoice_due_date ?? ""),
        valor_fatura: String(inv.invoice_amount ?? ""),
        linha_digitavel_boleto: String(inv.ticket_digitable_line ?? ""),
        link_boleto_pdf: String(inv.ticket_pdf_link ?? ""),
        code_pix: inv.code_pix ?? undefined,
        codigo_qr: inv.code_pix ?? undefined,
        codigo_qr_code: inv.code_pix ?? undefined,
        codigo_pix: inv.code_pix ?? undefined,
        order_reference_id: String(inv.contract_id ?? ""),
      };
    }

    if (erp === "MK") {
      const inv = mkList?.find((x) => String(x.invoice_id) === invoiceId);
      if (!inv) return null;

      // MK não traz PIX no snapshot (fica null de propósito para não dobrar o
      // volume da sync). Aqui, no disparo, buscamos o PIX on-demand por
      // CodigoFatura (= id_fatura). Se vier null (conta sem PIX ou falha
      // isolada), deixa vazio — o PDF do boleto (header DOCUMENT) já cobre.
      const pixCode =
        (await this.mkService.fetchPixByInvoice(client.company, invoiceId)) ??
        "";

      return {
        invoice_id: invoiceId,
        numero_contrato: String(inv.contract_id ?? ""),
        data_vencimento_fatura: String(inv.invoice_due_date ?? ""),
        valor_fatura: String(inv.invoice_amount ?? ""),
        linha_digitavel_boleto: String(inv.ticket_digitable_line ?? ""),
        link_boleto_pdf: String(inv.ticket_pdf_link ?? ""),
        code_pix: pixCode,
        codigo_qr: pixCode,
        codigo_qr_code: pixCode,
        codigo_pix: pixCode,
        order_reference_id: String(inv.contract_id ?? ""),
      };
    }

    if (erp === "GAMAISP") {
      const inv = gamaIspList?.find((x) => String(x.invoice_id) === invoiceId);
      if (!inv) return null;

      // A Gama ISP traz o PIX (pix_qrcode) no mesmo payload das faturas — mas
      // nao em todas. Producao (POWERNET, 02/09/2026) devolveu fatura EM ABERTO
      // com valor e vencimento e `pix_qrcode` null: sem PIX o botao
      // ORDER_DETAILS nao monta e o destinatario inteiro e pulado.
      //
      // Quando vier vazio, perguntamos pela fatura especifica
      // (`GET /api/v1/faturas/id/{id}`), que devolve o registro completo. O
      // custo e uma chamada extra POR FATURA SEM PIX, limitada pelo semaforo da
      // empresa (3 simultaneas) — so no caminho que hoje simplesmente falha.
      let pixCode = String(inv.code_pix ?? "");

      if (!pixCode) {
        pixCode =
          (await this.gamaIspService.fetchPixByInvoice(
            client.company,
            invoiceId,
          )) ?? "";
      }

      return {
        invoice_id: invoiceId,
        numero_contrato: String(inv.contract_id ?? ""),
        data_vencimento_fatura: String(inv.invoice_due_date ?? ""),
        valor_fatura: String(inv.invoice_amount ?? ""),
        linha_digitavel_boleto: String(inv.ticket_digitable_line ?? ""),
        // Sem link de PDF nesta entrega: a Gama ISP so devolve o boleto como
        // base64 num endpoint proprio, sem URL publica. Ver
        // `gamaIspInvoicesService.ts` (ticket_pdf_link e sempre null).
        link_boleto_pdf: "",
        code_pix: pixCode,
        codigo_qr: pixCode,
        codigo_qr_code: pixCode,
        codigo_pix: pixCode,
        order_reference_id: String(inv.contract_id ?? ""),
      };
    }

    return null;
  }

  /**
   * Busca o code_pix on-demand no ERP IXC apenas para as faturas que serão
   * disparadas nesta campanha e que ainda não têm PIX no snapshot. Popula o
   * campo `code_pix` diretamente nos InvoiceMapResultDto do `ixcByClient`, de
   * modo que `buildDispatchScalars` (branch IXC) já leia o valor sem mudanças.
   *
   * - Concorrente (`Promise.allSettled`) para não reintroduzir o gargalo que
   *   motivou a remoção da busca inline em a06ef94.
   * - Idempotente: nunca sobrescreve um PIX já presente no snapshot.
   * - Tolerante a falha: PIX indisponível segue vazio e não bloqueia o disparo.
   */
  private async preloadIxcPix(
    rows: Record<string, unknown>[],
    clientById: Map<string, Client>,
    ixcByClient: Map<string, Map<string, InvoiceMapResultDto>>,
  ): Promise<void> {
    const pending = new Map<
      string,
      { companyId: string; invoiceId: string; inv: InvoiceMapResultDto }
    >();

    for (const row of rows) {
      const clientId = String(row.clientId ?? "").trim();
      const invoiceId = String(row.invoice_id ?? "").trim();
      if (!clientId || !invoiceId) continue;

      const company = clientById.get(clientId)?.company;
      if (!company) continue;
      if (String(company.erp ?? "").toUpperCase() !== "IXC") continue;

      const inv = ixcByClient.get(clientId)?.get(invoiceId);
      if (!inv) continue;
      // Idempotência: não busca de novo se o snapshot já trouxe PIX.
      if (String(inv.code_pix ?? "").trim()) continue;

      pending.set(`${company.id}:${invoiceId}`, {
        companyId: company.id,
        invoiceId,
        inv,
      });
    }

    if (pending.size === 0) return;

    await Promise.allSettled(
      [...pending.values()].map(async ({ companyId, invoiceId, inv }) => {
        try {
          const { pix } = await this.ixcService.getPixByInvoice({
            companyId,
            invoiceId,
          });
          if (pix) inv.code_pix = pix;
        } catch (e) {
          this.logger.warn(
            `[Dispatch] IXC PIX preload falhou company=${companyId} invoiceId=${invoiceId}: ${
              e instanceof Error ? e.message : e
            }`,
          );
        }
      }),
    );
  }

  private parseTemplateVars(variables: Templates["variables"]): TemplateVars {
    try {
      return typeof variables === "string"
        ? (JSON.parse(variables) as TemplateVars)
        : (variables ?? {});
    } catch {
      return {};
    }
  }

  private normalizeComponents(
    raw: Templates["components"],
  ): BlueprintComponent[] {
    if (Array.isArray(raw)) return raw as BlueprintComponent[];
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as BlueprintComponent[];
        if (
          parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { components?: unknown }).components)
        ) {
          return (parsed as { components: BlueprintComponent[] }).components;
        }
        return [];
      } catch {
        return [];
      }
    }
    if (
      raw &&
      typeof raw === "object" &&
      Array.isArray((raw as { components?: unknown }).components)
    ) {
      return (raw as { components: BlueprintComponent[] }).components;
    }
    return [];
  }

  private extractButtons(comps: BlueprintComponent[]): BlueprintButton[] {
    return comps
      .filter((c) => {
        const t = String(c?.type ?? "").toUpperCase();
        return t === "BUTTON" || t === "BUTTONS";
      })
      .flatMap((c) =>
        Array.isArray(c?.buttons)
          ? (c.buttons as BlueprintButton[])
          : c?.sub_type
            ? [{ type: c.sub_type, index: c.index }]
            : [],
      );
  }

  private parseAmountToCents(value?: string): number {
    if (!value) return 0;
    const clean = value.replace(/[R$\s]/g, "");
    const normalized = clean.includes(",")
      ? clean.replace(/\./g, "").replace(",", ".")
      : clean;
    const parsed = parseFloat(normalized);
    if (Number.isNaN(parsed)) return 0;
    return Math.round(parsed * 100);
  }

  private buildRecipientFromBlueprint(
    templateVars: TemplateVars,
    templateComponents: BlueprintComponent[],
    mapped: MappedScalar,
    contexto: DispatchContext,
  ): { components: MessageQueuePayload["components"] } | null {
    const hasDocumentHeader = templateComponents.some(
      (c) =>
        String(c?.type ?? "").toUpperCase() === "HEADER" &&
        String(c?.format ?? "").toUpperCase() === "DOCUMENT",
    );

    const buttonsBlueprint = this.extractButtons(templateComponents);

    const orderedKeys = Object.keys(templateVars)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => String(templateVars[k] ?? "").trim())
      .filter(Boolean);

    const bodyParameters = orderedKeys.map((varKey) => ({
      type: "text" as const,
      text: String(mapped[varKey] ?? ""),
    }));

    const emptyParam = bodyParameters.find((p) => !p.text.trim());
    if (emptyParam) {
      const emptyKey = orderedKeys[bodyParameters.indexOf(emptyParam)];
      this.logger.log(
        `[Dispatch] buildRecipient body param vazio: key=${emptyKey} ` +
          `mapped_keys=${JSON.stringify(Object.keys(mapped))} ` +
          `code_pix="${mapped.code_pix}" numero_contrato="${mapped.numero_contrato}"`,
      );
      return null;
    }

    const components: MessageQueuePayload["components"] = [];
    if (bodyParameters.length > 0) {
      components.push({ type: "BODY", parameters: bodyParameters });
    }

    if (hasDocumentHeader) {
      const pdfLink = String(mapped.link_boleto_pdf ?? "")
        .trim()
        .replace(/\/+$/, "");
      if (pdfLink) {
        components.push({
          type: "HEADER",
          parameters: [
            {
              type: "document",
              document: { link: pdfLink, filename: "fatura.pdf" },
            },
          ],
        });
      }
    }

    for (let i = 0; i < buttonsBlueprint.length; i++) {
      const button = buttonsBlueprint[i];
      const buttonType = String(
        button?.type ?? button?.sub_type ?? "",
      ).toUpperCase();
      if (buttonType === "QUICK_REPLY") continue;

      if (buttonType === "ORDER_DETAILS") {
        const oc = this.buildOrderDetailsComponent(
          button,
          i,
          mapped,
          contexto,
        );
        if (!oc) return null;
        components.push(oc);
        continue;
      }

      if (buttonType === "URL") {
        const urlTemplate = String(button?.url ?? "");
        const hasPlaceholder = /\{\{\d+\}\}/.test(urlTemplate);
        if (!hasPlaceholder) continue;
      }

      const bc = this.buildButtonComponent(button, i, buttonType, mapped);
      if (!bc && buttonType === "URL") return null;
      if (bc) components.push(bc);
    }

    return { components };
  }

  private buildOrderDetailsComponent(
    button: BlueprintButton,
    buttonIndex: number,
    mapped: MappedScalar,
    contexto: DispatchContext,
  ): MessageQueuePayload["components"][number] | null {
    const referenceId = String(
      mapped.numero_contrato ?? mapped.order_reference_id ?? "",
    ).trim();
    const pixCode = String(
      mapped.code_pix ??
        mapped.codigo_qr_code ??
        mapped.codigo_qr ??
        mapped.codigo_pix ??
        "",
    ).trim();
    const merchantName = String(
      mapped.order_pix_merchant_name ?? mapped.nome_empresa ?? "",
    ).trim();
    const amountCents = this.parseAmountToCents(mapped.valor_fatura);
    const pixKey = String(mapped.order_pix_key ?? "").trim();
    const pixKeyType = String(mapped.order_pix_key_type ?? "")
      .trim()
      .toUpperCase();

    // `key` e `key_type` sao OBRIGATORIOS para a Meta dentro de
    // `pix_dynamic_code`. Ate aqui os dois eram opcionais e o tipo era
    // ADIVINHADO pelo formato da chave (`inferPixKeyType`, removido). As duas
    // coisas produziam o mesmo desfecho: o NotificaMe aceitava o disparo com
    // `status: queued` e HTTP 200, e a Meta recusava depois —
    //
    //   CODE: 100 — violated JSON schema constraint 'required'
    //   ... missing 'key_type' ... missing 'key'
    //
    // — sem ninguem ver. Adivinhar era pior ainda que omitir: 11 digitos e CPF
    // e telefone sem DDI ao mesmo tempo, e o tipo errado gera um payload que a
    // Meta ACEITA e o banco do cliente recusa. O tipo vem de quem configurou a
    // chave (`resolverChavePix`), ou o botao nao e montado.
    const faltando: string[] = [];
    if (!referenceId) faltando.push("numero_contrato");
    if (!pixCode) faltando.push("code_pix");
    if (!merchantName) faltando.push("order_pix_merchant_name");
    if (amountCents <= 0) faltando.push("valor_fatura");

    const problemaDeChave: string[] = [];
    if (!pixKey) problemaDeChave.push("order_pix_key");
    if (!pixKeyType) problemaDeChave.push("order_pix_key_type");
    else if (!ehTipoChavePix(pixKeyType)) {
      problemaDeChave.push(`order_pix_key_type invalido ("${pixKeyType}")`);
    }

    if (faltando.length || problemaDeChave.length) {
      this.logger.warn(
        `[Dispatch] Botao ORDER_DETAILS nao montado para o cliente ` +
          `${contexto.clientId || "?"} da empresa ${contexto.companyId || "?"}: ` +
          `${[...faltando, ...problemaDeChave].join(", ")}. A Meta recusaria o ` +
          `disparo depois de aceito, entao o destinatario foi PULADO.` +
          (problemaDeChave.length
            ? " Configure a chave em PATCH /companies/:id -> pagamento."
            : ""),
      );
      return null;
    }

    const itemName = String(mapped.order_item_name ?? "Fatura").trim();
    const itemDescription = String(mapped.order_item_description ?? "").trim();
    const buildAmount = (value: number) => ({ value, offset: 100 });

    const orderDetails = {
      reference_id: referenceId,
      type: "digital-goods",
      payment_type: "br",
      payment_settings: [
        {
          type: "pix_dynamic_code",
          pix_dynamic_code: {
            code: pixCode,
            merchant_name: merchantName,
            key: pixKey,
            key_type: pixKeyType,
          },
        },
      ],
      currency: "BRL",
      total_amount: buildAmount(amountCents),
      order: {
        status: "pending",
        items: [
          {
            retailer_id: referenceId,
            name: itemName,
            ...(itemDescription ? { description: itemDescription } : {}),
            quantity: 1,
            amount: buildAmount(amountCents),
          },
        ],
        subtotal: buildAmount(amountCents),
      },
    };

    return {
      type: "button",
      sub_type: "order_details",
      index: Number(button?.index ?? buttonIndex),
      parameters: [{ type: "action", action: { order_details: orderDetails } }],
    };
  }

  private buildButtonComponent(
    button: BlueprintButton,
    buttonIndex: number,
    buttonType: string,
    mapped: MappedScalar,
  ): MessageQueuePayload["components"][number] | null {
    const paramValue =
      buttonType === "URL"
        ? String(mapped.link_boleto_pdf ?? "").trim()
        : String(
            mapped.code_pix ??
              mapped.codigo_qr_code ??
              mapped.codigo_qr ??
              mapped.codigo_pix ??
              mapped.linha_digitavel_boleto ??
              "",
          ).trim();

    if (!paramValue) return null;

    return {
      type: "button",
      sub_type: buttonType === "URL" ? "url" : "copy_code",
      index: Number(button?.index ?? buttonIndex),
      parameters: [{ type: "text", text: paramValue }],
    };
  }

  private getOrderedTemplateVariableKeys(
    templateVariables: Templates["variables"],
  ): string[] {
    const parsed = this.parseTemplateVars(templateVariables);
    return Object.keys(parsed)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => String(parsed[k] ?? "").trim())
      .filter(Boolean);
  }

  private applyOrderDetailsReferenceId(
    components: MessageQueuePayload["components"],
    templateVariables: Templates["variables"],
    contractNumber?: string,
  ): MessageQueuePayload["components"] {
    const cn =
      contractNumber?.trim() ||
      this.extractBodyVariableValue(
        components,
        templateVariables,
        "numero_contrato",
      );
    if (!cn) return components;

    return components.map((component) => {
      const componentType = String(component?.type ?? "").toUpperCase();
      const subType = String(component?.sub_type ?? "").toUpperCase();
      if (componentType !== "BUTTON" || subType !== "ORDER_DETAILS")
        return component;

      const parameters = Array.isArray(component.parameters)
        ? component.parameters
        : [];
      const nextParameters = parameters.map((parameter) => {
        const action =
          parameter && typeof parameter === "object"
            ? (parameter as { action?: Record<string, unknown> }).action
            : undefined;
        const orderDetails =
          action && typeof action === "object"
            ? (action.order_details as Record<string, unknown> | undefined)
            : undefined;
        if (!orderDetails || typeof orderDetails !== "object") return parameter;

        const order =
          orderDetails.order && typeof orderDetails.order === "object"
            ? (orderDetails.order as Record<string, unknown>)
            : undefined;
        const items = Array.isArray(order?.items)
          ? order.items.map((item) =>
              item && typeof item === "object"
                ? { ...(item as Record<string, unknown>), retailer_id: cn }
                : item,
            )
          : undefined;

        return {
          ...parameter,
          action: {
            ...action,
            order_details: {
              ...orderDetails,
              reference_id: cn,
              ...(order
                ? {
                    order: {
                      ...order,
                      ...(items ? { items } : {}),
                    },
                  }
                : {}),
            },
          },
        };
      });

      return { ...component, parameters: nextParameters };
    });
  }

  private extractBodyVariableValue(
    components: MessageQueuePayload["components"],
    templateVariables: Templates["variables"],
    variableName: string,
  ): string {
    const orderedVariableKeys =
      this.getOrderedTemplateVariableKeys(templateVariables);
    const variableIndex = orderedVariableKeys.findIndex(
      (key) => key === variableName,
    );
    if (variableIndex < 0) return "";

    const bodyComponent = components.find(
      (component) => String(component?.type ?? "").toUpperCase() === "BODY",
    );
    if (!bodyComponent || !Array.isArray(bodyComponent.parameters)) return "";

    return String(bodyComponent.parameters[variableIndex]?.text ?? "").trim();
  }
}
