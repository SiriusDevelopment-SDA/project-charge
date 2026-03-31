import type { OrderDetailsData, Template, TemplateRecipient, mappedVars } from "../types";
import { normalizeTemplateVars, parseAmountToCents } from "./templateVars.mapper";

type TemplateButtonBlueprint = {
  type?: string;
  sub_type?: string;
  index?: string | number;
  text?: string;
  url?: string;
};

type TemplateComponentBlueprint = {
  type?: string;
  format?: string;
  buttons?: TemplateButtonBlueprint[];
  sub_type?: string;
  index?: string | number;
};

type ComponentParameter =
  | { type: "text"; text: string }
  | { type: "document"; document: { link: string; filename?: string } }
  | { type: "action"; action: { order_details: OrderDetailsData } };

type BuiltComponent = {
  type: "BODY" | "HEADER" | "button";
  parameters: ComponentParameter[];
  sub_type?: "url" | "copy_code" | "order_details";
  index?: number;
};

type PixKeyType = "CNPJ" | "CPF" | "EMAIL" | "PHONE" | "RANDOM";

function normalizeComponents(components: Template["components"]): TemplateComponentBlueprint[] {
  if (Array.isArray(components)) {
    return components as TemplateComponentBlueprint[];
  }

  if (typeof components === "string") {
    try {
      return normalizeComponents(JSON.parse(components) as Template["components"]);
    } catch {
      return [];
    }
  }

  if (components && typeof components === "object" && Array.isArray(components.components)) {
    return components.components as TemplateComponentBlueprint[];
  }

  return [];
}

function extractButtonsBlueprint(components: TemplateComponentBlueprint[]): TemplateButtonBlueprint[] {
  return components
    .filter((c) => {
      const type = String(c?.type ?? "").toUpperCase();
      return type === "BUTTON" || type === "BUTTONS";
    })
    .flatMap((c) =>
      Array.isArray(c?.buttons)
        ? c.buttons
        : c?.sub_type
          ? [{ type: c.sub_type, index: c.index }]
          : []
    );
}

