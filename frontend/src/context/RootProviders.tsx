import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "../lib/queryClient";
import { DispatchTemplateProvider } from "./contextDisparo";
import { CampaignProvider } from "./contextCampaigns";
import { InvoiceProvider } from "./contextInvoices";
import { GlobalLoadingProvider } from "./contextGlobalLoading";
import { ActiveCompanyProvider } from "./contextActiveCompany";

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalLoadingProvider>
        <ActiveCompanyProvider>
          <DispatchTemplateProvider>
            <CampaignProvider>
              <InvoiceProvider>{children}</InvoiceProvider>
            </CampaignProvider>
          </DispatchTemplateProvider>
        </ActiveCompanyProvider>
      </GlobalLoadingProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
