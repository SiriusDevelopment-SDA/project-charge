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
  components?: Array<Record<string, unknown>>;
  isEnabled: boolean;
};

export type OrderDetailsPixPayment = {
  type: "pix_dynamic_code" | "pix_static_code";
  pix_dynamic_code?: {
    merchant_name: string;
    key: string;
    key_type: "CNPJ" | "CPF" | "EMAIL" | "PHONE";
  };
  pix_static_code?: {
    merchant_name: string;
    key: string;
    key_type: "CNPJ" | "CPF" | "EMAIL" | "PHONE";
  };
};

export type OrderDetailsItem = {
  retailer_id: string;
  name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  currency: string;
};

export type OrderDetailsData = {
  reference_id: string;
  type: "digital-goods" | "services" | "physical-goods";
  payment_type: "br";
  payment_settings: OrderDetailsPixPayment[];
  currency: string;
  total_amount: number;
  amount_offset: number;
  order: {
    status: "pending_payment";
    subtotal: number;
    tax: number;
    discount: number;
    shipping: number;
    items: OrderDetailsItem[];
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
  type: "BODY" | "HEADER" | "FOOTER" | "BUTTON" | "BUTTONS";
  sub_type?: string;
  index?: string;
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
