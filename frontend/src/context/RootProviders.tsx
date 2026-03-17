import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "../lib/queryClient";
import { DispatchTemplateProvider } from "./contextDisparo";
import { CampaignProvider } from "./contextCampaigns";

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <DispatchTemplateProvider>
        <CampaignProvider>{children}</CampaignProvider>
      </DispatchTemplateProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
