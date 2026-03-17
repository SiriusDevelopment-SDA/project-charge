import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Api } from "../../services/api";
import { useAccountParam } from "../useAccountParam";
import { getErrorMessage } from "../../utils/error";

export function useDeleteTemplateMutation() {
  const queryClient = useQueryClient();
  const account = useAccountParam() ?? "";

  return useMutation({
    mutationFn: (id: string) => Api.post("/templates/delete", { templateId: id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["templates", account],
      });
      toast.success("Template deletado com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao deletar template."));
    },
  });
}
