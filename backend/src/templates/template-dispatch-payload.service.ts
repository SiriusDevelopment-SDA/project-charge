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
import { InvoiceMapResultDto } from "../invoices/dto/search.request.dto.invoices";

export type DispatchSkipReason =
  | "missing_contact"
  | "missing_client_or_invoice"
  | "invoice_not_open_in_erp"
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

type TemplateVars = Record<string, string>;
type BlueprintComponent = Record<string, unknown>;
type BlueprintButton = Record<string, unknown>;
type MappedScalar = Record<string, string | undefined>;

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

  async buildQueueRecipients(
    template: Templates,
    _companyId: string,
    rows: Record<string, unknown>[],
  ): Promise<BuildQueueRecipientsResult> {
    if (!rows.length) return { recipients: [], skips: [] };

    const requiresInvoice = this.templateRequiresInvoiceData(template);
    const clientIds = [
      ...new Set(
        rows.map((r) => String(r.clientId ?? "").trim()).filter(Boolean),
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
            }
          } catch (e) {
            this.logger.warn(
              `ERP preload falhou client=${cid} erp=${erp}: ${e instanceof Error ? e.message : e}`,
            );
          }
        }),
      );
    }

    const templateVars = this.parseTemplateVars(template.variables);
    const templateComponents = this.normalizeComponents(template.components);

    const out: MessageQueuePayload[] = [];
    const skips: DispatchSkipRecord[] = [];

    for (const row of rows) {
      const number = String(row.whatsapp ?? row.number ?? "").replace(
        /\D/g,
        "",
      );
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
            `ixcMapSize=${ixcMap?.size ?? "no-entry"} hubListLen=${hubList?.length ?? "no-entry"} sgpListLen=${sgpList?.length ?? "no-entry"} mkListLen=${mkList?.length ?? "no-entry"}`,
        );

        const fresh = await this.buildDispatchScalars(
          client,
          erp,
          invoiceId,
          ixcMap,
          hubList,
          sgpList,
          mkList,
        );
        if (!fresh) {
          skips.push({
            reason: "invoice_not_open_in_erp",
            number,
            name,
            clientId,
            invoiceId,
            detail:
              "Nenhuma fatura em aberto encontrada no ERP para este cliente no momento do disparo.",
          });
          continue;
        }
        merged = { ...merged, ...fresh };

        // Garante campos da empresa para montagem do botão ORDER_DETAILS.
        // Usa como fallback — não sobrescreve valor já presente no snapshot.
        const companyName = String(client.company?.name ?? "")
          .trim()
          .toLowerCase();
        const companyCnpj = String(client.company?.cnpj ?? "").replace(
          /\D/g,
          "",
        );
        if (!merged.nome_empresa && companyName)
          merged.nome_empresa = companyName;
        if (!merged.order_pix_merchant_name && companyName)
          merged.order_pix_merchant_name = companyName;
        if (!merged.order_pix_key && companyCnpj) {
          merged.order_pix_key = companyCnpj;
          merged.order_pix_key_type = "CNPJ";
        }
      }

      const built = this.buildRecipientFromBlueprint(
        templateVars,
        templateComponents,
        merged,
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

    return null;
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
        const oc = this.buildOrderDetailsComponent(button, i, mapped);
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

    if (!referenceId || !pixCode) {
      this.logger.log(
        `[Dispatch] ORDER_DETAILS falhou: referenceId="${referenceId}" pixCode="${pixCode}" ` +
          `code_pix="${mapped.code_pix}" codigo_qr="${mapped.codigo_qr}" valor_fatura="${mapped.valor_fatura}"`,
      );
      return null;
    }

    const merchantName = String(
      mapped.order_pix_merchant_name ?? mapped.nome_empresa ?? "",
    ).trim();
    const pixKeyCandidate = String(mapped.order_pix_key ?? "").trim();
    const explicitPixKeyType = String(mapped.order_pix_key_type ?? "")
      .trim()
      .toUpperCase();
    const amountCents = this.parseAmountToCents(mapped.valor_fatura);
    const itemName = String(mapped.order_item_name ?? "Fatura").trim();
    const itemDescription = String(mapped.order_item_description ?? "").trim();

    if (amountCents <= 0) return null;

    const buildAmount = (value: number) => ({ value, offset: 100 });

    type PixKeyType = "CNPJ" | "CPF" | "EMAIL" | "PHONE" | "RANDOM";
    const inferPixKeyType = (key: string): PixKeyType | null => {
      const digits = key.replace(/\D/g, "");
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return "EMAIL";
      if (digits.length === 14) return "CNPJ";
      if (digits.length === 11) return "CPF";
      if (digits.length >= 10 && digits.length <= 13) return "PHONE";
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          key,
        )
      )
        return "RANDOM";
      return null;
    };

    const inferredPixKeyType = inferPixKeyType(pixKeyCandidate);
    const VALID: PixKeyType[] = ["CNPJ", "CPF", "EMAIL", "PHONE", "RANDOM"];
    const isValidExplicit = VALID.includes(explicitPixKeyType as PixKeyType);
    const shouldIncludePixKey =
      pixKeyCandidate.length > 0 &&
      (isValidExplicit || inferredPixKeyType !== null);
    const resolvedPixKeyType: PixKeyType | null = isValidExplicit
      ? (explicitPixKeyType as PixKeyType)
      : inferredPixKeyType;

    const pixDynamicCode: Record<string, unknown> = {
      code: pixCode,
      merchant_name: merchantName,
      ...(shouldIncludePixKey && resolvedPixKeyType
        ? { key: pixKeyCandidate, key_type: resolvedPixKeyType }
        : {}),
    };

    const orderDetails = {
      reference_id: referenceId,
      type: "digital-goods",
      payment_type: "br",
      payment_settings: [
        { type: "pix_dynamic_code", pix_dynamic_code: pixDynamicCode },
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
