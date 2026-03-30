import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { AuthService } from "../../services/auth/auth.service";
import { TemplateService } from "../../services/template/template.service";
import type { TemplateCreateInput } from "../../types/templateApiTypes";
import { useAccountParam } from "../useAccountParam";
import { getErrorMessage } from "../../utils/error";

export function useDeleteTemplateMutation() {
  const queryClient = useQueryClient();
  const account = useAccountParam() ?? "";

  return useMutation({
    mutationFn: (id: string) => TemplateService.remove(id),
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

export function useCreateTemplateMutation() {
  const queryClient = useQueryClient();
  const account = useAccountParam() ?? "";

  return useMutation({
    mutationFn: async (payload: TemplateCreateInput) => {
      const me = await AuthService.me();

      return TemplateService.create({
        ...payload,
        companyId: me.company.id,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["templates", account],
      });
      toast.success("Template criado com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao criar template."));
    },
  });
}
