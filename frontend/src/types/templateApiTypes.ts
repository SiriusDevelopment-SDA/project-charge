import type { SetStateAction } from "react";

type CompanySummary = {
  id: string;
  name: string;
  account: string;
};

export type Template = {
  [x: string]: unknown;
  id: string;
  name: string;
  message: string;
  category: string;
  active: boolean;
  company: CompanySummary;
  meta_status: string;
  createdAt: Date;
  updatedAt: Date;
  variables: Record<string, string>;
  components?:
    | Array<Record<string, unknown>>
    | { components?: Array<Record<string, unknown>> }
    | string;
  isEnabled: boolean;
};

export type OrderDetailsPixPayment = {
  type: "pix_dynamic_code" | "pix_static_code";
  pix_dynamic_code?: {
    code: string;
    merchant_name: string;
    key?: string;
    key_type?: "CNPJ" | "CPF" | "EMAIL" | "PHONE";
  };
  pix_static_code?: {
    code: string;
    merchant_name: string;
    key?: string;
    key_type?: "CNPJ" | "CPF" | "EMAIL" | "PHONE";
  };
};

export type OrderDetailsAmount = {
  value: number;
  offset: number;
};

export type OrderDetailsItem = {
  retailer_id: string;
  name: string;
  description?: string;
  quantity: number;
  amount: OrderDetailsAmount;
};

export type OrderDetailsData = {
  reference_id: string;
  type: "digital-goods" | "services" | "physical-goods";
  payment_type: "br";
  payment_settings: OrderDetailsPixPayment[];
  currency: string;
  total_amount: OrderDetailsAmount;
  order: {
    status: "pending" | "pending_payment";
    items: OrderDetailsItem[];
    subtotal: OrderDetailsAmount;
  };
};

export type OrderDetailsAction = {
  order_details: OrderDetailsData;
};

export type TemplateParameter =
  | {
      type: "text" | "currency" | "date_time" | "image" | "document";
      text?: string;
      document?: { link: string; filename?: string };
      image?: { link: string };
    }
  | {
      type: "action";
      action: OrderDetailsAction;
    };

export type TemplateComponent = {
  type: "BODY" | "HEADER" | "FOOTER" | "button" | "BUTTONS";
  sub_type?: "url" | "copy_code" | "order_details" | "quick_reply";
  index?: number;
  parameters: TemplateParameter[];
};

export type TemplateRecipient = {
  name: string;
  number: string;
  components: TemplateComponent[];
};

export type SendTemplate = {
  templateId: string;
  account: number;
  to: TemplateRecipient[];
};

export type TemplateSearchResponse = {
  data: Template[];
  limit: number;
  page: number;
  total: number;
};

export type TemplateUsageMetric = {
  templateId: string;
  templateName: string;
  historicalUsage: number;
  activeUsage: number;
  totalUsage: number;
  usagePercentage: number;
};

export type TemplateCreateButton = {
  type: "URL" | "COPY_CODE" | "ORDER_DETAILS";
  text: string;
  url?: string;
  example?: string[];
};

export type TemplateCreateComponentExample = {
  body_text?: string[];
};

export type TemplateCreateComponent = {
  type: "BODY" | "HEADER" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  text?: string;
  example?: TemplateCreateComponentExample;
  buttons?: TemplateCreateButton[];
};

export type TemplateCreateRequest = {
  companyId: string;
  name: string;
  language: "pt_BR";
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  displayCategory?: string;
  components: TemplateCreateComponent[];
  variables: Record<string, string>;
};

export type TemplateCreateInput = Omit<TemplateCreateRequest, "companyId">;

export interface ITemplatesContext {
  templates: Template[];
  categoryTemplateFilter: string | null;
  setCategoryTemplateFilter: React.Dispatch<SetStateAction<string | null>>;
  searchTemplateName: string;
  setSearchTemplateName: React.Dispatch<SetStateAction<string>>;
  setQuery: React.Dispatch<SetStateAction<string>>;
  setPage: React.Dispatch<SetStateAction<number>>;
  setLimit: React.Dispatch<SetStateAction<number>>;
  setOrder: React.Dispatch<SetStateAction<"DESC" | "ASC">>;
  page: number;
  categories: string[];
  filteredTemplates: Template[];
  deleteTemplate: (
    id: string
  ) => Promise<{ success: boolean; error?: unknown }>;
}
