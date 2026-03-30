import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "../lib/queryClient";
import { DispatchTemplateProvider } from "./contextDisparo";
import { CampaignProvider } from "./contextCampaigns";
import { GlobalLoadingProvider } from "./contextGlobalLoading";

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalLoadingProvider>
        <DispatchTemplateProvider>
          <CampaignProvider>{children}</CampaignProvider>
        </DispatchTemplateProvider>
      </GlobalLoadingProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
