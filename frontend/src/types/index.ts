import type { 
  Cliente, 
  IClientsContext, 
  responseClients 
} from "./clientApiTypes";

import type { 
  FilterButtonProps,
  Lead, 
  MyInputProps, 
  PaginationProps, 
  PropsCardTemplates, 
  PropsSelect, 
  TemplateBalloonCardProps, 
  UploadButtonProps, 
  propAmostras, 
  propTemplate
} from "./componentsTypes";

import type {
  IDispatchTemplateContext, 
  mappedVars 
} from "./dispatchApiTypes";

import type {
  IHistoricoContext,
  responseHistorico,
  history
} from "./historyApiTypes";

import type {
  BatchStatus, 
  CodePix, 
  CodePixStatus, 
  Invoice, 
  InvoiceBatchResponse, 
  InvoiceError,
  InvoiceStatus,
  InvoicesResponse, 
  InvoicesStatus,
  ResultInvoices 
} from "./invoiceApiTypes";

import type {
  Template, 
  ITemplatesContext, 
  SendTemplate, 
  TemplateComponent,
  TemplateParameter,
  TemplateRecipient, 
  responseTemplate 
} from "./templateApiTypes";

export type 
{ Cliente, 
  responseClients,
  responseHistorico,
  FilterButtonProps, 
  history, 
  Lead, 
  MyInputProps, 
  PaginationProps, 
  PropsCardTemplates, 
  PropsSelect, 
  TemplateBalloonCardProps, 
  UploadButtonProps, 
  propAmostras, 
  propTemplate,
  mappedVars,
  Template, 
  SendTemplate, 
  TemplateComponent,
  TemplateParameter,
  TemplateRecipient, 
  responseTemplate,
  BatchStatus, 
  CodePix, 
  CodePixStatus, 
  Invoice, 
  InvoiceBatchResponse, 
  InvoiceError,
  InvoiceStatus,
  InvoicesResponse, 
  InvoicesStatus,
  ResultInvoices,
  IHistoricoContext,
  IClientsContext,
  IDispatchTemplateContext,
  ITemplatesContext,
};

export type CampaignData = {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'finished';
  startDate: string;
  endDate: string;
  dispatchStartTime: string;
  dispatchEndTime: string;
  timezone: string;
  recurring: boolean;
  createdAt: string;
  updatedAt?: string;
  isEnabled?: boolean;
  message?: string;
  category?: { id: string; name: string } | null;
  template?: { id: string; name: string; message?: string } | null;
  company?: { id: string; name: string } | null;
};

export type PropsCardCampanhas = {
  campanha: CampaignData;
  onDelete: (campanha: CampaignData) => void;
};
