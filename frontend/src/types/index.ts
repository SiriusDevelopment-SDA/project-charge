import type { 
  Cliente, 
  IClientsContext, 
  responseClients,
  Service
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
  TemplateSearchResponse
} from "./templateApiTypes";

import type {
  CampaignData,
  CampaignMetrics,
  CollectionsMetrics,
  Category,
  PropsCardCampanhas
} from "./champaignApiTypes"
type DropdownType = "template" | "category" | "client" | null;
export type 
{ Cliente,
  DropdownType, 
  responseClients,
  responseHistorico,
  FilterButtonProps, 
  history,
  Category, 
  Lead, 
  CampaignData,
  CampaignMetrics,
  CollectionsMetrics,
  Service,
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
  TemplateSearchResponse,
  BatchStatus, 
  CodePix,
  PropsCardCampanhas, 
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

