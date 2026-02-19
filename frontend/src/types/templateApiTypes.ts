import type { SetStateAction } from "react";
type company = {
    id: string;
    name: string;
    account: string
  }
export type Template = {
    [x: string]: unknown;
    id: string;
    name: string;
    message: string;
    category: string;
    active: boolean;
    company: company;
    meta_status: string;
    createdAt: Date;
    updatedAt: Date;
    variables: Record<string, string>;
    isEnabled: boolean;
  };
  

export type TemplateParameter = {
    type: "text" | "currency" | "date_time" | "image" | "document"
    text: string;
};

export type TemplateComponent = {
    type: "BODY" | "HEADER" | "FOOTER";
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
export type responseTemplate = {
    filter(arg0: (template: { isEnabled: any; }) => any): unknown;
    data: Template[];
    limit: number;
    page: number;
    total: number;
  }
export interface ITemplatesContext {
    templates: Template[] | [];
    categoryTemplateFilter: string | null;
    setCategoryTemplateFilter: React.Dispatch<SetStateAction<string | null>>;
    searchTemplateName: string;
    setSearchTemplateName: React.Dispatch<SetStateAction<string>>;
    setQuery: React.Dispatch<SetStateAction<string>>;
    setPage: React.Dispatch<SetStateAction<number>>;
    setLimit: React.Dispatch<SetStateAction<number>>;
    setOrder: React.Dispatch<SetStateAction<"DESC" | "ASC">>;
    page: number;
    deleteTemplate: (id: string) => Promise<{ success: boolean; error?: any }>;
  }
  