function buildOrderDetailsComponent(
  button: TemplateButtonBlueprint,
  buttonIndex: number,
  mappedVar: mappedVars
): BuiltComponent | null {
  const referenceId = String(
    mappedVar.order_reference_id ?? mappedVar.numero_contrato ?? ""
  ).trim();
  const pixCode = String(
    mappedVar.code_pix ??
      mappedVar.codigo_qr_code ??
      mappedVar.codigo_qr ??
      mappedVar.codigo_pix ??
      ""
  ).trim();

  if (!referenceId || !pixCode) {
    console.warn("[ORDER_DETAILS] campos ausentes →", {
      whatsapp: mappedVar.whatsapp,
      referenceId_presente: Boolean(referenceId),
      pixCode_presente: Boolean(pixCode),
      order_reference_id: mappedVar.order_reference_id,
      numero_contrato: mappedVar.numero_contrato,
      code_pix: mappedVar.code_pix,
    });
    return null;
  }

  const merchantName = String(
    mappedVar.order_pix_merchant_name ?? mappedVar.nome_empresa ?? ""
  ).trim();
  const pixKeyCandidate = String(mappedVar.order_pix_key ?? "").trim();
  const explicitPixKeyType = String(mappedVar.order_pix_key_type ?? "")
    .trim()
    .toUpperCase();
  const amountCents = parseAmountToCents(mappedVar.valor_fatura);
  const itemName = String(mappedVar.order_item_name ?? "Fatura").trim();
  const itemDescription = String(mappedVar.order_item_description ?? "").trim();

  if (amountCents <= 0) {
    console.warn("[ORDER_DETAILS] valor_fatura ausente ou zero →", {
      whatsapp: mappedVar.whatsapp,
      valor_fatura: mappedVar.valor_fatura,
    });
    return null;
  }

  const buildAmount = (value: number) => ({
    value,
    offset: 100,
  });

  const inferPixKeyType = (key: string): PixKeyType | null => {
    const digits = key.replace(/\D/g, "");

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return "EMAIL";
    if (digits.length === 14) return "CNPJ";
    if (digits.length === 11) return "CPF";
    if (digits.length >= 10 && digits.length <= 13) return "PHONE";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return "RANDOM";

    return null;
  };

  const inferredPixKeyType = inferPixKeyType(pixKeyCandidate);
  const VALID_PIX_KEY_TYPES: PixKeyType[] = ["CNPJ", "CPF", "EMAIL", "PHONE", "RANDOM"];
  const isValidExplicitType = VALID_PIX_KEY_TYPES.includes(explicitPixKeyType as PixKeyType);

  const shouldIncludePixKey =
    pixKeyCandidate.length > 0 &&
    (isValidExplicitType || inferredPixKeyType !== null);

  const resolvedPixKeyType: PixKeyType | null = isValidExplicitType
    ? (explicitPixKeyType as PixKeyType)
    : inferredPixKeyType;

  const pixDynamicCode = {
    code: pixCode,
    merchant_name: merchantName,
    ...(shouldIncludePixKey && resolvedPixKeyType
      ? {
          key: pixKeyCandidate,
          key_type: resolvedPixKeyType,
        }
      : {}),
  };

  const orderDetails: OrderDetailsData = {
    reference_id: referenceId,
    type: "digital-goods",
    payment_type: "br",
    payment_settings: [
      {
        type: "pix_dynamic_code",
        pix_dynamic_code: pixDynamicCode,
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

function buildButtonComponent(
  buttonIndex: number,
  buttonType: string,
  mappedVar: mappedVars
): BuiltComponent | null {
  const paramValue =
    buttonType === "URL"
      ? String(mappedVar.link_boleto_pdf ?? "").trim()
      : String(
          mappedVar.code_pix ??
            mappedVar.codigo_qr_code ??
            mappedVar.codigo_qr ??
            mappedVar.codigo_pix ??
            mappedVar.linha_digitavel_boleto ??
            ""
        ).trim();

  if (!paramValue) return null;

  return {
    type: "button",
    sub_type: buttonType === "URL" ? "url" : "copy_code",
    index: Number(button?.index ?? buttonIndex),
    parameters: [{ type: "text", text: paramValue }],
  };
}

/**
 * Transforma a lista de variáveis mapeadas no array de destinatários
 * com os componentes prontos para envio à API Meta via NotificaMe.
 */
function buildTemplateRecipientFromBlueprint(
  templateVars: Record<string, string>,
  templateComponents: TemplateComponentBlueprint[],
  mappedVar: mappedVars
): TemplateRecipient | null {
  const hasDocumentHeader = templateComponents.some(
    (c) =>
      String(c?.type ?? "").toUpperCase() === "HEADER" &&
      String(c?.format ?? "").toUpperCase() === "DOCUMENT"
  );

  const buttonsBlueprint = extractButtonsBlueprint(templateComponents);

  const bodyParameters = Object.keys(templateVars)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => ({
      type: "text" as const,
      text: String(mappedVar[templateVars[key] as keyof mappedVars] ?? ""),
    }));

  if (bodyParameters.some((p) => !p.text.trim())) return null;

  const components: BuiltComponent[] = [{ type: "BODY", parameters: bodyParameters }];

  if (hasDocumentHeader) {
    const pdfLink = String(mappedVar.link_boleto_pdf ?? "").trim();
    if (pdfLink) {
      components.push({
        type: "HEADER",
        parameters: [{ type: "document", document: { link: pdfLink, filename: "fatura.pdf" } }],
      });
    }
  }

  for (let i = 0; i < buttonsBlueprint.length; i++) {
    const button = buttonsBlueprint[i];
    const buttonType = String(button?.type ?? button?.sub_type ?? "").toUpperCase();

    if (buttonType === "QUICK_REPLY") continue;

    if (buttonType === "ORDER_DETAILS") {
      const component = buildOrderDetailsComponent(button, i, mappedVar);
      if (!component) {
        console.warn(
          "[templateRecipient] ORDER_DETAILS ignorado para destinatario",
          mappedVar.whatsapp,
          "— verifique valor_fatura, code_pix e order_reference_id/numero_contrato",
        );
        return null;
      }
      components.push(component);
      continue;
    }

    const component = buildButtonComponent(i, buttonType, mappedVar);
    if (!component && buttonType === "URL") {
      console.warn(
        "[templateRecipient] botao URL ignorado para destinatario",
        mappedVar.whatsapp,
        "- verifique se link_boleto_pdf foi preenchido",
        {
          boletoLink: mappedVar.link_boleto_pdf,
          templateUrl: button?.url,
        },
      );
      return null;
    }

    if (component) components.push(component);
  }

  return {
    name: mappedVar.nome_cliente ?? "",
    number: mappedVar.whatsapp ?? "",
    components,
  };
}

export function buildTemplateRecipient(template: Template, mappedVar: mappedVars) {
  const templateVars = normalizeTemplateVars(template.variables);
  const templateComponents = normalizeComponents(template.components);

  return buildTemplateRecipientFromBlueprint(templateVars, templateComponents, mappedVar);
}

export function buildTemplateRecipients(template: Template, mappedVarsList: mappedVars[]) {
  const templateVars = normalizeTemplateVars(template.variables);
  const templateComponents = normalizeComponents(template.components);

  return mappedVarsList
    .map((mappedVar) =>
      buildTemplateRecipientFromBlueprint(templateVars, templateComponents, mappedVar)
    )
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}
