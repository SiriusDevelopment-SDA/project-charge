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
  DispatchBatchStatus,
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
  InvoiceClientData,
  Invoice, 
  InvoiceBatchResponse, 
  InvoiceError,
  InvoiceRuleFilter,
  InvoiceRuleOperator,
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
  TemplateSearchResponse,
  OrderDetailsData,
  OrderDetailsPixPayment,
  OrderDetailsItem,
  OrderDetailsAction,
} from "./templateApiTypes";

import type {
  CampaignData,
  CampaignMetrics,
  CollectionsMetrics,
  Category,
  RecurringType,
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
  RecurringType,
  Service,
  MyInputProps, 
  PaginationProps, 
  PropsCardTemplates, 
  PropsSelect, 
  TemplateBalloonCardProps, 
  UploadButtonProps, 
  propAmostras, 
  propTemplate,
  DispatchBatchStatus,
  mappedVars,
  Template,
  SendTemplate, 
  TemplateComponent,
  TemplateParameter,
  TemplateRecipient,
  TemplateSearchResponse,
  OrderDetailsData,
  OrderDetailsPixPayment,
  OrderDetailsItem,
  OrderDetailsAction,
  BatchStatus, 
  CodePix,
  CodePixStatus, 
  InvoiceClientData,
  Invoice, 
  InvoiceBatchResponse, 
  InvoiceError,
  InvoiceRuleFilter,
  InvoiceRuleOperator,
  InvoiceStatus,
  InvoicesResponse, 
  InvoicesStatus,
  ResultInvoices,
  IHistoricoContext,
  IClientsContext,
  IDispatchTemplateContext,
  ITemplatesContext,
};

