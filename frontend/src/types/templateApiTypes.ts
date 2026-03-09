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

export type TemplateParameter = {
  type: "text" | "currency" | "date_time" | "image" | "document";
  text?: string;
  document?: { link: string; filename?: string };
  image?: { link: string };
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
