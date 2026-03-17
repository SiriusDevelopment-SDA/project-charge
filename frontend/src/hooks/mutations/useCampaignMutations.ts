import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import type { CampaignData } from "../../types";
import type { CampaignUpdate } from "../../types/champaignApiTypes";
import { queryKeys } from "../../lib/queryKeys";
import { CampaignService } from "../../services/campaign/campaign.service";
import { useAccountParam } from "../useAccountParam";
import { getErrorMessage } from "../../utils/error";

export function useDeleteCampaignMutation() {
  const queryClient = useQueryClient();
  const account = useAccountParam() ?? "";

  return useMutation({
    mutationFn: (id: string) => CampaignService.remove(id),
    onSuccess: (result, id) => {
      if (!result?.success) return;

      queryClient.setQueryData<CampaignData[]>(
        queryKeys.campaigns.all(account),
        (prev) => (prev ?? []).filter((c) => c.id !== id),
      );

      void queryClient.invalidateQueries({
        queryKey: queryKeys.campaigns.metrics(account),
      });

      toast.success("Campanha deletada com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao deletar campanha."));
    },
  });
}

export function useUpdateCampaignStatusMutation() {
  const queryClient = useQueryClient();
  const account = useAccountParam() ?? "";

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CampaignUpdate }) =>
      CampaignService.update(id, payload),
    onSuccess: (_, { id, payload }) => {
      queryClient.setQueryData<CampaignData[]>(
        queryKeys.campaigns.all(account),
        (prev) =>
          (prev ?? []).map((c) => (c.id === id ? { ...c, ...payload } : c)),
      );
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao atualizar status da campanha."));
    },
  });
}
