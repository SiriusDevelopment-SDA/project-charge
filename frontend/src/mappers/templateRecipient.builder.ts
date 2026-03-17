import type { OrderDetailsData, Template, mappedVars } from "../types";
import { normalizeTemplateVars, parseAmountToCents } from "./templateVars.mapper";

type TemplateButtonBlueprint = {
  type?: string;
  sub_type?: string;
  index?: string | number;
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
  type: "BODY" | "HEADER" | "BUTTON";
  parameters: ComponentParameter[];
  sub_type?: "URL" | "COPY_CODE" | "ORDER_DETAILS";
  index?: string;
};

function normalizeComponents(components: Template["components"]): TemplateComponentBlueprint[] {
  if (!Array.isArray(components)) return [];
  return components as TemplateComponentBlueprint[];
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
  const pixKey = String(mappedVar.order_pix_key ?? "").trim();

  if (!referenceId || !pixKey) return null;

  const merchantName = String(
    mappedVar.order_pix_merchant_name ?? mappedVar.nome_empresa ?? ""
  ).trim();
  const pixKeyType = String(mappedVar.order_pix_key_type ?? "CNPJ")
    .trim()
    .toUpperCase() as "CNPJ" | "CPF" | "EMAIL" | "PHONE";
  const amountCents = parseAmountToCents(mappedVar.valor_fatura);
  const itemName = String(mappedVar.order_item_name ?? "Fatura").trim();
  const itemDescription = String(mappedVar.order_item_description ?? "").trim();

  const orderDetails: OrderDetailsData = {
    reference_id: referenceId,
    type: "digital-goods",
    payment_type: "br",
    payment_settings: [
      {
        type: "pix_dynamic_code",
        pix_dynamic_code: { merchant_name: merchantName, key: pixKey, key_type: pixKeyType },
      },
    ],
    currency: "BRL",
    total_amount: amountCents,
    amount_offset: 100,
    order: {
      status: "pending_payment",
      subtotal: amountCents,
      tax: 0,
      discount: 0,
      shipping: 0,
      items: [
        {
          retailer_id: referenceId,
          name: itemName,
          ...(itemDescription ? { description: itemDescription } : {}),
          quantity: 1,
          unit_price: amountCents,
          currency: "BRL",
        },
      ],
    },
  };

  return {
    type: "BUTTON",
    sub_type: "ORDER_DETAILS",
    index: String(button?.index ?? buttonIndex),
    parameters: [{ type: "action", action: { order_details: orderDetails } }],
  };
}

function buildButtonComponent(
  button: TemplateButtonBlueprint,
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
    type: "BUTTON",
    sub_type: buttonType === "URL" ? "URL" : "COPY_CODE",
    index: String(button?.index ?? buttonIndex),
    parameters: [{ type: "text", text: paramValue }],
  };
}

/**
 * Transforma a lista de variáveis mapeadas no array de destinatários
 * com os componentes prontos para envio à API Meta via NotificaMe.
 */
export function buildTemplateRecipients(template: Template, mappedVarsList: mappedVars[]) {
  const templateVars = normalizeTemplateVars(template.variables);
  const templateComponents = normalizeComponents(template.components);

  const hasDocumentHeader = templateComponents.some(
    (c) =>
      String(c?.type ?? "").toUpperCase() === "HEADER" &&
      String(c?.format ?? "").toUpperCase() === "DOCUMENT"
  );

  const buttonsBlueprint = extractButtonsBlueprint(templateComponents);

  return mappedVarsList
    .map((mappedVar) => {
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

      buttonsBlueprint.forEach((button, index) => {
        const buttonType = String(button?.type ?? button?.sub_type ?? "").toUpperCase();

        if (buttonType === "QUICK_REPLY") return;

        if (buttonType === "ORDER_DETAILS") {
          const component = buildOrderDetailsComponent(button, index, mappedVar);
          if (component) components.push(component);
          return;
        }

        const component = buildButtonComponent(button, index, buttonType, mappedVar);
        if (component) components.push(component);
      });

      return {
        name: mappedVar.nome_cliente ?? "",
        number: mappedVar.whatsapp ?? "",
        components,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}
