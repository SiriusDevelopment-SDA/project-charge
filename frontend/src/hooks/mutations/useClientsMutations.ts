import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import type { Cliente, InvoiceError, InvoicesResponse } from "../../types";
import { ClientService } from "../../services/client/client.service";
import { getErrorMessage } from "../../utils/error";
import { normalizeDoc } from "../../utils/document";

type InvoicesMutationResult = {
  updatedClients: Cliente[];
  invoicesByDoc: Record<string, InvoicesResponse>;
};

export function useFetchInvoicesMutation() {
  const queryClient = useQueryClient();

  return useMutation<InvoicesMutationResult, Error, Cliente[]>({
    mutationFn: async (targetClients) => {
      const response = await ClientService.searchInvoices(
        targetClients.map((c) => c.cnpj_cpf),
      );

      const { data: providers, errors, status, message } = response.data;

      const invoicesByDoc = providers.reduce<Record<string, InvoicesResponse>>(
        (acc, provider) => {
          acc[normalizeDoc(provider.document)] = provider.invoices;
          return acc;
        },
        {},
      );

      if (status === "success") toast.success(message);
      if (status === "partial") toast.warning(message);
      if (status === "error") toast.error(message);

      errors?.forEach((error: InvoiceError) => {
        toast.warning(`Cliente do documento: ${error.document} ${error.reason}`);
      });

      const updatedClients = targetClients.map((client) => ({
        ...client,
        invoices: invoicesByDoc[normalizeDoc(client.cnpj_cpf)] ?? client.invoices,
      }));

      return { updatedClients, invoicesByDoc };
    },
    onSuccess: ({ invoicesByDoc }) => {
      queryClient.setQueriesData<Cliente[]>(
        { queryKey: ["clients"], exact: false },
        (prev) =>
          (prev ?? []).map((client) => ({
            ...client,
            invoices: invoicesByDoc[normalizeDoc(client.cnpj_cpf)] ?? client.invoices,
          })),
      );
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao buscar faturas."));
    },
  });
}
